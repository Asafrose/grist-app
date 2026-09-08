import { create, useStore } from "zustand";
import type { Db, RecordingsFilter } from "@/lib/db";
import { type DefaultView, defaultViewKey, settings, settingsStore } from "@/lib/settings";
import { getTeams } from "@/lib/workspace";

export type View = DefaultView;
export type Scope = "all" | "external" | "internal";
export type DatePreset = "7d" | "30d" | "90d";
export type DateFilter =
  | { preset: DatePreset }
  | { preset: "custom"; from: string | null; to: string | null };

export type SheetFilters = {
  view: View;
  scope: Scope;
  date: DateFilter | null;
  meetingTypeId: string | null;
  participant: string | null;
  tag: string | null;
  recorderId: string | null;
};

export type FilterState = SheetFilters & { title: string };

export const defaultFilters: FilterState = {
  view: { kind: "mine" },
  title: "",
  scope: "all",
  date: null,
  meetingTypeId: null,
  participant: null,
  tag: null,
  recorderId: null,
};

export const filtersStore = create<FilterState>(() => defaultFilters);

export const useFilters = () => useStore(filtersStore);
export const useFilterTitle = () => useStore(filtersStore, (s) => s.title);
export const useFilterView = () => useStore(filtersStore, (s) => s.view);

let teamIds: string[] = [];

export function resolveView(view: DefaultView, ids: readonly string[]): View {
  return view.kind === "team" && ids.length > 0 && !ids.includes(view.id) ? { kind: "mine" } : view;
}

const initialView = (): View => resolveView(settingsStore.getState().defaultView, teamIds);

let teamsDb: Db | null = null;

function readTeamIds(db: Db): void {
  teamIds = getTeams(db).map((t) => t.id);
}

export function hydrateFilters(db: Db): void {
  teamsDb = db;
  readTeamIds(db);
  const stored = settingsStore.getState().defaultView;
  if (resolveView(stored, teamIds) !== stored) settings.set("defaultView", { kind: "mine" });
  filtersStore.setState({ view: initialView() });
}

export function syncFilterTeams(db: Db): void {
  const { view } = filtersStore.getState();
  if (view.kind !== "team" && settingsStore.getState().defaultView.kind !== "team") return;
  readTeamIds(db);
  const resolved = resolveView(view, teamIds);
  if (resolved !== view) filtersStore.setState({ view: resolved });
}

settingsStore.subscribe((s, prev) => {
  if (s.defaultView === prev.defaultView) return;
  if (s.defaultView.kind === "team" && teamsDb) readTeamIds(teamsDb);
  filtersStore.setState({ view: initialView() });
});

export const filters = {
  setTitle: (title: string) => filtersStore.setState({ title }),
  setView: (view: View) => filtersStore.setState({ view }),
  apply: (sheet: SheetFilters) => filtersStore.setState(sheet),
  clear: (key: keyof SheetFilters) =>
    filtersStore.setState({
      [key]: key === "view" ? initialView() : key === "scope" ? "all" : null,
    }),
  reset: () => filtersStore.setState({ ...defaultFilters, view: initialView() }),
  current: () => filtersStore.getState(),
  hydrate: hydrateFilters,
  syncTeams: syncFilterTeams,
};

export const sameView = (a: View, b: View): boolean =>
  a.kind === b.kind && (a.kind !== "team" || b.kind !== "team" || a.id === b.id);

export type ViewOption = { view: View; label: string; key: string; testID: string };

const viewOption = (view: View, label: string): ViewOption => ({
  view,
  label,
  key: defaultViewKey(view),
  testID: view.kind === "team" ? `view-team-${view.id}` : `view-${view.kind}`,
});

export function viewOptions(teams: readonly { id: string; name: string }[]): ViewOption[] {
  return [
    viewOption({ kind: "mine" }, "Mine"),
    viewOption({ kind: "workspace" }, "Workspace"),
    ...teams.map((t) => viewOption({ kind: "team", id: t.id }, t.name)),
  ];
}

export function visibleViews(
  options: readonly ViewOption[],
  selected: View,
  maxTeams = 1,
): { shown: ViewOption[]; hidden: number } {
  const teams = options.filter((o) => o.view.kind === "team");
  const selectedTeam = teams.find((o) => sameView(o.view, selected));
  const rest = teams.filter((o) => o !== selectedTeam).slice(0, maxTeams - (selectedTeam ? 1 : 0));
  return {
    shown: [
      ...options.filter((o) => o.view.kind !== "team"),
      ...(selectedTeam ? [selectedTeam] : []),
      ...rest,
    ],
    hidden: teams.length - (selectedTeam ? 1 : 0) - rest.length,
  };
}

export function sheetFilters(f: FilterState): SheetFilters {
  const { title: _title, ...sheet } = f;
  return sheet;
}

const DAY = 24 * 60 * 60 * 1000;
export const PRESET_DAYS: Record<DatePreset, number> = { "7d": 7, "30d": 30, "90d": 90 };

function startOfDay(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfNextDay(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export function withCustomDate(
  date: DateFilter | null,
  which: "from" | "to",
  value: string,
): DateFilter {
  const current =
    date?.preset === "custom" ? date : { preset: "custom" as const, from: null, to: null };
  const next = { ...current, [which]: value };
  if (next.from && next.to && startOfDay(next.from) > startOfDay(next.to)) {
    return which === "from" ? { ...next, to: null } : { ...next, from: null };
  }
  return next;
}

export function dateBounds(
  date: DateFilter | null,
  now: number,
): { after?: string; before?: string } {
  if (!date) return {};
  if (date.preset !== "custom") {
    return { after: new Date(now - PRESET_DAYS[date.preset] * DAY).toISOString() };
  }
  return {
    after: date.from ? startOfDay(date.from) : undefined,
    before: date.to ? startOfNextDay(date.to) : undefined,
  };
}

export function toQuery(
  f: FilterState,
  ctx: { meEmail: string | null; now?: number },
): RecordingsFilter {
  const q: RecordingsFilter = {
    ...dateBounds(f.date, ctx.now ?? Date.now()),
    scope: f.scope === "all" ? undefined : f.scope,
    title: f.title.trim() || undefined,
    meetingTypeId: f.meetingTypeId ?? undefined,
    participant: f.participant ?? undefined,
    tag: f.tag ?? undefined,
    recorderId: f.recorderId ?? undefined,
  };
  if (f.view.kind === "team") q.teamId = f.view.id;
  if (f.view.kind === "workspace") q.workspace = true;
  if (f.view.kind === "mine" && ctx.meEmail) q.participantEmail = ctx.meEmail;
  return q;
}

export type Chip = { key: keyof SheetFilters; label: string };

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function dateLabel(date: DateFilter | null): string | null {
  if (!date) return null;
  if (date.preset !== "custom") return `Last ${PRESET_DAYS[date.preset]} days`;
  if (date.from && date.to) return `${fmt(date.from)} – ${fmt(date.to)}`;
  if (date.from) return `From ${fmt(date.from)}`;
  if (date.to) return `Until ${fmt(date.to)}`;
  return "Custom dates";
}

export function activeChips(
  f: SheetFilters,
  names: { meetingType?: string | null; recorder?: string | null } = {},
): Chip[] {
  const chips: Chip[] = [];
  if (f.scope !== "all")
    chips.push({ key: "scope", label: f.scope === "external" ? "External" : "Internal" });
  const date = dateLabel(f.date);
  if (date) chips.push({ key: "date", label: date });
  if (f.meetingTypeId)
    chips.push({ key: "meetingTypeId", label: names.meetingType ?? "Meeting type" });
  if (f.participant) chips.push({ key: "participant", label: f.participant });
  if (f.tag) chips.push({ key: "tag", label: `#${f.tag}` });
  if (f.recorderId) chips.push({ key: "recorderId", label: names.recorder ?? "Recorder" });
  return chips;
}

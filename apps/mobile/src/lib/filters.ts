import { create } from "zustand";
import type { RecordingsFilter } from "@/lib/db";

export type View = { kind: "mine" } | { kind: "workspace" } | { kind: "team"; id: string };
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

export const useFilters = () => filtersStore();
export const useFilterTitle = () => filtersStore((s) => s.title);

export const filters = {
  setTitle: (title: string) => filtersStore.setState({ title }),
  setView: (view: View) => filtersStore.setState({ view }),
  apply: (sheet: SheetFilters) => filtersStore.setState(sheet),
  clear: (key: keyof SheetFilters) =>
    filtersStore.setState({
      [key]: key === "view" ? defaultFilters.view : key === "scope" ? "all" : null,
    }),
  reset: () => filtersStore.setState(defaultFilters),
  current: () => filtersStore.getState(),
};

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

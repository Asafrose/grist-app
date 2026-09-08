import {
  activeChips,
  dateBounds,
  dateLabel,
  defaultFilters,
  filters,
  type FilterState,
  sheetFilters,
  toQuery,
  filtersStore,
  hydrateFilters,
  resolveView,
  syncFilterTeams,
  sameView,
  viewOptions,
  visibleViews,
  withCustomDate,
} from "@/lib/filters";
import { seedDemo } from "@/lib/demo";
import { DEFAULT_SETTINGS, settingsStore } from "@/lib/settings";
import { META_TEAMS } from "@/lib/workspace";
import { setMeta } from "@/lib/db";
import { testDb } from "@/test/db";

const NOW = Date.parse("2026-09-06T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => filters.reset());

describe("filters store", () => {
  it("starts on Mine with nothing else active", () => {
    expect(filtersStore.getState()).toEqual(defaultFilters);
    expect(activeChips(filtersStore.getState())).toEqual([]);
  });

  it("updates title and view independently of the sheet", () => {
    filters.setTitle("Fabrikam");
    filters.setView({ kind: "team", id: "t1" });
    expect(filtersStore.getState()).toMatchObject({
      title: "Fabrikam",
      view: { kind: "team", id: "t1" },
    });
    filters.apply({ ...sheetFilters(filtersStore.getState()), scope: "external", tag: "vip" });
    expect(filtersStore.getState()).toMatchObject({
      title: "Fabrikam",
      scope: "external",
      tag: "vip",
    });
  });

  it("clears single filters and resets everything", () => {
    filters.apply({ ...sheetFilters(defaultFilters), scope: "internal", participant: "Zara Lind" });
    filters.setView({ kind: "workspace" });
    filters.clear("scope");
    expect(filtersStore.getState().scope).toBe("all");
    filters.clear("participant");
    expect(filtersStore.getState().participant).toBeNull();
    filters.clear("view");
    expect(filtersStore.getState().view).toEqual({ kind: "mine" });
    filters.setTitle("x");
    filters.reset();
    expect(filtersStore.getState()).toEqual(defaultFilters);
  });
});

describe("toQuery", () => {
  const base: FilterState = { ...defaultFilters };

  it("maps Mine to meetings the signed-in user attended and drops it when unknown", () => {
    expect(toQuery(base, { meEmail: "me@x.io", now: NOW })).toEqual({
      participantEmail: "me@x.io",
    });
    expect(toQuery(base, { meEmail: null, now: NOW })).toEqual({});
    expect(
      toQuery({ ...base, recorderId: "r2" }, { meEmail: "me@x.io", now: NOW }).recorderId,
    ).toBe("r2");
  });

  it("maps Workspace and team views", () => {
    expect(
      toQuery({ ...base, view: { kind: "workspace" } }, { meEmail: "me@x.io", now: NOW }),
    ).toEqual({
      workspace: true,
    });
    expect(
      toQuery({ ...base, view: { kind: "team", id: "t1" } }, { meEmail: "me@x.io", now: NOW }),
    ).toEqual({ teamId: "t1" });
  });

  it("passes scope, title, participant, tag, meeting type and recorder through", () => {
    const q = toQuery(
      {
        ...base,
        view: { kind: "workspace" },
        scope: "external",
        title: "  demo ",
        participant: "Zara Lind",
        tag: "vip",
        meetingTypeId: "mt1",
        recorderId: "r1",
      },
      { meEmail: "me@x.io", now: NOW },
    );
    expect(q).toEqual({
      workspace: true,
      scope: "external",
      title: "demo",
      participant: "Zara Lind",
      tag: "vip",
      meetingTypeId: "mt1",
      recorderId: "r1",
    });
    expect(toQuery({ ...base, title: "   " }, { meEmail: null, now: NOW }).title).toBeUndefined();
  });

  it("turns presets into an after bound and custom ranges into day bounds", () => {
    expect(dateBounds({ preset: "7d" }, NOW)).toEqual({
      after: new Date(NOW - 7 * DAY).toISOString(),
    });
    expect(dateBounds({ preset: "30d" }, NOW).after).toBe(new Date(NOW - 30 * DAY).toISOString());
    expect(dateBounds(null, NOW)).toEqual({});
    const from = new Date(2026, 8, 1, 13, 0).toISOString();
    const to = new Date(2026, 8, 3, 9, 0).toISOString();
    const custom = dateBounds({ preset: "custom", from, to }, NOW);
    expect(new Date(custom.after!).getHours()).toBe(0);
    expect(new Date(custom.after!).getDate()).toBe(1);
    expect(new Date(custom.before!).getDate()).toBe(4);
    expect(dateBounds({ preset: "custom", from: null, to: null }, NOW)).toEqual({
      after: undefined,
      before: undefined,
    });
    expect(toQuery({ ...base, date: { preset: "90d" } }, { meEmail: null, now: NOW }).after).toBe(
      new Date(NOW - 90 * DAY).toISOString(),
    );
  });
});

describe("withCustomDate", () => {
  const sep = (day: number) => new Date(2026, 8, day, 12).toISOString();

  it("switches a preset to a custom range and keeps the other end", () => {
    expect(withCustomDate({ preset: "30d" }, "from", sep(1))).toEqual({
      preset: "custom",
      from: sep(1),
      to: null,
    });
    expect(withCustomDate({ preset: "custom", from: sep(1), to: null }, "to", sep(3))).toEqual({
      preset: "custom",
      from: sep(1),
      to: sep(3),
    });
    expect(withCustomDate(null, "to", sep(3))).toEqual({
      preset: "custom",
      from: null,
      to: sep(3),
    });
  });

  it("drops the other end when the range would be inverted, and allows a same-day range", () => {
    expect(withCustomDate({ preset: "custom", from: sep(1), to: sep(3) }, "from", sep(5))).toEqual({
      preset: "custom",
      from: sep(5),
      to: null,
    });
    expect(withCustomDate({ preset: "custom", from: sep(5), to: null }, "to", sep(1))).toEqual({
      preset: "custom",
      from: null,
      to: sep(1),
    });
    const sameDay = withCustomDate(
      { preset: "custom", from: new Date(2026, 8, 3, 21).toISOString(), to: null },
      "to",
      new Date(2026, 8, 3, 2).toISOString(),
    );
    expect(sameDay).toMatchObject({ preset: "custom" });
    expect((sameDay as { from: string | null }).from).not.toBeNull();
  });
});

describe("activeChips", () => {
  it("describes every active sheet filter with a removable key", () => {
    const from = new Date(2026, 8, 1).toISOString();
    const chips = activeChips(
      {
        view: { kind: "mine" },
        scope: "internal",
        date: { preset: "custom", from, to: null },
        meetingTypeId: "mt1",
        participant: "Zara Lind",
        tag: "vip",
        recorderId: "r1",
      },
      { meetingType: "Sales", recorder: "Marcus Kowalski" },
    );
    expect(chips.map((c) => c.key)).toEqual([
      "scope",
      "date",
      "meetingTypeId",
      "participant",
      "tag",
      "recorderId",
    ]);
    expect(chips.map((c) => c.label)).toEqual([
      "Internal",
      expect.stringMatching(/^From Sep 1$/),
      "Sales",
      "Zara Lind",
      "#vip",
      "Marcus Kowalski",
    ]);
  });

  it("falls back to generic labels when names are unknown", () => {
    const chips = activeChips({
      ...sheetFilters(defaultFilters),
      meetingTypeId: "x",
      recorderId: "y",
    });
    expect(chips.map((c) => c.label)).toEqual(["Meeting type", "Recorder"]);
  });

  it("labels date presets and custom ranges", () => {
    expect(dateLabel({ preset: "30d" })).toBe("Last 30 days");
    const from = new Date(2026, 8, 1).toISOString();
    const to = new Date(2026, 8, 3).toISOString();
    expect(dateLabel({ preset: "custom", from, to })).toMatch(/Sep 1 – Sep 3/);
    expect(dateLabel({ preset: "custom", from: null, to })).toMatch(/^Until Sep 3$/);
    expect(dateLabel({ preset: "custom", from: null, to: null })).toBe("Custom dates");
    expect(dateLabel(null)).toBeNull();
  });
});

describe("default view", () => {
  const db = testDb();
  seedDemo(db, NOW);
  afterEach(() => {
    settingsStore.setState(DEFAULT_SETTINGS);
    hydrateFilters(db);
  });

  it("takes the initial view from the setting on hydrate", () => {
    settingsStore.setState({ defaultView: { kind: "team", id: "demo-team-1" } });
    hydrateFilters(db);
    expect(filtersStore.getState().view).toEqual({ kind: "team", id: "demo-team-1" });
  });

  it("falls back to Mine and clears the stale setting once teams are loaded", () => {
    settingsStore.setState({ defaultView: { kind: "team", id: "gone" } });
    hydrateFilters(db);
    expect(filtersStore.getState().view).toEqual({ kind: "mine" });
    expect(settingsStore.getState().defaultView).toEqual({ kind: "mine" });
    expect(resolveView({ kind: "team", id: "gone" }, [])).toEqual({ kind: "team", id: "gone" });
  });

  it("keeps a selected team through a bump while a stale default is still stored", () => {
    hydrateFilters(db);
    settingsStore.setState({ defaultView: { kind: "team", id: "gone" } });
    filters.setView({ kind: "team", id: "demo-team-2" });
    syncFilterTeams(db);
    expect(filtersStore.getState().view).toEqual({ kind: "team", id: "demo-team-2" });
    expect(settingsStore.getState().defaultView).toEqual({ kind: "team", id: "gone" });
  });

  it("honours a team that only appeared after hydrate", () => {
    const fresh = testDb();
    setMeta(fresh, META_TEAMS, JSON.stringify([{ id: "old", name: "Old" }]));
    hydrateFilters(fresh);
    setMeta(
      fresh,
      META_TEAMS,
      JSON.stringify([
        { id: "old", name: "Old" },
        { id: "new", name: "New" },
      ]),
    );
    settingsStore.setState({ defaultView: { kind: "team", id: "new" } });
    expect(filtersStore.getState().view).toEqual({ kind: "team", id: "new" });
  });

  it("re-resolves the current view when a team disappears from the workspace", () => {
    hydrateFilters(db);
    filters.setView({ kind: "team", id: "demo-team-2" });
    syncFilterTeams(db);
    expect(filtersStore.getState().view).toEqual({ kind: "team", id: "demo-team-2" });

    filters.setView({ kind: "team", id: "gone" });
    syncFilterTeams(db);
    expect(filtersStore.getState().view).toEqual({ kind: "mine" });
  });

  it("follows the setting when it changes and on reset", () => {
    hydrateFilters(db);
    settingsStore.setState({ defaultView: { kind: "workspace" } });
    expect(filtersStore.getState().view).toEqual({ kind: "workspace" });
    filters.setView({ kind: "mine" });
    filters.reset();
    expect(filtersStore.getState().view).toEqual({ kind: "workspace" });
    filters.setView({ kind: "mine" });
    filters.clear("view");
    expect(filtersStore.getState().view).toEqual({ kind: "workspace" });
  });
});

describe("view options", () => {
  const teams = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `t${n}`, name: `Team ${n}` }));

  it("lists Mine, Workspace and every team with stable keys", () => {
    const options = viewOptions(teams);
    expect(options.map((o) => o.label)).toEqual(["Mine", "Workspace", ...teams.map((t) => t.name)]);
    expect(options.map((o) => o.testID)).toEqual([
      "view-mine",
      "view-workspace",
      ...teams.map((t) => `view-team-${t.id}`),
    ]);
    expect(sameView({ kind: "team", id: "t1" }, { kind: "team", id: "t2" })).toBe(false);
    expect(sameView({ kind: "team", id: "t1" }, { kind: "team", id: "t1" })).toBe(true);
    expect(sameView({ kind: "mine" }, { kind: "workspace" })).toBe(false);
  });

  it("keeps the selected team visible and hides the overflow", () => {
    const options = viewOptions(teams);
    const mine = visibleViews(options, { kind: "mine" });
    expect(mine.shown.map((o) => o.label)).toEqual(["Mine", "Workspace", "Team 1"]);
    expect(mine.hidden).toBe(5);

    const selected = visibleViews(options, { kind: "team", id: "t6" });
    expect(selected.shown.map((o) => o.label)).toEqual(["Mine", "Workspace", "Team 6"]);
    expect(selected.hidden).toBe(5);

    const few = visibleViews(viewOptions(teams.slice(0, 1)), { kind: "mine" });
    expect(few.hidden).toBe(0);
    expect(few.shown).toHaveLength(3);
  });
});

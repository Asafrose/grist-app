import {
  activeChips,
  dateBounds,
  dateLabel,
  defaultFilters,
  filters,
  type FilterState,
  sheetFilters,
  toQuery,
  useFilters,
} from "@/lib/filters";

const NOW = Date.parse("2026-09-06T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => filters.reset());

describe("filters store", () => {
  it("starts on Mine with nothing else active", () => {
    expect(useFilters.getState()).toEqual(defaultFilters);
    expect(activeChips(useFilters.getState())).toEqual([]);
  });

  it("updates title and view independently of the sheet", () => {
    filters.setTitle("Fabrikam");
    filters.setView({ kind: "team", id: "t1" });
    expect(useFilters.getState()).toMatchObject({
      title: "Fabrikam",
      view: { kind: "team", id: "t1" },
    });
    filters.apply({ ...sheetFilters(useFilters.getState()), scope: "external", tag: "vip" });
    expect(useFilters.getState()).toMatchObject({
      title: "Fabrikam",
      scope: "external",
      tag: "vip",
    });
  });

  it("clears single filters and resets everything", () => {
    filters.apply({ ...sheetFilters(defaultFilters), scope: "internal", participant: "Zara Lind" });
    filters.setView({ kind: "workspace" });
    filters.clear("scope");
    expect(useFilters.getState().scope).toBe("all");
    filters.clear("participant");
    expect(useFilters.getState().participant).toBeNull();
    filters.clear("view");
    expect(useFilters.getState().view).toEqual({ kind: "mine" });
    filters.setTitle("x");
    filters.reset();
    expect(useFilters.getState()).toEqual(defaultFilters);
  });
});

describe("toQuery", () => {
  const base: FilterState = { ...defaultFilters };

  it("maps Mine to the signed-in recorder and drops it when unknown", () => {
    expect(toQuery(base, { meId: "me", now: NOW })).toEqual({ recorderId: "me" });
    expect(toQuery(base, { meId: null, now: NOW })).toEqual({});
    expect(toQuery({ ...base, recorderId: "r2" }, { meId: "me", now: NOW }).recorderId).toBe("r2");
  });

  it("maps Workspace and team views", () => {
    expect(toQuery({ ...base, view: { kind: "workspace" } }, { meId: "me", now: NOW })).toEqual({
      workspace: true,
    });
    expect(
      toQuery({ ...base, view: { kind: "team", id: "t1" } }, { meId: "me", now: NOW }),
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
      { meId: "me", now: NOW },
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
    expect(toQuery({ ...base, title: "   " }, { meId: null, now: NOW }).title).toBeUndefined();
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
    expect(toQuery({ ...base, date: { preset: "90d" } }, { meId: null, now: NOW }).after).toBe(
      new Date(NOW - 90 * DAY).toISOString(),
    );
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

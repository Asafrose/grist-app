import { dayKey, groupByDay, headerIndices } from "@/lib/sections";

const now = new Date(2026, 8, 6, 15, 30);
const at = (id: string, y: number, m: number, d: number, h: number) => ({
  id,
  startDatetime: new Date(y, m, d, h, 0).toISOString(),
});

describe("groupByDay", () => {
  it("inserts one header per local calendar day and marks the last row of each day", () => {
    const rows = [
      at("a", 2026, 8, 6, 14),
      at("b", 2026, 8, 6, 1),
      at("c", 2026, 8, 5, 23),
      at("d", 2026, 8, 3, 9),
    ];
    const items = groupByDay(rows, now);
    expect(items.map((i) => (i.kind === "header" ? i.label : i.item.id))).toEqual([
      "Today",
      "a",
      "b",
      "Yesterday",
      "c",
      expect.stringMatching(/^Thursday/),
      "d",
    ]);
    expect(items.filter((i) => i.kind === "row").map((i) => i.kind === "row" && i.last)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect(headerIndices(items)).toEqual([0, 3, 5]);
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it("returns nothing for no rows", () => {
    expect(groupByDay([], now)).toEqual([]);
    expect(headerIndices([])).toEqual([]);
  });

  it("keys days in local time", () => {
    const d = new Date(2026, 0, 31, 23, 59);
    expect(dayKey(d.toISOString())).toBe("2026-1-31");
  });
});

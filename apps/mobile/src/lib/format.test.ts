import { formatClock, formatDuration, formatMeetingDate } from "@/lib/format";

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [65, "1:05"],
    [599.9, "9:59"],
    [3600, "1:00:00"],
    [3725, "1:02:05"],
    [-3, "0:00"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0 min"],
    [29_000, "0 min"],
    [31_000, "1 min"],
    [44 * 60_000, "44 min"],
    [60 * 60_000, "1 h"],
    [67 * 60_000, "1 h 7 min"],
    [150 * 60_000, "2 h 30 min"],
  ])("formats %s ms as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("formatMeetingDate", () => {
  const now = new Date(2026, 8, 6, 15, 30);
  const local = (y: number, m: number, d: number, h: number, min: number) =>
    new Date(y, m, d, h, min);
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  it("labels today and yesterday by calendar day, not by 24-hour distance", () => {
    const earlyToday = local(2026, 8, 6, 0, 15);
    const lateYesterday = local(2026, 8, 5, 23, 45);
    expect(formatMeetingDate(earlyToday.toISOString(), now)).toBe(`Today · ${time(earlyToday)}`);
    expect(formatMeetingDate(lateYesterday.toISOString(), now)).toBe(
      `Yesterday · ${time(lateYesterday)}`,
    );
  });

  it("shows weekday and date for this year, adds the year otherwise", () => {
    const thisYear = local(2026, 8, 4, 20, 1);
    const lastYear = local(2025, 11, 24, 9, 0);
    const a = formatMeetingDate(thisYear.toISOString(), now);
    const b = formatMeetingDate(lastYear.toISOString(), now);
    expect(a).toMatch(/^[A-Z][a-z]{2},? .*Sep.* 4 · /);
    expect(a).not.toContain("2026");
    expect(b).toContain("2025");
    expect(b.endsWith(time(lastYear))).toBe(true);
  });
});

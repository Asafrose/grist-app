import {
  formatClock,
  formatDayLabel,
  formatDuration,
  formatDurationCompact,
  formatMeetingDate,
  formatShortDate,
  formatTime,
} from "@/lib/format";

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

describe("formatShortDate", () => {
  const now = new Date(2026, 8, 6, 15, 30);

  it("shows month and day, adding the year only when it differs", () => {
    const a = formatShortDate(new Date(2026, 8, 5, 20, 1).toISOString(), now);
    const b = formatShortDate(new Date(2025, 11, 24, 9, 0).toISOString(), now);
    expect(a).toMatch(/Sep.* 5/);
    expect(a).not.toContain("2026");
    expect(b).toMatch(/Dec.* 24/);
    expect(b).toContain("2025");
  });
});

describe("formatDayLabel", () => {
  const now = new Date(2026, 8, 6, 15, 30);
  it("uses Today and Yesterday, then a long weekday with month and day", () => {
    expect(formatDayLabel(new Date(2026, 8, 6, 0, 15).toISOString(), now)).toBe("Today");
    expect(formatDayLabel(new Date(2026, 8, 5, 23, 45).toISOString(), now)).toBe("Yesterday");
    const thisYear = formatDayLabel(new Date(2026, 8, 3, 20, 1).toISOString(), now);
    expect(thisYear).toMatch(/^Thursday,? .*Sep.* 3$/);
    expect(thisYear).not.toContain("2026");
    expect(formatDayLabel(new Date(2025, 11, 24, 9, 0).toISOString(), now)).toContain("2025");
  });
});

describe("formatTime", () => {
  it("prints the local clock time", () => {
    const d = new Date(2026, 8, 6, 13, 5);
    expect(formatTime(d.toISOString())).toBe(
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    );
  });
});

describe("formatDurationCompact", () => {
  it.each([
    [0, "0s"],
    [16_000, "16s"],
    [59_400, "59s"],
    [60_000, "1m"],
    [44 * 60_000, "44m"],
    [60 * 60_000, "1h"],
    [67 * 60_000, "1h 7m"],
    [-5000, "0s"],
  ])("formats %s ms as %s", (ms, expected) => {
    expect(formatDurationCompact(ms)).toBe(expected);
  });
});

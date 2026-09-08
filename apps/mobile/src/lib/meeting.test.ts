import type { ActionItemRow, ParticipantRow } from "@/lib/db";
import {
  groupActionItems,
  initials,
  isRecordingStale,
  MEETING_TABS,
  parseMeetingTab,
  parseSeekParam,
  RECORDING_STALE_MS,
} from "@/lib/meeting";

const NOW = Date.parse("2026-09-06T10:00:00Z");

describe("meeting tabs", () => {
  it("accepts every known tab and falls back to summary", () => {
    for (const tab of MEETING_TABS) expect(parseMeetingTab(tab)).toBe(tab);
    expect(parseMeetingTab(undefined)).toBe("summary");
    expect(parseMeetingTab("coaching")).toBe("summary");
    expect(parseMeetingTab(["transcript"])).toBe("summary");
  });

  it("parses the seek param as non-negative seconds", () => {
    expect(parseSeekParam("88")).toBe(88);
    expect(parseSeekParam("12.5")).toBe(12.5);
    expect(parseSeekParam("0")).toBe(0);
    expect(parseSeekParam("-4")).toBeNull();
    expect(parseSeekParam("abc")).toBeNull();
    expect(parseSeekParam("")).toBeNull();
    expect(parseSeekParam(undefined)).toBeNull();
  });
});

describe("isRecordingStale", () => {
  it("is stale at or after ten minutes, or when the stamp is unparseable", () => {
    expect(isRecordingStale(new Date(NOW - 60_000).toISOString(), NOW)).toBe(false);
    expect(isRecordingStale(new Date(NOW - RECORDING_STALE_MS + 1).toISOString(), NOW)).toBe(false);
    expect(isRecordingStale(new Date(NOW - RECORDING_STALE_MS).toISOString(), NOW)).toBe(true);
    expect(isRecordingStale(new Date(NOW - 3_600_000).toISOString(), NOW)).toBe(true);
    expect(isRecordingStale("never", NOW)).toBe(true);
  });
});

describe("people helpers", () => {
  it("builds initials from first and last name", () => {
    expect(initials("Jonah Reyes")).toBe("JR");
    expect(initials("Priya")).toBe("P");
    expect(initials("  Ana  Maria  de Souza ")).toBe("AS");
    expect(initials("")).toBe("?");
  });
});

describe("groupActionItems", () => {
  const participants: ParticipantRow[] = [
    {
      recordingId: "r",
      id: "p1",
      name: "Zara Lind",
      email: "zara.lind@acme.example",
      scope: "external",
      confirmedAttendee: true,
      observedJoinTime: null,
      observedLeaveTime: null,
    },
    {
      recordingId: "r",
      id: "p2",
      name: "Marcus Kowalski",
      email: "marcus@treyresearch.example",
      scope: "internal",
      confirmedAttendee: true,
      observedJoinTime: null,
      observedLeaveTime: null,
    },
  ];
  const item = (position: number, assignee: ActionItemRow["assignee"]): ActionItemRow => ({
    recordingId: "r",
    position,
    status: position % 2 ? "completed" : "pending",
    timestamp: position * 1000,
    text: `Item ${position}`,
    assignee,
  });

  it("groups by assignee in first-seen order and resolves company and colour from participants", () => {
    const groups = groupActionItems(
      [
        item(0, { id: "p2", name: "Marcus Kowalski", user_id: "u" }),
        item(1, { id: "x", name: "zara lind", user_id: null }),
        item(2, { id: "p2", name: "Marcus Kowalski", user_id: "u" }),
        item(3, null),
        item(4, { id: "ghost", name: "Nobody Here", user_id: null }),
      ],
      participants,
    );
    expect(groups.map((g) => g.name)).toEqual([
      "Marcus Kowalski",
      "Zara Lind",
      "Unassigned",
      "Nobody Here",
    ]);
    expect(groups[0]).toMatchObject({ company: "Treyresearch", colorIndex: 1 });
    expect(groups[0].items.map((i) => i.position)).toEqual([0, 2]);
    expect(groups[1]).toMatchObject({ company: "Acme", colorIndex: 0 });
    expect(groups[2]).toMatchObject({ key: "unassigned", company: null, colorIndex: 2 });
    expect(groups[3]).toMatchObject({ company: null, colorIndex: 3 });
  });

  it("returns nothing for no items", () => {
    expect(groupActionItems([], participants)).toEqual([]);
  });
});

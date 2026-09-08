import type { Recording, Transcript } from "@grist/grain-api";
import detail from "@grist/grain-api/fixtures/recording.json";
import transcript from "@grist/grain-api/fixtures/transcript.json";
import { getRecording, getTranscript, setTranscript, upsertRecordings } from "@/lib/db";
import { testDb } from "@/test/db";
import {
  barSegments,
  mergeRanges,
  normalizeRanges,
  normalizeTag,
  participantRole,
  participantSubtitle,
  roundToHundred,
  screenshareRanges,
  talkTime,
  timelineDuration,
  toggleTag,
} from "@/lib/timeline";

const NOW = "2026-09-06T10:00:00Z";
const base = detail as Recording;

function seed(overrides: Partial<Recording> = {}) {
  const db = testDb();
  upsertRecordings(db, [{ ...base, ...overrides }], NOW);
  setTranscript(db, base.id, transcript as Transcript, NOW);
  return { rec: getRecording(db, base.id)!, segments: getTranscript(db, base.id) };
}

describe("roundToHundred", () => {
  it("distributes the remainder to the largest fractions so the sum is 100", () => {
    expect(roundToHundred([1, 1, 1])).toEqual([34, 33, 33]);
    expect(roundToHundred([50, 25, 25])).toEqual([50, 25, 25]);
    expect(roundToHundred([199_410, 98_891, 39_213])).toEqual([59, 29, 12]);
    expect(roundToHundred([0, 0])).toEqual([0, 0]);
    expect(roundToHundred([5, 0, 995]).reduce((a, b) => a + b)).toBe(100);
    expect(roundToHundred([5, 0, 995])[1]).toBe(0);
  });
});

describe("ranges", () => {
  it("normalises reversed, negative and overlong ranges and drops empty ones", () => {
    expect(
      normalizeRanges(
        [
          { start: 900, end: 1200 },
          { start: 500, end: 100 },
          { start: -50, end: 20 },
          { start: 300, end: 300 },
          { start: 2000, end: 3000 },
        ],
        1000,
      ),
    ).toEqual([
      { start: 0, end: 20 },
      { start: 100, end: 500 },
      { start: 900, end: 1000 },
    ]);
    expect(normalizeRanges([{ start: 5, end: 10 }], 0)).toEqual([{ start: 5, end: 10 }]);
  });

  it("merges touching or near ranges within the gap", () => {
    const merged = mergeRanges(
      [
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 25, end: 30 },
        { start: 40, end: 50 },
      ],
      5,
    );
    expect(merged).toEqual([
      { start: 0, end: 30 },
      { start: 40, end: 50 },
    ]);
  });

  it("clamps screenshares to the duration and handles null", () => {
    expect(screenshareRanges(null, 1000)).toEqual([]);
    expect(
      screenshareRanges(
        [
          { start: 800, end: 1500, participant_id: "a" },
          { start: 100, end: 200, participant_id: "b" },
        ],
        1000,
      ),
    ).toEqual([
      { start: 100, end: 200 },
      { start: 800, end: 1000 },
    ]);
  });

  it("extends the duration to whatever the data reaches", () => {
    const { segments } = seed();
    expect(timelineDuration(2_641_000, segments, base.screenshares)).toBe(2_641_000);
    expect(timelineDuration(0, segments, null)).toBe(382_749);
    expect(timelineDuration(0, [], [{ start: 10, end: 5, participant_id: null }])).toBe(10);
  });

  it("handles a segment list far past the argument-list limit", () => {
    const { segments } = seed();
    const one = segments[0];
    if (!one) throw new Error("no segments");
    const many = Array.from({ length: 200_000 }, (_, i) => ({ ...one, start: i, end: i + 1 }));
    expect(timelineDuration(0, many, null)).toBe(200_000);
  });
});

describe("talkTime", () => {
  it("sums per speaker, percentages sum to 100 and rows sort by talk time", () => {
    const { rec, segments } = seed();
    const talk = talkTime(segments, rec.participants, rec.durationMs);
    expect(talk.rows.map((r) => [r.label, r.pct])).toEqual([
      ["Mia Duarte", 59],
      ["Marcus Kowalski", 29],
      ["Noa Whitfield", 12],
    ]);
    expect(talk.rows.reduce((a, r) => a + r.pct, 0)).toBe(100);
    expect(talk.rows.map((r) => r.ms)).toEqual([199_410, 98_891, 39_213]);
    expect(talk.totalMs).toBe(199_410 + 98_891 + 39_213);
    expect(talk.durationMs).toBe(2_641_000);
    const marcus = rec.participants.findIndex((p) => p.name === "Marcus Kowalski");
    expect(talk.rows[1].colorIndex).toBe(marcus);
    expect(talk.rows[1].participantIds).toEqual([rec.participants[marcus].id]);
  });

  it("groups external participants by company and names the members", () => {
    const external = base.participants!.map((p) =>
      p.name === "Mia Duarte"
        ? { ...p, scope: "external" as const, email: "mia@acme.example" }
        : p.name === "Noa Whitfield"
          ? { ...p, scope: "external" as const, email: "noa.w@acme.example" }
          : p,
    );
    const { rec, segments } = seed({ participants: external });
    const talk = talkTime(segments, rec.participants, rec.durationMs);
    const acme = talk.rows.find((r) => r.key === "company:Acme")!;
    expect(acme.label).toBe("Acme (Mia, Noa)");
    expect(acme.external).toBe(true);
    expect(acme.ms).toBe(199_410 + 39_213);
    expect(acme.participantIds).toHaveLength(2);
    expect(talk.rows.map((r) => r.pct)).toEqual([71, 29]);
  });

  it("falls back to the speaker name when no participant matches", () => {
    const { rec } = seed();
    const segs = [
      {
        recordingId: rec.id,
        idx: 0,
        participantId: null,
        speaker: "Guest",
        start: 0,
        end: 100,
        text: "",
      },
      {
        recordingId: rec.id,
        idx: 1,
        participantId: null,
        speaker: "Noa Whitfield",
        start: 100,
        end: 200,
        text: "",
      },
      {
        recordingId: rec.id,
        idx: 2,
        participantId: "nope",
        speaker: "Guest",
        start: 300,
        end: 400,
        text: "",
      },
    ];
    const talk = talkTime(segs, rec.participants, 1000);
    const guest = talk.rows.find((r) => r.key === "speaker:Guest")!;
    expect(guest.ms).toBe(200);
    expect(guest.participantIds).toEqual([]);
    expect(guest.colorIndex).toBeGreaterThanOrEqual(rec.participants.length);
    expect(talk.rows.find((r) => r.key.startsWith("participant:"))?.label).toBe("Noa Whitfield");
    expect(talkTime([], rec.participants, 1000)).toEqual({
      rows: [],
      totalMs: 0,
      durationMs: 1000,
    });
  });
});

describe("barSegments", () => {
  it("positions segments in percent, enforces a minimum width and merges near ones", () => {
    const segs = barSegments(
      [
        { start: 0, end: 1 },
        { start: 500, end: 600 },
        { start: 602, end: 700 },
        { start: 999, end: 1000 },
      ],
      1000,
    );
    expect(segs).toEqual([
      { start: 0, left: 0, width: 0.5 },
      { start: 500, left: 50, width: 20 },
      { start: 999, left: 99.5, width: 0.5 },
    ]);
    expect(barSegments([{ start: 0, end: 1 }], 0)).toEqual([]);
  });
});

describe("participants", () => {
  it("derives host, attended and invited roles and a subtitle per scope", () => {
    const { rec } = seed();
    const by = (name: string) => rec.participants.find((p) => p.name === name)!;
    const [zara, marcus, mia] = [by("Zara Lind"), by("Marcus Kowalski"), by("Mia Duarte")];
    expect(participantRole(marcus, rec.recorders)).toBe("host");
    expect(participantRole(zara, rec.recorders)).toBe("attended");
    expect(participantRole({ ...mia, confirmedAttendee: false }, rec.recorders)).toBe("invited");
    expect(participantRole(zara, [{ id: "x", name: "X", participant_id: zara.id }])).toBe("host");
    expect(participantSubtitle(zara)).toBe("acme.example");
    expect(participantSubtitle(marcus)).toBe("marcus.kowalski@treyresearch.example");
    expect(participantSubtitle(mia)).toBeNull();
  });
});

describe("tags", () => {
  it("toggles without duplicates and normalises input", () => {
    expect(toggleTag(["a", "b"], "b", true)).toEqual(["a", "b"]);
    expect(toggleTag(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleTag(["a", "b"], "a", false)).toEqual(["b"]);
    expect(normalizeTag("  pilot   q3 ")).toBe("pilot q3");
    expect(normalizeTag("   ")).toBeNull();
  });
});

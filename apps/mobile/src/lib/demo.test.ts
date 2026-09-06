import { getRecording, getTranscript, listRecordings, searchRecordings } from "@/lib/db";
import { demoRecordings, DEMO_TOKEN, isDemoToken, seedDemo } from "@/lib/demo";
import { testDb } from "@/test/db";

const NOW = Date.parse("2026-09-06T10:00:00Z");

describe("demo data", () => {
  it("recognises only the demo token", () => {
    expect(isDemoToken(DEMO_TOKEN)).toBe(true);
    expect(isDemoToken("grain_pat_x")).toBe(false);
    expect(isDemoToken(null)).toBe(false);
  });

  it("derives a deterministic 90-day spread of recordings from the fixtures", () => {
    const a = demoRecordings(NOW);
    const b = demoRecordings(NOW);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(20);
    expect(new Set(a.map((r) => r.id)).size).toBe(a.length);
    const starts = a.map((r) => Date.parse(r.start_datetime));
    expect(Math.max(...starts)).toBeLessThan(NOW);
    expect(Math.min(...starts)).toBeGreaterThan(NOW - 90 * 24 * 3_600_000);
    expect(a.some((r) => r.media_type === "audio")).toBe(true);
    expect(a.some((r) => (r.highlights ?? []).length > 0)).toBe(true);
    expect(a.some((r) => r.participants?.every((p) => p.scope === "internal"))).toBe(true);
    for (const r of a) {
      for (const h of r.highlights ?? []) expect(h.recording_id).toBe(r.id);
    }
  });

  it("seeds recordings and transcripts so every screen has data", () => {
    const db = testDb();
    const n = seedDemo(db, NOW);
    expect(listRecordings(db)).toHaveLength(n);
    const first = listRecordings(db)[0];
    expect(getRecording(db, first.id)?.sections.length).toBeGreaterThan(0);
    expect(getTranscript(db, first.id).length).toBeGreaterThan(0);
    expect(searchRecordings(db, "Northwind").length).toBeGreaterThan(0);
    expect(seedDemo(db, NOW)).toBe(n);
    expect(listRecordings(db)).toHaveLength(n);
  });
});

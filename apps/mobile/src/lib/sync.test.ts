import type { Recording, RecordingsPage, Transcript } from "@grist/grain-api";
import page from "@grist/grain-api/fixtures/recordings.json";
import transcript from "@grist/grain-api/fixtures/transcript.json";
import { getMeta, getRecording, getTranscript, listRecordings } from "@/lib/db";
import {
  INCREMENTAL_OVERLAP_MS,
  isoSeconds,
  META_LAST_RECONCILE,
  META_LAST_SYNC,
  prefetchTranscripts,
  RECONCILE_EVERY_MS,
  type RecordingsApi,
  refreshRecording,
  syncLibrary,
  WINDOW_MS,
} from "@/lib/sync";
import { testDb } from "@/test/db";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-06T10:00:00Z");
const base = page.recordings as Recording[];

function at(daysAgo: number, id: string, extra: Partial<Recording> = {}): Recording {
  return {
    ...base[0],
    id,
    title: `Meeting ${id}`,
    start_datetime: isoSeconds(NOW - daysAgo * DAY),
    ...extra,
  };
}

function fakeApi(remote: () => Recording[]) {
  const iterate = jest.fn(async function* (params: { filter?: { after_datetime?: string } }) {
    const after = params.filter?.after_datetime ?? "";
    const recs = remote().filter((r) => r.start_datetime >= after);
    const page1: RecordingsPage = { cursor: "c", recordings: recs.slice(0, 2) };
    const page2: RecordingsPage = { cursor: null, recordings: recs.slice(2) };
    yield page1;
    if (recs.length > 2) yield page2;
  });
  const get = jest.fn(async (id: string) => remote().find((r) => r.id === id)!);
  const transcriptFn = jest.fn(async () => transcript as Transcript);
  return { iterate, get, transcript: transcriptFn } as unknown as RecordingsApi & {
    iterate: jest.Mock;
    get: jest.Mock;
    transcript: jest.Mock;
  };
}

describe("syncLibrary", () => {
  it("first run is a full sync of the 90-day window and stamps both markers", async () => {
    const db = testDb();
    const remote = [at(1, "a"), at(10, "b"), at(100, "old")];
    const api = fakeApi(() => remote);
    const result = await syncLibrary(db, api, NOW);
    expect(result).toEqual({ mode: "full", upserted: 2, removed: 0 });
    expect(listRecordings(db).map((r) => r.id)).toEqual(["a", "b"]);
    expect(api.iterate.mock.calls[0][0].filter.after_datetime).toBe(isoSeconds(NOW - WINDOW_MS));
    expect(getMeta(db, META_LAST_SYNC)).toBe(isoSeconds(NOW));
    expect(getMeta(db, META_LAST_RECONCILE)).toBe(isoSeconds(NOW));
  });

  it("incremental run only asks for recent recordings with an overlap and adds new ones", async () => {
    const db = testDb();
    let remote = [at(1, "a"), at(10, "b")];
    const api = fakeApi(() => remote);
    await syncLibrary(db, api, NOW);

    const later = NOW + DAY;
    remote = [at(0, "new", { start_datetime: isoSeconds(later - 3600_000) }), ...remote];
    const result = await syncLibrary(db, api, later);
    expect(result.mode).toBe("incremental");
    expect(api.iterate.mock.calls[1][0].filter.after_datetime).toBe(
      isoSeconds(NOW - INCREMENTAL_OVERLAP_MS),
    );
    expect(listRecordings(db).map((r) => r.id)).toEqual(["new", "a", "b"]);
  });

  it("incremental run does not delete recordings it did not see", async () => {
    const db = testDb();
    let remote = [at(1, "a"), at(10, "b")];
    const api = fakeApi(() => remote);
    await syncLibrary(db, api, NOW);
    remote = [at(1, "a")];
    const result = await syncLibrary(db, api, NOW + DAY);
    expect(result.removed).toBe(0);
    expect(listRecordings(db).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("weekly reconcile picks up renames and deletions", async () => {
    const db = testDb();
    let remote = [at(1, "a"), at(10, "b"), at(20, "c")];
    const api = fakeApi(() => remote);
    await syncLibrary(db, api, NOW);
    remote = [at(1, "a", { title: "Renamed A" }), at(20, "c")];
    const later = NOW + RECONCILE_EVERY_MS;
    const result = await syncLibrary(db, api, later);
    expect(result).toEqual({ mode: "full", upserted: 2, removed: 1 });
    expect(listRecordings(db).map((r) => [r.id, r.title])).toEqual([
      ["a", "Renamed A"],
      ["c", "Meeting c"],
    ]);
    expect(getMeta(db, META_LAST_RECONCILE)).toBe(isoSeconds(later));
  });

  it("prunes recordings that aged out of the window", async () => {
    const db = testDb();
    const remote = [at(1, "a"), at(89, "edge")];
    const api = fakeApi(() => remote);
    await syncLibrary(db, api, NOW);
    expect(listRecordings(db)).toHaveLength(2);
    const result = await syncLibrary(db, api, NOW + 2 * DAY);
    expect(result.removed).toBe(1);
    expect(listRecordings(db).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("progressive sync", () => {
  it("writes each page as it arrives so the newest meetings show first", async () => {
    const db = testDb();
    const remote = [at(1, "a"), at(2, "b"), at(3, "c"), at(4, "d")];
    const api = fakeApi(() => remote);
    const counts: number[] = [];
    const visible: number[] = [];
    await syncLibrary(db, api, {
      now: NOW,
      onPage: (n) => {
        counts.push(n);
        visible.push(listRecordings(db).length);
      },
    });
    expect(counts).toEqual([2, 4]);
    expect(visible).toEqual([2, 4]);
    expect(listRecordings(db).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("refreshRecording", () => {
  it("fetches one recording with includes and upserts it", async () => {
    const db = testDb();
    const remote = [at(1, "a", { title: "Fresh" })];
    const api = fakeApi(() => remote);
    await refreshRecording(db, api, "a", NOW);
    expect(api.get).toHaveBeenCalledWith("a", expect.objectContaining({ ai_summary: true }));
    expect(getRecording(db, "a")?.title).toBe("Fresh");
  });
});

describe("prefetchTranscripts", () => {
  it("fetches missing transcripts in the window with bounded concurrency", async () => {
    const db = testDb();
    const remote = [at(1, "a"), at(2, "b"), at(3, "c"), at(4, "d")];
    const api = fakeApi(() => remote);
    await syncLibrary(db, api, NOW);

    let inFlight = 0;
    let peak = 0;
    api.transcript.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return transcript as Transcript;
    });

    const result = await prefetchTranscripts(db, api, { now: NOW, concurrency: 2 });
    expect(result.fetched.toSorted()).toEqual(["a", "b", "c", "d"]);
    expect(peak).toBe(2);
    expect(getTranscript(db, "c")).toHaveLength(transcript.length);

    api.transcript.mockClear();
    await prefetchTranscripts(db, api, { now: NOW });
    expect(api.transcript).not.toHaveBeenCalled();
  });

  it("stops between transcripts when asked to", async () => {
    const db = testDb();
    const remote = [at(1, "a"), at(2, "b"), at(3, "c")];
    const api = fakeApi(() => remote);
    await syncLibrary(db, api, NOW);
    let calls = 0;
    const result = await prefetchTranscripts(db, api, {
      now: NOW,
      concurrency: 1,
      shouldStop: () => calls++ >= 1,
    });
    expect(result.fetched).toHaveLength(1);
    expect(api.transcript).toHaveBeenCalledTimes(1);
  });

  it("keeps going when one transcript fails", async () => {
    const db = testDb();
    const remote = [at(1, "a"), at(2, "b")];
    const api = fakeApi(() => remote);
    await syncLibrary(db, api, NOW);
    api.transcript.mockImplementation(async (id: string) => {
      if (id === "a") throw new Error("boom");
      return transcript as Transcript;
    });
    const result = await prefetchTranscripts(db, api, { now: NOW });
    expect(result).toEqual({ fetched: ["b"], failed: ["a"] });
    expect(getTranscript(db, "a")).toEqual([]);
  });
});

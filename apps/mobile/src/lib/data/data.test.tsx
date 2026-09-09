import { act, renderHook, waitFor } from "@testing-library/react-native";
import { authStore } from "@/lib/auth";
import {
  listRecordings,
  listTeams,
  recorderOptions,
  recordingsQuery,
  upsertRecordings,
} from "@/lib/db";
import { demoRecordings } from "@/lib/demo";
import { library, libraryKey, libraryReady, libraryStore } from "@/lib/library";
import { queryClient } from "@/lib/query";
import { meStore } from "@/lib/me";
import { getRecentSearches, RECENT_SEARCHES_MAX } from "@/lib/recent-searches";
import { isoSeconds } from "@/lib/sync";
import { currentDb, positionsStore, useLive, useSnapshot } from "./live";
import {
  identity,
  playbackPositions,
  recentSearches,
  recordingOpens,
  recordings,
  transcriptIndex,
  useClips,
  useIndexStats,
  useParticipantOptions,
  useRecentSearches,
  useRecording,
  useRecorderOptions,
  useRecordingCount,
  useRecordings,
  useSearch,
  useStorageStats,
  useTagOptions,
  useTeams,
  useTranscript,
  useWorkspace,
} from "./index";

jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "CELLULAR" })),
}));
jest.mock("expo-sqlite", () => ({
  addDatabaseChangeListener: () => ({ remove() {} }),
  defaultDatabaseDirectory: "/tmp",
}));
jest.mock("expo-file-system", () => {
  class Entry {
    exists = false;
    size = 0;
    list() {
      return [];
    }
  }
  return { Directory: Entry, File: Entry, Paths: { document: "/doc", cache: "/cache" } };
});
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));

const NOW = Date.parse("2026-09-06T12:00:00Z");
const demo = demoRecordings(NOW);
const withClips = demo.find((r) => r.highlights?.length)!;
const db = () => currentDb();
const all = () => listRecordings(db());

beforeAll(async () => {
  await libraryReady;
  authStore.setState({ status: "signed-in", token: "demo" });
  await waitFor(() => expect(queryClient.getQueryData(libraryKey("demo"))).toBeDefined());
});

describe("useLive", () => {
  it("re-runs the query when the library version changes", async () => {
    const { result } = await renderHook(() => useRecordings({}));
    await waitFor(() => expect(result.current.data).toHaveLength(all().length));
    const before = result.current.data.length;

    upsertRecordings(db(), [{ ...demo[0], id: "extra-1", title: "Extra" }], isoSeconds(NOW));
    expect(result.current.data).toHaveLength(before);
    await act(async () => library.touch());
    await waitFor(() => expect(result.current.data).toHaveLength(before + 1));
  });

  it("keys the query on dep values, not object identity", async () => {
    let filter = { title: "Northwind" };
    const make = jest.fn((d) => recordingsQuery(d, filter));
    const { result, rerender } = await renderHook(() => useLive(make, [filter]));
    await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    expect(make).toHaveBeenCalledTimes(1);

    filter = { title: "Northwind" };
    await rerender({});
    expect(make).toHaveBeenCalledTimes(1);

    filter = { title: "Roadmap" };
    await rerender({});
    expect(make).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(result.current.data.every((r) => /Roadmap/.test(r.title))).toBe(true),
    );
  });
});

describe("useSnapshot", () => {
  it("memoizes on the library version and deps", async () => {
    const read = jest.fn((d) => listRecordings(d, { title: "Design" }));
    const { result, rerender } = await renderHook(
      ({ q }: { q: string }) => useSnapshot(read, [q]),
      { initialProps: { q: "a" } },
    );
    const first = result.current;
    expect(read).toHaveBeenCalledTimes(1);

    await rerender({ q: "a" });
    expect(result.current).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);

    await rerender({ q: "b" });
    expect(read).toHaveBeenCalledTimes(2);

    await act(async () => library.touch());
    expect(read).toHaveBeenCalledTimes(3);
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual(first);
  });
});

describe("recordings", () => {
  it("useRecordings applies the filter and newest-first order", async () => {
    const { result } = await renderHook(() => useRecordings({ title: "Roadmap" }));
    await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    for (const r of result.current.data) expect(r.title).toMatch(/Roadmap/);
    const starts = result.current.data.map((r) => r.startDatetime);
    expect(starts).toEqual([...starts].sort().reverse());
    expect(result.current.updatedAt).toBeInstanceOf(Date);
  });

  it("useRecording returns the row with ordered relations, null when unknown", async () => {
    const { result } = await renderHook(() => useRecording(withClips.id));
    await waitFor(() => expect(result.current?.id).toBe(withClips.id));
    const rec = result.current!;
    expect(rec.participants.map((p) => p.email)).toEqual(
      expect.arrayContaining(withClips.participants!.map((p) => p.email)),
    );
    expect(rec.highlights).toHaveLength(withClips.highlights!.length);
    const ts = rec.highlights.map((h) => h.timestamp);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    expect(rec.actionItems.map((a) => a.position)).toEqual(rec.actionItems.map((_, i) => i));

    const missing = await renderHook(() => useRecording("nope"));
    await waitFor(() => expect(missing.result.current).toBeNull());
  });

  it("useRecordingCount agrees with the list for the same filter", async () => {
    const filter = { scope: "internal" as const };
    const list = await renderHook(() => useRecordings(filter));
    const count = await renderHook(() => useRecordingCount(filter));
    await waitFor(() => expect(list.result.current.data.length).toBeGreaterThan(0));
    expect(count.result.current).toBe(list.result.current.data.length);
    expect(count.result.current).toBeLessThan(all().length);
  });

  it("option hooks return {id, name, count} sorted by count, honouring the limit", async () => {
    const people = await renderHook(() => useParticipantOptions(3));
    expect(people.result.current).toHaveLength(3);
    const counts = people.result.current.map((o) => o.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    for (const o of people.result.current)
      expect(o).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        count: expect.any(Number),
      });

    const everyone = await renderHook(() => useParticipantOptions());
    expect(everyone.result.current.length).toBeGreaterThan(3);

    const tags = await renderHook(() => useTagOptions());
    const allTags = new Set(all().flatMap((r) => r.tags));
    expect(new Set(tags.result.current.map((t) => t.id))).toEqual(allTags);
  });

  it("useRecorderOptions lists only people who recorded, with counts", async () => {
    const { result } = await renderHook(() => useRecorderOptions());
    await waitFor(() => expect(result.current.length).toBeGreaterThan(0));
    expect(result.current).toEqual(recorderOptions(db()));
    const ids = new Set(all().flatMap((r) => r.recorders.map((x) => x.id)));
    expect(new Set(result.current.map((o) => o.id))).toEqual(ids);
    for (const o of result.current) expect(o.count).toBeGreaterThan(0);
  });

  it("useTeams lists each team once, sorted by name", async () => {
    const { result } = await renderHook(() => useTeams());
    await waitFor(() => expect(result.current.length).toBeGreaterThan(0));
    expect(result.current).toEqual(listTeams(db()));
    const names = result.current.map((t) => t.name);
    expect(names).toEqual([...names].sort());
    expect(new Set(result.current.map((t) => t.id)).size).toBe(result.current.length);
  });

  it("recordings.refresh writes the API row and readers pick it up", async () => {
    const { result } = await renderHook(() => useRecording(demo[1].id));
    await waitFor(() => expect(result.current?.title).toBe(demo[1].title));
    const api = {
      get: jest.fn(async () => ({ ...demo[1], title: "Refreshed title" })),
      iterate: jest.fn(),
      transcript: jest.fn(),
    };
    await act(async () => recordings.refresh(demo[1].id, api as never));
    expect(api.get).toHaveBeenCalledWith(demo[1].id, expect.anything());
    await waitFor(() => expect(result.current?.title).toBe("Refreshed title"));
  });

  it("recordings.rename writes through the API, then the local row and its search index", async () => {
    const { result } = await renderHook(() => useRecording(demo[2].id));
    await waitFor(() => expect(result.current?.title).toBe(demo[2].title));
    const api = { rename: jest.fn(async () => ({ success: true })) };
    await act(async () => recordings.rename(demo[2].id, "Renamed locally", api));
    expect(api.rename).toHaveBeenCalledWith(demo[2].id, "Renamed locally");
    await waitFor(() => expect(result.current?.title).toBe("Renamed locally"));
    const { result: hits } = await renderHook(() => useSearch("Renamed", "titles"));
    await waitFor(() => {
      const found = hits.current.segment === "titles" ? hits.current.recordings : [];
      expect(found.map((r) => r.id)).toContain(demo[2].id);
    });
    await act(async () => recordings.rename(demo[2].id, demo[2].title, null));
    await waitFor(() => expect(result.current?.title).toBe(demo[2].title));
  });
});

describe("recordings tags", () => {
  it("adds and removes a tag through the API, then updates the cached row", async () => {
    const { result } = await renderHook(() => useRecording(demo[2].id));
    await waitFor(() => expect(result.current?.id).toBe(demo[2].id));
    const api = { addTag: jest.fn(async () => ({})), removeTag: jest.fn(async () => ({})) };

    await act(async () => recordings.addTag(demo[2].id, "pilot", api));
    expect(api.addTag).toHaveBeenCalledWith(demo[2].id, "pilot");
    await waitFor(() => expect(result.current?.tags).toContain("pilot"));

    await act(async () => recordings.removeTag(demo[2].id, "pilot", null));
    expect(api.removeTag).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current?.tags).not.toContain("pilot"));
  });

  it("leaves the row alone when the API rejects", async () => {
    const api = {
      addTag: jest.fn(async () => Promise.reject(new Error("nope"))),
      removeTag: jest.fn(),
    };
    await expect(recordings.addTag(demo[2].id, "x", api)).rejects.toThrow("nope");
    expect(all().find((r) => r.id === demo[2].id)?.tags).not.toContain("x");
  });
});

describe("clips", () => {
  it("filters by team and attendee and respects the limit", async () => {
    const team = listTeams(db())[0];
    const inTeam = all().filter((r) => r.teams.some((t) => t.id === team.id));
    const ids = new Set(inTeam.map((r) => r.id));

    const byTeam = await renderHook(() => useClips({ teamId: team.id }));
    await waitFor(() => expect(byTeam.result.current.length).toBeGreaterThan(0));
    for (const c of byTeam.result.current) expect(ids.has(c.highlight.recordingId)).toBe(true);

    const nobody = await renderHook(() => useClips({ participantEmail: "nobody@x" }));
    await waitFor(() => expect(nobody.result.current).toEqual([]));

    const limited = await renderHook(() => useClips({ limit: 2 }));
    await waitFor(() => expect(limited.result.current).toHaveLength(2));
  });

  it("orders newest clip first and carries the source meeting", async () => {
    const { result } = await renderHook(() => useClips({}));
    await waitFor(() => expect(result.current.length).toBeGreaterThan(1));
    const created = result.current.map((c) => c.highlight.createdDatetime);
    expect(created).toEqual([...created].sort().reverse());
    expect(result.current[0]).toEqual(
      expect.objectContaining({
        recordingTitle: expect.any(String),
        recordingStart: expect.any(String),
      }),
    );
  });
});

describe("transcripts", () => {
  it("useTranscript returns segments in order, empty for unknown ids", async () => {
    const { result } = await renderHook(() => useTranscript(demo[0].id));
    await waitFor(() => expect(result.current.length).toBeGreaterThan(0));
    const idx = result.current.map((s) => s.idx);
    expect(idx).toEqual(idx.map((_, i) => i));
    expect(result.current.every((s) => s.recordingId === demo[0].id)).toBe(true);

    const none = await renderHook(() => useTranscript("nope"));
    await waitFor(() => expect(none.result.current).toEqual([]));
  });

  it("useIndexStats counts indexed against total and clear() empties it", async () => {
    const stats = await renderHook(() => useIndexStats());
    expect(stats.result.current.total).toBe(all().length);
    expect(stats.result.current.indexed).toBe(demo.length);

    const segments = await renderHook(() => useTranscript(demo[0].id));
    await waitFor(() => expect(segments.result.current.length).toBeGreaterThan(0));

    await act(async () => transcriptIndex.clear());
    expect(stats.result.current.indexed).toBe(0);
    await waitFor(() => expect(segments.result.current).toEqual([]));
  });
});

describe("search", () => {
  beforeAll(async () => {
    await act(async () => {
      authStore.setState({ status: "signed-out", token: null });
    });
    await act(async () => {
      authStore.setState({ status: "signed-in", token: "demo" });
    });
    await waitFor(() => expect(queryClient.getQueryData(libraryKey("demo"))).toBeDefined());
  });

  it("titles segment returns only matching recordings", async () => {
    const { result } = await renderHook(() => useSearch("roadmap", "titles"));
    const r = result.current;
    if (r.segment !== "titles") throw new Error(r.segment);
    expect(r.recordings.length).toBeGreaterThan(0);
    for (const rec of r.recordings) expect(rec.title).toMatch(/roadmap/i);
  });

  it("transcripts segment groups hits under their recording", async () => {
    const { result } = await renderHook(() => useSearch("pricing", "transcripts"));
    const r = result.current;
    if (r.segment !== "transcripts") throw new Error(r.segment);
    expect(r.groups.length).toBeGreaterThan(0);
    for (const g of r.groups) {
      expect(g.hits.length).toBeGreaterThan(0);
      for (const hit of g.hits) {
        expect(hit.recordingId).toBe(g.recording.id);
        expect(hit.snippet).toMatch(/\[pric/i);
      }
    }
  });

  it("clips segment returns highlight hits with their recording", async () => {
    const text = withClips.highlights![0].text.split(" ")[0];
    const { result } = await renderHook(() => useSearch(text, "clips"));
    const r = result.current;
    if (r.segment !== "clips") throw new Error(r.segment);
    expect(r.hits.length).toBeGreaterThan(0);
    for (const hit of r.hits) expect(hit.recording.id).toBe(hit.highlight.recordingId);
  });

  it("an empty query yields empty results for every segment", async () => {
    for (const segment of ["titles", "transcripts", "clips"] as const) {
      const { result } = await renderHook(() => useSearch("", segment));
      expect(Object.values(result.current).some((v) => Array.isArray(v) && v.length === 0)).toBe(
        true,
      );
    }
  });

  it("recent searches dedupe case-insensitively, move to front, cap at the max", async () => {
    await act(async () => recentSearches.clear());
    const { result } = await renderHook(() => useRecentSearches());
    expect(result.current).toEqual([]);

    await act(async () => recentSearches.add("Budget"));
    await act(async () => recentSearches.add("roadmap"));
    await act(async () => recentSearches.add("  budget "));
    expect(result.current).toEqual(["budget", "roadmap"]);

    await act(async () => recentSearches.add("   "));
    expect(result.current).toEqual(["budget", "roadmap"]);

    for (let i = 0; i < RECENT_SEARCHES_MAX + 2; i++) {
      await act(async () => recentSearches.add(`term ${i}`));
    }
    expect(result.current).toHaveLength(RECENT_SEARCHES_MAX);
    expect(result.current[0]).toBe(`term ${RECENT_SEARCHES_MAX + 1}`);
    expect(getRecentSearches(db())).toEqual(result.current);

    await act(async () => recentSearches.clear());
    expect(result.current).toEqual([]);
  });
});

describe("workspace and storage", () => {
  it("useWorkspace derives users, teams and meeting types from the library", async () => {
    const { result } = await renderHook(() => useWorkspace());
    const ws = result.current;
    const recorderIds = new Set(all().flatMap((r) => r.recorders.map((x) => x.id)));
    expect(new Set(ws.users.map((u) => u.id))).toEqual(recorderIds);
    expect(ws.teams).toEqual(listTeams(db()));
    expect(ws.meetingTypes.map((m) => m.id)).toEqual(expect.arrayContaining(["mt-internal"]));
  });

  it("useStorageStats reports the index size", async () => {
    const { result } = await renderHook(() => useStorageStats());
    expect(result.current.index.meetings).toBe(all().length);
    expect(result.current.downloads).toEqual({ count: 0, bytes: 0 });
  });
});

describe("identity", () => {
  it("choose writes the picked user through the library db", async () => {
    const picked = identity.choose({ id: "u9", name: "Pat", email: "pat@x.io" });
    expect(meStore.getState().me).toEqual(picked);
  });
});

describe("recording opens", () => {
  it("marks a recording opened and bumps the library version only the first time", () => {
    const id = demo[2].id;
    expect(recordingOpens.get(id)).toBeNull();
    const before = libraryStore.getState().version;
    recordingOpens.markOpened(id, "2026-09-06T09:00:00.000Z");
    expect(recordingOpens.get(id)).toBe("2026-09-06T09:00:00.000Z");
    expect(libraryStore.getState().version).toBe(before + 1);
    recordingOpens.markOpened(id, "2026-09-07T09:00:00.000Z");
    expect(recordingOpens.get(id)).toBe("2026-09-06T09:00:00.000Z");
    expect(libraryStore.getState().version).toBe(before + 1);
  });

  it("is inert before the library is ready", () => {
    const saved = libraryStore.getState().db;
    libraryStore.setState({ db: null });
    expect(() => recordingOpens.markOpened("r1")).not.toThrow();
    expect(recordingOpens.get("r1")).toBeNull();
    libraryStore.setState({ db: saved });
  });

  it("surfaces database failures instead of swallowing them", () => {
    const saved = libraryStore.getState().db;
    const broken = {
      select: () => {
        throw new Error("no such table: recording_opens");
      },
    };
    libraryStore.setState({ db: broken as unknown as typeof saved });
    expect(() => recordingOpens.get("r1")).toThrow("no such table");
    libraryStore.setState({ db: saved });
  });
});

describe("playback positions", () => {
  it("saves, resumes and clears a position through the library db", () => {
    const id = demo[0].id;
    expect(playbackPositions.get(id)).toBeNull();
    playbackPositions.save(id, 61.4);
    expect(playbackPositions.get(id)).toBe(61);
    expect(playbackPositions.resume(id, 600)).toBe(61);
    expect(playbackPositions.resume(id, 62)).toBe(0);

    playbackPositions.clear(id);
    expect(playbackPositions.get(id)).toBeNull();
  });

  it("bumps the positions version on every save, and the library version on clear", () => {
    const id = demo[1].id;
    const library0 = libraryStore.getState().version;
    const positions0 = positionsStore.getState().version;
    playbackPositions.save(id, 121);
    playbackPositions.save(id, 130);
    playbackPositions.save(id, 179);
    expect(positionsStore.getState().version).toBe(positions0 + 3);
    expect(libraryStore.getState().version).toBe(library0);
    playbackPositions.clear(id);
    expect(positionsStore.getState().version).toBe(positions0 + 4);
    expect(libraryStore.getState().version).toBe(library0 + 1);
  });

  it("is inert before the library is ready", () => {
    const saved = libraryStore.getState().db;
    libraryStore.setState({ db: null });
    expect(() => playbackPositions.save("r1", 10)).not.toThrow();
    expect(playbackPositions.get("r1")).toBeNull();
    expect(playbackPositions.resume("r1", 600)).toBe(0);
    expect(() => playbackPositions.clear("r1")).not.toThrow();
    libraryStore.setState({ db: saved });
  });

  it("surfaces database failures instead of swallowing them", () => {
    const saved = libraryStore.getState().db;
    const broken = {
      select: () => {
        throw new Error("no such table: playback_positions");
      },
    };
    libraryStore.setState({ db: broken as unknown as typeof saved });
    expect(() => playbackPositions.get("r1")).toThrow("no such table");
    libraryStore.setState({ db: saved });
  });
});

describe("currentDb", () => {
  it("throws before the library is ready", () => {
    const saved = libraryStore.getState().db;
    libraryStore.setState({ db: null });
    expect(() => currentDb()).toThrow("Library is not ready");
    libraryStore.setState({ db: saved });
  });
});

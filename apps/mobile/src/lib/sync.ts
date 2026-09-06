import type { GrainClient, RecordingInclude } from "@grist/grain-api";
import {
  type Db,
  deleteRecordings,
  getMeta,
  pruneRecordingsBefore,
  recordingIds,
  recordingsMissingTranscript,
  setMeta,
  setTranscript,
  upsertRecordings,
} from "@/lib/db";

export type RecordingsApi = Pick<GrainClient["recordings"], "iterate" | "get" | "transcript">;

export const SYNC_INCLUDE: RecordingInclude = {
  participants: true,
  ai_action_items: true,
  ai_summary: true,
  highlights: true,
  calendar_event: true,
  screenshares: true,
};

const DAY = 24 * 60 * 60 * 1000;
export const WINDOW_MS = 90 * DAY;
export const RECONCILE_EVERY_MS = 7 * DAY;
export const INCREMENTAL_OVERLAP_MS = 2 * DAY;

export const META_LAST_SYNC = "last_sync_at";
export const META_LAST_RECONCILE = "last_reconcile_at";

export type SyncResult = { mode: "full" | "incremental"; upserted: number; removed: number };

export function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export type SyncOptions = { now?: number; onPage?: (upserted: number) => void };

export async function syncLibrary(
  db: Db,
  api: RecordingsApi,
  opts: SyncOptions | number = {},
): Promise<SyncResult> {
  const { now = Date.now(), onPage } = typeof opts === "number" ? { now: opts } : opts;
  const windowStart = now - WINDOW_MS;
  const lastSync = getMeta(db, META_LAST_SYNC);
  const lastReconcile = getMeta(db, META_LAST_RECONCILE);
  const full = !lastSync || !lastReconcile || now - Date.parse(lastReconcile) >= RECONCILE_EVERY_MS;
  const after = full
    ? windowStart
    : Math.max(windowStart, Date.parse(lastSync) - INCREMENTAL_OVERLAP_MS);

  const stamp = isoSeconds(now);
  const seen = new Set<string>();
  for await (const page of api.iterate({
    filter: { after_datetime: isoSeconds(after) },
    include: SYNC_INCLUDE,
  })) {
    upsertRecordings(db, page.recordings, stamp);
    for (const r of page.recordings) seen.add(r.id);
    onPage?.(seen.size);
  }

  let removed = pruneRecordingsBefore(db, isoSeconds(windowStart)).length;

  if (full) {
    const stale = recordingIds(db, isoSeconds(windowStart)).filter((id) => !seen.has(id));
    deleteRecordings(db, stale);
    removed += stale.length;
    setMeta(db, META_LAST_RECONCILE, stamp);
  }
  setMeta(db, META_LAST_SYNC, stamp);

  return { mode: full ? "full" : "incremental", upserted: seen.size, removed };
}

export async function refreshRecording(db: Db, api: RecordingsApi, id: string, now = Date.now()) {
  const recording = await api.get(id, SYNC_INCLUDE);
  upsertRecordings(db, [recording], isoSeconds(now));
  return recording;
}

export type PrefetchResult = { fetched: string[]; failed: string[] };

export async function prefetchTranscripts(
  db: Db,
  api: RecordingsApi,
  opts: { now?: number; concurrency?: number; limit?: number; shouldStop?: () => boolean } = {},
): Promise<PrefetchResult> {
  const now = opts.now ?? Date.now();
  const queue = recordingsMissingTranscript(db, isoSeconds(now - WINDOW_MS), opts.limit ?? 50);
  const result: PrefetchResult = { fetched: [], failed: [] };

  async function worker() {
    for (let id = queue.shift(); id; id = queue.shift()) {
      if (opts.shouldStop?.()) return;
      try {
        const segments = await api.transcript(id);
        setTranscript(db, id, segments, isoSeconds(now));
        result.fetched.push(id);
      } catch {
        result.failed.push(id);
      }
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency ?? 2 }, worker));
  return result;
}

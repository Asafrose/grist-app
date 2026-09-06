import { getTableColumns, sql } from "drizzle-orm";
import type { Db } from "./index";
import { recordings, type RecordingRow } from "./schema";

export function ftsQuery(text: string): string | null {
  const terms = text
    .split(/\s+/)
    .map((t) => t.replaceAll(/["*]/g, "").trim())
    .filter(Boolean);
  return terms.length ? terms.map((t) => `"${t}"*`).join(" ") : null;
}

export function searchRecordings(db: Db, text: string, limit = 50): RecordingRow[] {
  const q = ftsQuery(text);
  if (!q) return [];
  return db
    .select(getTableColumns(recordings))
    .from(recordings)
    .innerJoin(sql`recordings_fts`, sql`recordings_fts.id = ${recordings.id}`)
    .where(sql`recordings_fts MATCH ${q}`)
    .orderBy(sql`rank`)
    .limit(limit)
    .all();
}

export type TranscriptHit = {
  recordingId: string;
  idx: number;
  start: number;
  speaker: string;
  snippet: string;
};

export function searchTranscripts(
  db: Db,
  text: string,
  opts: { recordingId?: string; limit?: number } = {},
): TranscriptHit[] {
  const q = ftsQuery(text);
  if (!q) return [];
  const scope = opts.recordingId ? sql`AND f.recording_id = ${opts.recordingId}` : sql``;
  return db.all<TranscriptHit>(sql`
    SELECT f.recording_id AS "recordingId", f.idx AS idx, s.start AS start, s.speaker AS speaker,
           snippet(transcript_fts, 2, '[', ']', '…', 14) AS snippet
    FROM transcript_fts f
    JOIN transcript_segments s ON s.recording_id = f.recording_id AND s.idx = f.idx
    WHERE transcript_fts MATCH ${q} ${scope}
    ORDER BY rank
    LIMIT ${opts.limit ?? 50}
  `);
}

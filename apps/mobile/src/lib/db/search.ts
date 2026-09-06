import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { matchRuns, queryTerms, serializeRuns } from "@/lib/snippet";
import type { Db } from "./index";
import { type HighlightRow, highlights, type RecordingRow, recordings } from "./schema";

export function ftsQuery(text: string): string | null {
  const terms = queryTerms(text);
  return terms.length ? terms.map((t) => `"${t}"*`).join(" ") : null;
}

export function searchRecordings(db: Db, text: string, limit = 50): RecordingRow[] {
  const q = ftsQuery(text);
  if (!q) return [];
  const first = `%${queryTerms(text)[0].toLowerCase()}%`;
  return db
    .select(getTableColumns(recordings))
    .from(recordings)
    .innerJoin(sql`recordings_fts`, sql`recordings_fts.id = ${recordings.id}`)
    .where(sql`recordings_fts MATCH ${`{title participants tags}: ${q}`}`)
    .orderBy(
      sql`CASE WHEN lower(${recordings.title}) LIKE ${first} THEN 0 ELSE 1 END`,
      sql`bm25(recordings_fts, 0, 10.0, 0, 3.0, 3.0)`,
      desc(recordings.startDatetime),
    )
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

export type TranscriptGroup = { recording: RecordingRow; hits: TranscriptHit[] };

export function searchTranscriptsGrouped(db: Db, text: string, limit = 100): TranscriptGroup[] {
  const hits = searchTranscripts(db, text, { limit });
  if (!hits.length) return [];
  const ids = [...new Set(hits.map((h) => h.recordingId))];
  const rows = db.select().from(recordings).where(inArray(recordings.id, ids)).all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groups = new Map<string, TranscriptGroup>();
  for (const hit of hits) {
    const recording = byId.get(hit.recordingId);
    if (!recording) continue;
    const group = groups.get(hit.recordingId) ?? { recording, hits: [] };
    group.hits.push(hit);
    groups.set(hit.recordingId, group);
  }
  for (const g of groups.values()) g.hits.sort((a, b) => a.start - b.start);
  return [...groups.values()];
}

export type HighlightHit = { highlight: HighlightRow; recording: RecordingRow; snippet: string };

const escapeLike = (s: string) => s.replaceAll(/[\\%_]/g, "\\$&");

export function searchHighlights(db: Db, text: string, limit = 50): HighlightHit[] {
  const terms = queryTerms(text);
  if (!terms.length) return [];
  const haystack = sql`(${highlights.text} || ' ' || coalesce(${highlights.transcript}, ''))`;
  const rows = db
    .select({ highlight: highlights, recording: recordings })
    .from(highlights)
    .innerJoin(recordings, eq(highlights.recordingId, recordings.id))
    .where(and(...terms.map((t) => sql`${haystack} LIKE ${`%${escapeLike(t)}%`} ESCAPE '\\'`)))
    .orderBy(desc(recordings.startDatetime), desc(highlights.createdDatetime))
    .limit(limit)
    .all();
  return rows.map(({ highlight, recording }) => {
    const title = matchRuns(highlight.text, text);
    const runs =
      title.some((r) => r.match) || !highlight.transcript
        ? title
        : matchRuns(highlight.transcript, text);
    return { highlight, recording, snippet: serializeRuns(runs) };
  });
}

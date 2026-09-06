import type { Transcript } from "@grist/grain-api";
import { asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Db } from "./index";
import { recordings, transcriptSegments, transcripts } from "./schema";

const CHUNK = 200;

export function setTranscript(
  db: Db,
  recordingId: string,
  segments: Transcript,
  fetchedAt: string,
) {
  db.transaction((tx) => {
    tx.delete(transcriptSegments).where(eq(transcriptSegments.recordingId, recordingId)).run();
    tx.run(sql`DELETE FROM transcript_fts WHERE recording_id = ${recordingId}`);
    for (let i = 0; i < segments.length; i += CHUNK) {
      const chunk = segments.slice(i, i + CHUNK);
      tx.insert(transcriptSegments)
        .values(
          chunk.map((s, j) => ({
            recordingId,
            idx: i + j,
            participantId: s.participant_id ?? null,
            speaker: s.speaker,
            start: s.start,
            end: s.end,
            text: s.text,
          })),
        )
        .run();
      tx.run(
        sql`INSERT INTO transcript_fts (recording_id, idx, text) VALUES ${sql.join(
          chunk.map((s, j) => sql`(${recordingId}, ${i + j}, ${s.text})`),
          sql`, `,
        )}`,
      );
    }
    tx.insert(transcripts)
      .values({ recordingId, fetchedAt, segmentCount: segments.length })
      .onConflictDoUpdate({
        target: transcripts.recordingId,
        set: { fetchedAt, segmentCount: segments.length },
      })
      .run();
  });
}

export function getTranscript(db: Db, recordingId: string) {
  return db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.recordingId, recordingId))
    .orderBy(asc(transcriptSegments.idx))
    .all();
}

export function hasTranscript(db: Db, recordingId: string): boolean {
  return !!db.select().from(transcripts).where(eq(transcripts.recordingId, recordingId)).get();
}

export function recordingsMissingTranscript(db: Db, after: string, limit = 50): string[] {
  return db
    .select({ id: recordings.id })
    .from(recordings)
    .leftJoin(transcripts, eq(transcripts.recordingId, recordings.id))
    .where(
      sql`${isNull(transcripts.recordingId)} AND ${gte(recordings.startDatetime, after)} AND ${recordings.mediaType} != 'transcript'`,
    )
    .orderBy(desc(recordings.startDatetime))
    .limit(limit)
    .all()
    .map((r) => r.id);
}

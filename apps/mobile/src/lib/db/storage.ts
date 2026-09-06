import { count, sql } from "drizzle-orm";
import type { Db } from "./index";
import { recordings, transcriptSegments, transcripts } from "./schema";

export type IndexSize = { meetings: number; segments: number };

export function indexSize(db: Db): IndexSize {
  return {
    meetings: db.select({ n: count() }).from(transcripts).get()!.n,
    segments: db.select({ n: count() }).from(transcriptSegments).get()!.n,
  };
}

export function clearIndex(db: Db): void {
  db.transaction((tx) => {
    tx.delete(transcriptSegments).run();
    tx.delete(transcripts).run();
    tx.run(sql`DELETE FROM transcript_fts`);
  });
}

export function listRecorders(db: Db) {
  return db
    .select({ recorders: recordings.recorders })
    .from(recordings)
    .all()
    .flatMap((r) => r.recorders);
}

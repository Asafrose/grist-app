import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { recordingOpens } from "./schema";

export function getRecordingOpen(db: Db, recordingId: string): string | null {
  return (
    db
      .select({ openedAt: recordingOpens.openedAt })
      .from(recordingOpens)
      .where(eq(recordingOpens.recordingId, recordingId))
      .get()?.openedAt ?? null
  );
}

export function markRecordingOpened(db: Db, recordingId: string, openedAt: string): boolean {
  if (getRecordingOpen(db, recordingId) !== null) return false;
  db.insert(recordingOpens)
    .values({ recordingId, openedAt })
    .onConflictDoNothing({ target: recordingOpens.recordingId })
    .run();
  return true;
}

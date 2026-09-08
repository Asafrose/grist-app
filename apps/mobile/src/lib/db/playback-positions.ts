import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { playbackPositions } from "./schema";

export const RESUME_END_MARGIN_SECONDS = 10;

export function getPlaybackPosition(db: Db, recordingId: string): number | null {
  return (
    db
      .select({ positionSeconds: playbackPositions.positionSeconds })
      .from(playbackPositions)
      .where(eq(playbackPositions.recordingId, recordingId))
      .get()?.positionSeconds ?? null
  );
}

export function setPlaybackPosition(db: Db, recordingId: string, positionSeconds: number): void {
  const positions = Math.max(0, Math.round(positionSeconds));
  const updatedAt = new Date().toISOString();
  db.insert(playbackPositions)
    .values({ recordingId, positionSeconds: positions, updatedAt })
    .onConflictDoUpdate({
      target: playbackPositions.recordingId,
      set: { positionSeconds: positions, updatedAt },
    })
    .run();
}

export function clearPlaybackPosition(db: Db, recordingId: string): void {
  db.delete(playbackPositions).where(eq(playbackPositions.recordingId, recordingId)).run();
}

export function resumePosition(db: Db, recordingId: string, durationSeconds: number): number {
  const stored = getPlaybackPosition(db, recordingId);
  if (stored === null || stored <= 0) return 0;
  if (durationSeconds > 0 && stored >= durationSeconds - RESUME_END_MARGIN_SECONDS) return 0;
  return stored;
}

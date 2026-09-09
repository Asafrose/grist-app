import {
  clearPlaybackPosition,
  getPlaybackPosition,
  resumePosition,
  setPlaybackPosition,
} from "@/lib/db";
import { library } from "@/lib/library";
import { currentDb, useSnapshot, withDb } from "./live";

const signalled = new Map<string, number>();

// Rows show whole minutes left, so 5s playback writes wake live queries only on a minute change.
function signalMinute(id: string, minute: number): void {
  if (signalled.get(id) === minute) return;
  signalled.set(id, minute);
  library.touch();
}

export function useResumePosition(recordingId: string, durationSeconds: number): number {
  return useSnapshot(
    (db) => resumePosition(db, recordingId, durationSeconds),
    [recordingId, durationSeconds],
  );
}

export const playbackPositions = {
  get: (id: string) => withDb(() => getPlaybackPosition(currentDb(), id), null),
  resume: (id: string, durationSeconds: number) =>
    withDb(() => resumePosition(currentDb(), id, durationSeconds), 0),
  save: (id: string, positionSeconds: number) =>
    withDb(() => {
      setPlaybackPosition(currentDb(), id, positionSeconds);
      signalMinute(id, Math.floor(Math.max(0, positionSeconds) / 60));
    }, undefined),
  clear: (id: string) =>
    withDb(() => {
      clearPlaybackPosition(currentDb(), id);
      signalled.delete(id);
      library.touch();
    }, undefined),
};

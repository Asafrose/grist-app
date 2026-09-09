import {
  clearPlaybackPosition,
  getPlaybackPosition,
  resumePosition,
  setPlaybackPosition,
} from "@/lib/db";
import { library } from "@/lib/library";
import { currentDb, positionsVersion, useSnapshot, withDb } from "./live";

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
      positionsVersion.bump();
    }, undefined),
  clear: (id: string) =>
    withDb(() => {
      clearPlaybackPosition(currentDb(), id);
      positionsVersion.bump();
      library.touch();
    }, undefined),
};

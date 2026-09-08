import {
  clearPlaybackPosition,
  getPlaybackPosition,
  resumePosition,
  setPlaybackPosition,
} from "@/lib/db";
import { currentDb, LibraryNotReadyError } from "./live";

function withDb<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch (e) {
    if (e instanceof LibraryNotReadyError) return fallback;
    throw e;
  }
}

export const playbackPositions = {
  get: (id: string) => withDb(() => getPlaybackPosition(currentDb(), id), null),
  resume: (id: string, durationSeconds: number) =>
    withDb(() => resumePosition(currentDb(), id, durationSeconds), 0),
  save: (id: string, positionSeconds: number) =>
    withDb(() => setPlaybackPosition(currentDb(), id, positionSeconds), undefined),
  clear: (id: string) => withDb(() => clearPlaybackPosition(currentDb(), id), undefined),
};

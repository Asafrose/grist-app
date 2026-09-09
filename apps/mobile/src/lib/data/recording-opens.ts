import { getRecordingOpen, markRecordingOpened } from "@/lib/db";
import { library } from "@/lib/library";
import { currentDb, withDb } from "./live";

export const recordingOpens = {
  get: (id: string) => withDb(() => getRecordingOpen(currentDb(), id), null),
  markOpened: (id: string, openedAt = new Date().toISOString()) =>
    withDb(() => {
      if (markRecordingOpened(currentDb(), id, openedAt)) library.touch();
    }, undefined),
};

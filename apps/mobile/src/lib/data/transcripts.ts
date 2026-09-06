import { clearIndex, indexStats, transcriptQuery } from "@/lib/db";
import { library } from "@/lib/library";
import { currentDb, useLive, useSnapshot } from "./live";

export function useTranscript(recordingId: string) {
  return useLive((db) => transcriptQuery(db, recordingId), [recordingId]).data;
}

export function useIndexStats() {
  return useSnapshot((db) => indexStats(db), []);
}

export const transcriptIndex = {
  clear: () => {
    clearIndex(currentDb());
    library.touch();
  },
};

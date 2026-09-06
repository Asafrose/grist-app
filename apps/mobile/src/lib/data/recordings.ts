import {
  countRecordings,
  participantOptions,
  type RecordingDetail,
  recordingQuery,
  type RecordingsFilter,
  recordingsQuery,
  tagOptions,
  teamsQuery,
} from "@/lib/db";
import { library } from "@/lib/library";
import { refreshRecording, type RecordingsApi } from "@/lib/sync";
import { currentDb, useLive, useSnapshot } from "./live";

export function useRecordings(filter: RecordingsFilter) {
  return useLive((db) => recordingsQuery(db, filter), [filter]);
}

export function useRecording(id: string): RecordingDetail | null {
  const { data } = useLive((db) => recordingQuery(db, id), [id]);
  return data ?? null;
}

export function useRecordingCount(filter: RecordingsFilter): number {
  return useSnapshot((db) => countRecordings(db, filter), [filter]);
}

export function useParticipantOptions(limit = 40) {
  return useSnapshot((db) => participantOptions(db).slice(0, limit), [limit]);
}

export function useTagOptions() {
  return useSnapshot((db) => tagOptions(db), []);
}

export function useTeams() {
  return useLive((db) => teamsQuery(db), []).data;
}

export const recordings = {
  refresh: async (id: string, api: RecordingsApi) => {
    await refreshRecording(currentDb(), api, id);
    library.touch();
  },
};

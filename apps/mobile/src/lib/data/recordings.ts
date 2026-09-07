import { MutationObserver } from "@tanstack/react-query";
import {
  countRecordings,
  participantOptions,
  type RecordingDetail,
  recordingQuery,
  type RecordingsFilter,
  recordingsQuery,
  recorderOptions,
  setRecordingTags,
  renameRecording,
  tagOptions,
  teamsQuery,
} from "@/lib/db";
import { library } from "@/lib/library";
import { queryClient } from "@/lib/query";
import { refreshRecording, type RecordingsApi } from "@/lib/sync";
import { toggleTag } from "@/lib/timeline";
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

export function useRecorderOptions() {
  return useSnapshot((db) => recorderOptions(db), []);
}

export function useTagOptions() {
  return useSnapshot((db) => tagOptions(db), []);
}

export function useTeams() {
  return useLive((db) => teamsQuery(db), []).data;
}

export type TagsApi = {
  addTag(id: string, tag: string): Promise<unknown>;
  removeTag(id: string, tag: string): Promise<unknown>;
};

async function writeTags(id: string, tag: string, on: boolean, api: TagsApi | null) {
  if (api) await (on ? api.addTag(id, tag) : api.removeTag(id, tag));
  const db = currentDb();
  const current = recordingQuery(db, id).sync()?.tags ?? [];
  setRecordingTags(db, id, toggleTag(current, tag, on));
  library.touch();
}
export type RenameApi = { rename(id: string, title: string): Promise<unknown> };

export const recordings = {
  refresh: (id: string, api: RecordingsApi) =>
    new MutationObserver<null, Error, void>(queryClient, {
      mutationKey: ["recording", id],
      mutationFn: async () => {
        await refreshRecording(currentDb(), api, id);
        library.touch();
        return null;
      },
    }).mutate(),
  addTag: (id: string, tag: string, api: TagsApi | null) => writeTags(id, tag, true, api),
  removeTag: (id: string, tag: string, api: TagsApi | null) => writeTags(id, tag, false, api),
  rename: async (id: string, title: string, api: RenameApi | null) => {
    if (api) await api.rename(id, title);
    renameRecording(currentDb(), id, title);
    library.touch();
  },
};

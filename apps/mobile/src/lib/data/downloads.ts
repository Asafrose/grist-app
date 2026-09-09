import { useMemo } from "react";
import { useStore } from "zustand";
import { type RecordingListRow, recordingsQuery } from "@/lib/db";
import { downloadsStore } from "@/lib/downloads";
import { useLive, usePositionsVersion } from "./live";

export function useDownloadedIds(): string[] {
  const byId = useStore(downloadsStore, (s) => s.byId);
  return useMemo(
    () =>
      Object.keys(byId)
        .filter((id) => byId[id].status === "done")
        .sort(),
    [byId],
  );
}

export function useDownloadedRecordings(): RecordingListRow[] {
  const ids = useDownloadedIds();
  const key = ids.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `ids`
  const filter = useMemo(() => ({ ids }), [key]);
  const version = usePositionsVersion();
  return useLive((db) => recordingsQuery(db, filter), [key], { version }).data;
}

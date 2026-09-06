import { type HighlightsFilter, highlightsQuery } from "@/lib/db";
import { useLive } from "./live";

export function useClips(filter: HighlightsFilter) {
  return useLive(
    (db) => highlightsQuery(db, filter),
    [filter.limit, filter.teamId, filter.recorderId, filter.participantEmail],
  ).data;
}

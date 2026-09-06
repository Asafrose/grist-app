import {
  type HighlightHit,
  type RecordingRow,
  searchHighlights,
  searchRecordings,
  searchTranscriptsGrouped,
  type TranscriptGroup,
} from "@/lib/db";
import { library } from "@/lib/library";
import { addRecentSearch, clearRecentSearches, getRecentSearches } from "@/lib/recent-searches";
import { currentDb, useSnapshot } from "./live";

export type SearchSegment = "titles" | "transcripts" | "clips";

export type SearchResult =
  | { segment: "titles"; recordings: RecordingRow[] }
  | { segment: "transcripts"; groups: TranscriptGroup[] }
  | { segment: "clips"; hits: HighlightHit[] };

export function useSearch(q: string, segment: SearchSegment): SearchResult {
  return useSnapshot(
    (db) => {
      if (segment === "titles") return { segment, recordings: q ? searchRecordings(db, q) : [] };
      if (segment === "transcripts")
        return { segment, groups: q ? searchTranscriptsGrouped(db, q) : [] };
      return { segment, hits: q ? searchHighlights(db, q) : [] };
    },
    [q, segment],
  );
}

export function useRecentSearches(): string[] {
  return useSnapshot((db) => getRecentSearches(db), []);
}

export const recentSearches = {
  add: (text: string) => {
    if (!text.trim()) return;
    addRecentSearch(currentDb(), text);
    library.touch();
  },
  clear: () => {
    clearRecentSearches(currentDb());
    library.touch();
  },
};

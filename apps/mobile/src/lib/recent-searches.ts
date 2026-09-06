import { type Db, deleteMeta, getMeta, setMeta } from "@/lib/db";

export const META_RECENT_SEARCHES = "recent_searches";
export const RECENT_SEARCHES_MAX = 10;

export function getRecentSearches(db: Db): string[] {
  const raw = getMeta(db, META_RECENT_SEARCHES);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(db: Db, text: string): string[] {
  const term = text.trim();
  const current = getRecentSearches(db);
  if (!term) return current;
  const next = [term, ...current.filter((t) => t.toLowerCase() !== term.toLowerCase())].slice(
    0,
    RECENT_SEARCHES_MAX,
  );
  setMeta(db, META_RECENT_SEARCHES, JSON.stringify(next));
  return next;
}

export function clearRecentSearches(db: Db): void {
  deleteMeta(db, META_RECENT_SEARCHES);
}

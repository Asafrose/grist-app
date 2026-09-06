import { setMeta } from "@/lib/db";
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  META_RECENT_SEARCHES,
  RECENT_SEARCHES_MAX,
} from "@/lib/recent-searches";
import { testDb } from "@/test/db";

describe("recent searches", () => {
  it("starts empty and stores trimmed terms most recent first", () => {
    const db = testDb();
    expect(getRecentSearches(db)).toEqual([]);
    addRecentSearch(db, "  pricing ");
    expect(addRecentSearch(db, "renewal")).toEqual(["renewal", "pricing"]);
    expect(getRecentSearches(db)).toEqual(["renewal", "pricing"]);
  });

  it("ignores blank terms and dedupes case-insensitively by moving to the front", () => {
    const db = testDb();
    addRecentSearch(db, "pricing");
    addRecentSearch(db, "renewal");
    expect(addRecentSearch(db, "   ")).toEqual(["renewal", "pricing"]);
    expect(addRecentSearch(db, "Pricing")).toEqual(["Pricing", "renewal"]);
  });

  it("keeps only the last ten", () => {
    const db = testDb();
    for (let i = 0; i < RECENT_SEARCHES_MAX + 3; i++) addRecentSearch(db, `term ${i}`);
    const list = getRecentSearches(db);
    expect(list).toHaveLength(RECENT_SEARCHES_MAX);
    expect(list[0]).toBe(`term ${RECENT_SEARCHES_MAX + 2}`);
    expect(list).not.toContain("term 0");
  });

  it("clears the list", () => {
    const db = testDb();
    addRecentSearch(db, "pricing");
    clearRecentSearches(db);
    expect(getRecentSearches(db)).toEqual([]);
  });

  it("tolerates corrupt stored values", () => {
    const db = testDb();
    setMeta(db, META_RECENT_SEARCHES, "not json");
    expect(getRecentSearches(db)).toEqual([]);
    setMeta(db, META_RECENT_SEARCHES, JSON.stringify({ nope: 1 }));
    expect(getRecentSearches(db)).toEqual([]);
    setMeta(db, META_RECENT_SEARCHES, JSON.stringify(["ok", 3, null]));
    expect(getRecentSearches(db)).toEqual(["ok"]);
  });
});

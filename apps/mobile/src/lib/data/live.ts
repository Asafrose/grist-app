import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { useMemo } from "react";
import type { Db } from "@/lib/db";
import { libraryStore, useDb, useLibraryVersion } from "@/lib/library";

export function currentDb(): Db {
  const db = libraryStore.getState().db;
  if (!db) throw new Error("Library is not ready");
  return db;
}

type Live<T> = { data: T; updatedAt: Date | undefined };

const keyOf = (deps: readonly unknown[]) => JSON.stringify(deps);

export function useLive<T>(make: (db: Db) => { all(): T }, deps: readonly unknown[]): Live<T>;
export function useLive<T>(
  make: (db: Db) => { sync(): T },
  deps: readonly unknown[],
): Live<T | undefined>;
export function useLive<T>(
  make: (db: Db) => { all(): T } | { sync(): T },
  deps: readonly unknown[],
): Live<T | undefined> {
  const db = useDb();
  const version = useLibraryVersion();
  const key = keyOf(deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `deps`
  const query = useMemo(() => make(db), [db, key]);
  const { data, updatedAt } = useLiveQuery(query as never, [db, version, key]);
  return { data: data as T | undefined, updatedAt };
}

export function useSnapshot<T>(read: (db: Db) => T, deps: readonly unknown[]): T {
  const db = useDb();
  const version = useLibraryVersion();
  const key = keyOf(deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read on every library change
  return useMemo(() => read(db), [db, version, key]);
}

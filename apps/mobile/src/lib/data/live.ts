import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { useMemo, useRef } from "react";
import { create, useStore } from "zustand";
import { authStore } from "@/lib/auth";
import type { Db } from "@/lib/db";
import { libraryStore, useDb, useLibraryVersion } from "@/lib/library";

export class LibraryNotReadyError extends Error {
  constructor() {
    super("Library is not ready");
  }
}

export function currentDb(): Db {
  const db = libraryStore.getState().db;
  if (!db) throw new LibraryNotReadyError();
  return db;
}

export function withDb<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch (e) {
    if (e instanceof LibraryNotReadyError) return fallback;
    throw e;
  }
}

type PositionsState = { version: number };

export const positionsStore = create<PositionsState>(() => ({ version: 0 }));

export const usePositionsVersion = () => useStore(positionsStore, (s) => s.version);

export const positionsVersion = {
  bump: () => positionsStore.setState((s) => ({ version: s.version + 1 })),
  reset: () => positionsStore.setState({ version: 0 }),
};

authStore.subscribe((s, prev) => {
  if (prev.status === "signed-in" && s.status !== "signed-in") positionsVersion.reset();
});

type Live<T> = { data: T; updatedAt: Date | undefined };

export type VersionOptions = { version?: number };

export type LiveOptions = VersionOptions & { keepPrevious?: boolean };

const keyOf = (deps: readonly unknown[], version: number | undefined) =>
  JSON.stringify([deps, version]);

export function useLive<T>(
  make: (db: Db) => { all(): T },
  deps: readonly unknown[],
  options?: LiveOptions,
): Live<T>;
export function useLive<T>(
  make: (db: Db) => { sync(): T },
  deps: readonly unknown[],
  options?: LiveOptions,
): Live<T | undefined>;
export function useLive<T>(
  make: (db: Db) => { all(): T } | { sync(): T },
  deps: readonly unknown[],
  options: LiveOptions = {},
): Live<T | undefined> {
  const db = useDb();
  const version = useLibraryVersion();
  const key = keyOf(deps, options.version);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `deps`
  const query = useMemo(() => make(db), [db, key]);
  const { data, updatedAt } = useLiveQuery(query as never, [db, version, key]);
  const previous = useRef<Live<T | undefined>>({ data: undefined, updatedAt: undefined });
  if (data !== undefined) previous.current = { data: data as T, updatedAt };
  if (options.keepPrevious && data === undefined) return previous.current;
  return { data: data as T | undefined, updatedAt };
}

export function useSnapshot<T>(
  read: (db: Db) => T,
  deps: readonly unknown[],
  options: VersionOptions = {},
): T {
  const db = useDb();
  const version = useLibraryVersion();
  const key = keyOf(deps, options.version);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read on every library change
  return useMemo(() => read(db), [db, version, key]);
}

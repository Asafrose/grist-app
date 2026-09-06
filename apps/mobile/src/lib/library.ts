import * as Network from "expo-network";
import { AppState } from "react-native";
import { create } from "zustand";
import { auth, authStore } from "@/lib/auth";
import { clearAll, type Db, getMeta } from "@/lib/db";
import { openDb } from "@/lib/db/open";
import { isDemoToken, seedDemo } from "@/lib/demo";
import { makeClient } from "@/lib/grain";
import { playback } from "@/lib/player";
import { hydrateSettings, persistSettings } from "@/lib/settings";
import { META_LAST_SYNC, prefetchTranscripts, type RecordingsApi, syncLibrary } from "@/lib/sync";
import { thumbnails } from "@/lib/thumbnails";
import { syncWorkspace } from "@/lib/workspace";

export const REFRESH_DEBOUNCE_MS = 60_000;
export const PREFETCH_YIELD_MS = 8_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type LibraryState = {
  db: Db | null;
  sync: "idle" | "syncing" | "error";
  lastSyncAt: string | null;
  error: string | null;
  version: number;
};

export const libraryStore = create<LibraryState>(() => ({
  db: null,
  sync: "idle",
  lastSyncAt: null,
  error: null,
  version: 0,
}));

function bump(patch: Partial<LibraryState> = {}) {
  libraryStore.setState((s) => ({ ...patch, version: s.version + 1 }));
}

let inflight: Promise<void> | null = null;
let lastRunAt = 0;

async function refresh(force = false): Promise<void> {
  await libraryReady;
  const { db } = libraryStore.getState();
  const token = auth.token();
  if (!db || !token) return;
  if (inflight) {
    if (!force) return inflight;
    await inflight;
  }
  if (!force && Date.now() - lastRunAt < REFRESH_DEBOUNCE_MS) return;

  libraryStore.setState({ sync: "syncing", error: null });
  inflight = (async () => {
    try {
      if (isDemoToken(token)) {
        seedDemo(db);
        bump({ sync: "idle", lastSyncAt: new Date().toISOString() });
        return;
      }
      const client = makeClient(token);
      const api = client.recordings;
      await syncLibrary(db, api, { onPage: () => bump() });
      await syncWorkspace(db, client).catch(() => undefined);
      bump({ sync: "idle", lastSyncAt: getMeta(db, META_LAST_SYNC) });
      void prefetchInBackground(db, api, token);
    } catch (e) {
      bump({ sync: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      lastRunAt = Date.now();
      inflight = null;
    }
  })();
  return inflight;
}

let prefetching: Promise<void> | null = null;

function prefetchInBackground(db: Db, api: RecordingsApi, token: string): Promise<void> {
  if (prefetching) return prefetching;
  prefetching = (async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (net.type !== Network.NetworkStateType.WIFI) return;
      await Promise.race([thumbnails.whenIdle(), sleep(PREFETCH_YIELD_MS)]);
      if (auth.token() !== token) return;
      await prefetchTranscripts(db, api, { shouldStop: () => auth.token() !== token });
      if (auth.token() === token) bump();
    } catch {
      // transcripts are a cache; the next refresh tries again
    } finally {
      prefetching = null;
    }
  })();
  return prefetching;
}

export const library = {
  refresh,
  clear,
  touch: () => bump(),
  onChange: (fn: () => void) =>
    libraryStore.subscribe((s, prev) => {
      if (s.version !== prev.version) fn();
    }),
  prefetchDone: () => prefetching ?? Promise.resolve(),
};

async function clear(): Promise<void> {
  await libraryReady;
  const { db } = libraryStore.getState();
  if (!db) return;
  playback.stop();
  thumbnails.clear();
  clearAll(db);
  persistSettings();
  lastRunAt = 0;
  bump({ sync: "idle", lastSyncAt: null, error: null });
}

async function hydrate(): Promise<void> {
  const db = await openDb();
  hydrateSettings(db);
  libraryStore.setState({ db, lastSyncAt: getMeta(db, META_LAST_SYNC) });
}

export const libraryReady = hydrate().then(() => {
  if (authStore.getState().status === "signed-in") void refresh();
});

authStore.subscribe((s, prev) => {
  if (s.token === prev.token) return;
  const wasSignedIn = prev.status === "signed-in";
  if (s.status === "signed-in") {
    void (wasSignedIn ? clear() : Promise.resolve()).then(() => refresh(true));
  } else if (wasSignedIn) {
    void clear();
  }
});

AppState.addEventListener("change", (state) => {
  if (state === "active") void refresh();
});

export const useLibraryVersion = () => libraryStore((s) => s.version);
export const useSyncStatus = () => libraryStore((s) => s.sync);
export const useSyncError = () => libraryStore((s) => s.error);

export function useDb(): Db {
  const db = libraryStore((s) => s.db);
  if (!db) throw new Error("useDb called before libraryReady resolved");
  return db;
}

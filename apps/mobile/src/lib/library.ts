import { focusManager, onlineManager, skipToken, useQuery } from "@tanstack/react-query";
import * as Network from "expo-network";
import { create, useStore } from "zustand";
import { auth, authStore, useAuthToken } from "@/lib/auth";
import { cancelPrewarm, runPrewarm } from "@/lib/prewarm";
import { clearAll, type Db, getMeta } from "@/lib/db";
import { openDb } from "@/lib/db/open";
import { isDemoToken, seedDemo } from "@/lib/demo";
import { downloads } from "@/lib/downloads";
import { makeClient } from "@/lib/grain";
import { tokenErrorMessage } from "@/lib/token-error";
import { clearMediaUrls } from "@/lib/media-url";
import { me } from "@/lib/me";
import { queryClient, reportAuthFailure } from "@/lib/query";
import { hydrateFilters, syncFilterTeams } from "@/lib/filters";
import { hydrateSettings, persistSettings } from "@/lib/settings";
import { META_LAST_SYNC, prefetchTranscripts, type RecordingsApi, syncLibrary } from "@/lib/sync";
import { thumbnails } from "@/lib/thumbnails";
import { syncWorkspace } from "@/lib/workspace";

export const LIBRARY_STALE_MS = 60_000;
export const PREFETCH_YIELD_MS = 8_000;
export const BUMP_THROTTLE_MS = 500;

export const libraryKey = (token: string) => ["library", token] as const;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type LibraryState = {
  db: Db | null;
  version: number;
  offlineHint: boolean;
};

export const libraryStore = create<LibraryState>(() => ({
  db: null,
  version: 0,
  offlineHint: false,
}));

function bump() {
  libraryStore.setState((s) => ({ version: s.version + 1 }));
  const db = libraryStore.getState().db;
  if (db) syncFilterTeams(db);
}

type BumpThrottle = { bump: () => void; cancel: () => void };

function makeBumpThrottle(): BumpThrottle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  const open = () => {
    timer = setTimeout(() => {
      timer = null;
      if (!pending) return;
      pending = false;
      bump();
      open();
    }, BUMP_THROTTLE_MS);
  };
  return {
    bump: () => {
      if (timer) {
        pending = true;
        return;
      }
      bump();
      open();
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = false;
    },
  };
}

let activeThrottle: BumpThrottle | null = null;

async function runSync(db: Db, token: string): Promise<string> {
  if (isDemoToken(token)) {
    void me.resolve(db, token);
    seedDemo(db);
    bump();
    return new Date().toISOString();
  }
  const client = makeClient(token);
  void me.resolve(db, token, client);
  const api = client.recordings;
  const throttle = makeBumpThrottle();
  activeThrottle = throttle;
  try {
    await syncLibrary(db, api, { onPage: () => throttle.bump() });
    await syncWorkspace(db, client, token).catch(() => undefined);
    auth.accept();
    bump();
  } finally {
    throttle.cancel();
    if (activeThrottle === throttle) activeThrottle = null;
  }
  void prefetchInBackground(db, api, token);
  return getMeta(db, META_LAST_SYNC) ?? new Date().toISOString();
}

async function refresh(force = false): Promise<void> {
  await libraryReady;
  const { db } = libraryStore.getState();
  const token = auth.token();
  if (!db || !token) return;
  downloads.prune();
  if (!onlineManager.isOnline()) {
    if (force) libraryStore.setState({ offlineHint: true });
    return;
  }
  const queryKey = libraryKey(token);
  if (force) await queryClient.invalidateQueries({ queryKey, refetchType: "none" });
  try {
    await queryClient.fetchQuery({
      queryKey,
      queryFn: () => runSync(db, token),
      staleTime: LIBRARY_STALE_MS,
    });
    libraryStore.setState({ offlineHint: false });
    void runPrewarm(db);
  } catch (e) {
    reportAuthFailure(e);
    // the failure lives in the query state; useSyncError surfaces it
  }
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
  activeThrottle?.cancel();
  cancelPrewarm();
  downloads.clear();
  thumbnails.clear();
  me.reset();
  clearAll(db);
  persistSettings();
  queryClient.removeQueries({ queryKey: ["library"] });
  queryClient.removeQueries({ queryKey: ["workspace"] });
  clearMediaUrls();
  libraryStore.setState({ offlineHint: false });
  bump();
}

async function hydrate(): Promise<void> {
  const db = await openDb();
  me.hydrate(db);
  hydrateSettings(db);
  hydrateFilters(db);
  downloads.prune();
  libraryStore.setState({ db });
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

focusManager.subscribe((focused) => {
  if (focused) void refresh();
});

onlineManager.subscribe((online) => {
  if (online) void refresh();
});

export const useLibraryVersion = () => useStore(libraryStore, (s) => s.version);

export const useOfflineHint = () => useStore(libraryStore, (s) => s.offlineHint);

function useLibraryQuery() {
  const token = useAuthToken();
  return useQuery({ queryKey: libraryKey(token ?? ""), queryFn: skipToken }, queryClient);
}

export const useSyncStatus = (): "idle" | "syncing" | "error" => {
  const { fetchStatus, error } = useLibraryQuery();
  if (fetchStatus === "fetching") return "syncing";
  return error ? "error" : "idle";
};

export const useSyncError = (): string | null => {
  const { error } = useLibraryQuery();
  if (!error) return null;
  return tokenErrorMessage(error);
};

export function useDb(): Db {
  const db = useStore(libraryStore, (s) => s.db);
  if (!db) throw new Error("useDb called before libraryReady resolved");
  return db;
}

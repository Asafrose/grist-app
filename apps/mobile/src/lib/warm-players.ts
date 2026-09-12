import { createVideoPlayer, type VideoPlayer, type VideoPlayerEvents } from "expo-video";
import * as Network from "expo-network";
import { AppState, type AppStateStatus } from "react-native";
import { auth, authStore } from "@/lib/auth";
import { playbackPositions } from "@/lib/data/playback-positions";
import { isDemoToken } from "@/lib/demo";
import { downloads } from "@/lib/downloads";
import { library, libraryStore } from "@/lib/library";
import { mediaUrl } from "@/lib/media-url";
import { prewarmDone, prewarmWindowStart } from "@/lib/prewarm";
import { listRecordings } from "@/lib/db";

export const WARM_POOL_SIZE = 3;
export const WARM_DEBOUNCE_MS = 1_000;
export const WARM_BACKGROUND_RELEASE_MS = 3 * 60_000;

type Candidate = { id: string; title: string; thumbnailUrl: string | null; durationMs: number };

type Warm = {
  id: string;
  player: VideoPlayer;
  ready: boolean;
  taken: boolean;
  released: boolean;
  drop: () => void;
};

let currentRecordingId: () => string | null = () => null;
let pool: Warm[] = [];
let running: Promise<void> | null = null;
let rerun = false;
let generation = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let backgroundTimer: ReturnType<typeof setTimeout> | null = null;

function discard(player: VideoPlayer): void {
  void player
    .replaceAsync(null)
    .catch(() => undefined)
    .then(() => player.release());
}

function releaseOne(warm: Warm): void {
  pool = pool.filter((w) => w !== warm);
  if (warm.taken || warm.released) return;
  warm.released = true;
  warm.drop();
  discard(warm.player);
}

function releaseAll(): void {
  generation += 1;
  for (const warm of pool.slice()) releaseOne(warm);
  pool = [];
}

async function onWifi(): Promise<boolean> {
  try {
    const net = await Network.getNetworkStateAsync();
    return net.type === Network.NetworkStateType.WIFI;
  } catch {
    return false;
  }
}

function wanted(): Candidate[] {
  const db = libraryStore.getState().db;
  if (!db) return [];
  const currentId = currentRecordingId();
  return listRecordings(db, { after: prewarmWindowStart() })
    .filter((r) => r.mediaType === "video" && r.id !== currentId && !downloads.localUri(r.id))
    .slice(0, WARM_POOL_SIZE)
    .map((r) => ({
      id: r.id,
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      durationMs: r.durationMs,
    }));
}

async function warm(rec: Candidate, token: string, gen: number): Promise<void> {
  const uri = await mediaUrl(rec.id, token);
  if (gen !== generation || auth.token() !== token) return;
  const player = createVideoPlayer(null);
  player.muted = true;
  player.preservesPitch = true;
  const onStatusChange: VideoPlayerEvents["statusChange"] = ({ status }) => {
    if (status === "error") releaseOne(entry);
  };
  const entry: Warm = {
    id: rec.id,
    player,
    ready: false,
    taken: false,
    released: false,
    drop: () => player.removeListener("statusChange", onStatusChange),
  };
  player.addListener("statusChange", onStatusChange);
  pool.push(entry);
  try {
    await player.replaceAsync({
      uri,
      metadata: { title: rec.title, artist: "Grain", artwork: rec.thumbnailUrl ?? undefined },
    });
  } catch (e) {
    releaseOne(entry);
    throw e;
  }
  if (entry.taken) return;
  if (gen !== generation || !pool.includes(entry)) {
    releaseOne(entry);
    return;
  }
  player.currentTime = playbackPositions.resume(rec.id, rec.durationMs / 1000);
  player.pause();
  entry.ready = true;
}

async function run(): Promise<void> {
  const token = auth.token();
  if (!token || isDemoToken(token)) return releaseAll();
  if (!(await onWifi())) return releaseAll();
  const gen = generation;
  const recs = wanted();
  for (const entry of pool.slice()) if (!recs.some((r) => r.id === entry.id)) releaseOne(entry);
  for (const rec of recs) {
    if (gen !== generation) return;
    if (pool.length >= WARM_POOL_SIZE || pool.some((w) => w.id === rec.id)) continue;
    try {
      await warm(rec, token, gen);
    } catch {
      // a warm player is an optimisation; the next pass tries again
    }
  }
}

function sync(): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = run()
    .catch((e: unknown) => {
      if (__DEV__) console.warn("warm players failed", e);
    })
    .finally(() => {
      running = null;
      if (!rerun) return;
      rerun = false;
      void sync();
    });
  return running;
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void prewarmDone().then(sync);
  }, WARM_DEBOUNCE_MS);
}

function take(id: string): VideoPlayer | null {
  const entry = pool.find((w) => w.id === id && w.ready);
  if (!entry) return null;
  entry.taken = true;
  entry.drop();
  pool = pool.filter((w) => w !== entry);
  entry.player.muted = false;
  return entry.player;
}

export function onWarmAppStateChange(state: AppStateStatus): void {
  if (backgroundTimer) clearTimeout(backgroundTimer);
  backgroundTimer = null;
  if (state === "active") {
    schedule();
    return;
  }
  backgroundTimer = setTimeout(releaseAll, WARM_BACKGROUND_RELEASE_MS);
}

export const warmPlayers = {
  bind: (currentId: () => string | null) => {
    currentRecordingId = currentId;
  },
  sync,
  schedule,
  take,
  discard,
  releaseAll,
  size: () => pool.length,
  has: (id: string) => pool.some((w) => w.id === id),
};

library.onChange(schedule);

AppState.addEventListener("change", onWarmAppStateChange);
AppState.addEventListener("memoryWarning", releaseAll);

authStore.subscribe((s, prev) => {
  if (s.token === prev.token && s.status === prev.status) return;
  releaseAll();
  if (s.status === "signed-in") schedule();
});

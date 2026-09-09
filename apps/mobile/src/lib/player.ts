import { createVideoPlayer, type VideoPlayer, type VideoView } from "expo-video";
import { create, useStore } from "zustand";
import { auth, authStore } from "@/lib/auth";
import { playbackPositions } from "@/lib/data/playback-positions";
import { RESUME_END_MARGIN_SECONDS } from "@/lib/db";
import { downloads, downloadsStore } from "@/lib/downloads";
import { invalidateMediaUrl, mediaUrl } from "@/lib/media-url";
import { perf } from "@/lib/perf";
import {
  isPlaybackRate,
  PLAYBACK_RATES,
  type PlaybackRate,
  settings,
  settingsStore,
  useSetting,
} from "@/lib/settings";

export { isPlaybackRate, PLAYBACK_RATES, type PlaybackRate };

export type NowPlaying = {
  id: string;
  title: string;
  mediaType: string;
  thumbnailUrl: string | null;
  durationMs: number;
};

type PlayerState = {
  current: NowPlaying | null;
  status: "idle" | "loading" | "ready" | "error";
  playing: boolean;
  position: number;
  duration: number;
  until: number | null;
  error: string | null;
};

const initial: PlayerState = {
  current: null,
  status: "idle",
  playing: false,
  position: 0,
  duration: 0,
  until: null,
  error: null,
};

export const playerStore = create<PlayerState>(() => initial);

export const useNowPlaying = () => useStore(playerStore, (s) => s.current);
export const useIsCurrent = (id: string) => useStore(playerStore, (s) => s.current?.id === id);
export const usePlaybackStatus = () => useStore(playerStore, (s) => s.status);
export const usePlaybackError = () => useStore(playerStore, (s) => s.error);
export const useIsPlaying = () => useStore(playerStore, (s) => s.playing);
export const usePlaybackPosition = () => useStore(playerStore, (s) => s.position);
export const usePlaybackDuration = () => useStore(playerStore, (s) => s.duration);
export const usePlaybackUntil = () => useStore(playerStore, (s) => s.until);
export const usePlaybackRate = () => useSetting("playbackRate");

export const player: VideoPlayer = createVideoPlayer(null);
player.staysActiveInBackground = true;
player.showNowPlayingNotification = true;
player.timeUpdateEventInterval = 0.5;

export const POSITION_WRITE_INTERVAL_MS = 5_000;
export const SEEK_END_EPSILON_SECONDS = 0.5;
let positionWrittenAt = 0;
let resumePending = false;
let inClipRange = false;
let sourceDuration = 0;
let pendingRestoreAt: number | null = null;
let restoreSeq = 0;

function atSourceEnd(seconds: number) {
  return sourceDuration > 0 && seconds >= sourceDuration - RESUME_END_MARGIN_SECONDS;
}

function rewindToStart() {
  pendingRestoreAt = null;
  player.currentTime = 0;
  inClipRange = false;
  playerStore.setState({ position: 0, until: null });
}

function savePosition(force = false) {
  const { current, position } = playerStore.getState();
  if (!current || resumePending || inClipRange || position <= 0) return;
  const now = Date.now();
  if (!force && now - positionWrittenAt < POSITION_WRITE_INTERVAL_MS) return;
  positionWrittenAt = now;
  playbackPositions.save(current.id, atSourceEnd(position) ? 0 : position);
}

player.addListener("playingChange", ({ isPlaying }) => {
  playerStore.setState({ playing: isPlaying });
  if (!isPlaying) return savePosition(true);
  if (playerStore.getState().until === null) inClipRange = false;
});
player.addListener("timeUpdate", ({ currentTime }) => {
  const { until } = playerStore.getState();
  if (until !== null && currentTime >= until) {
    player.pause();
    playerStore.setState({ position: currentTime, until: null });
    return;
  }
  playerStore.setState({ position: currentTime });
  perf.measure("fullscreen-exit-playback", "fullscreen unmount → card surface playing");
  perf.measure("surface-attach", "video surface attached (card or fullscreen) → first timeUpdate");
  savePosition();
});
player.addListener("sourceLoad", ({ duration }) => {
  sourceDuration = duration;
  playerStore.setState({ duration });
  const at = pendingRestoreAt;
  if (at === null || restoreSeq !== loadSeq || !atSourceEnd(at)) return;
  rewindToStart();
});
player.addListener("statusChange", ({ status, error }) => {
  if (playerStore.getState().status === "idle") return;
  playerStore.setState({
    status: status === "readyToPlay" ? "ready" : status === "error" ? "error" : "loading",
    error: error?.message ?? null,
  });
  if (status === "error") void reresolveSource();
});

let loadSeq = 0;
const videoViews: VideoView[] = [];

export function attachVideoView(view: VideoView): () => void {
  if (!videoViews.includes(view)) videoViews.push(view);
  perf.measure("fullscreen-enter-attach", "route push → fullscreen surface attached");
  perf.mark("surface-attach");
  return () => {
    const i = videoViews.indexOf(view);
    if (i >= 0) videoViews.splice(i, 1);
  };
}

export type PlayerSurface = "card" | "fullscreen";

export function videoSurfaceRendered(surface: PlayerSurface) {
  if (surface === "fullscreen")
    perf.measure("fullscreen-enter-visible", "fullscreen tap → fullscreen surface rendered");
  else perf.measure("fullscreen-exit-visible", "fullscreen dismiss → card surface rendered");
}

async function startPictureInPicture() {
  const view = videoViews.at(-1);
  if (!view) throw new Error("The video is not on screen.");
  await view.startPictureInPicture();
}

type LoadOptions = { autoplay?: boolean; at?: number; until?: number };

function metadataFor(rec: NowPlaying) {
  return { title: rec.title, artist: "Grain", artwork: rec.thumbnailUrl ?? undefined };
}

function freshUri(id: string, token: string): Promise<string> {
  invalidateMediaUrl(id);
  return mediaUrl(id, token);
}

function restoreAfterReplace(at: number, autoplay: boolean) {
  player.playbackRate = settings.get().playbackRate;
  restoreSeq = loadSeq;
  if (atSourceEnd(at)) {
    rewindToStart();
  } else {
    pendingRestoreAt = at;
    player.currentTime = at;
  }
  if (autoplay) player.play();
  else player.pause();
  resumePending = false;
}

async function swapSource(uri: string, resume?: boolean) {
  const { current, position, playing } = playerStore.getState();
  if (!current) return;
  const seq = loadSeq;
  resumePending = true;
  try {
    await player.replaceAsync({ uri, metadata: metadataFor(current) });
  } catch (e) {
    // A newer sequence owns the flag and clears it itself.
    if (seq === loadSeq) resumePending = false;
    throw e;
  }
  if (seq !== loadSeq) return;
  restoreAfterReplace(position, resume ?? playing);
}

export const RERESOLVE_BACKOFF_MS = 10_000;
export const RERESOLVE_MAX_ATTEMPTS = 2;
let reresolving = false;
let reresolvedAt = 0;
let reresolveAttempts = 0;

async function reresolveSource() {
  const { current, playing } = playerStore.getState();
  const token = auth.token();
  if (!current || !token || reresolving) return;
  if (downloads.localUri(current.id)) return;
  if (reresolveAttempts >= RERESOLVE_MAX_ATTEMPTS) return;
  const now = Date.now();
  if (now - reresolvedAt < RERESOLVE_BACKOFF_MS) return;
  reresolvedAt = now;
  reresolveAttempts++;
  reresolving = true;
  const seq = loadSeq;
  try {
    const uri = await freshUri(current.id, token);
    if (seq !== loadSeq) return;
    playerStore.setState({ status: "loading", error: null });
    await swapSource(uri, playing);
  } catch {
    // the store keeps the original playback error
  } finally {
    reresolving = false;
  }
}

downloadsStore.subscribe((s, prev) => {
  const id = playerStore.getState().current?.id;
  if (!id) return;
  const next = s.byId[id];
  if (next?.status === "done" && next.uri && prev.byId[id]?.status !== "done") {
    void swapSource(next.uri).catch(() => undefined);
  }
});

async function load(rec: NowPlaying, opts: LoadOptions = {}) {
  const { current } = playerStore.getState();
  const until = opts.until ?? null;
  if (current?.id === rec.id) {
    const at = opts.at === undefined ? undefined : seekTo(opts.at);
    const range = at !== undefined && at !== opts.at ? null : until;
    inClipRange = range !== null;
    playerStore.setState({ until: range });
    if (opts.autoplay ?? true) player.play();
    return;
  }
  savePosition(true);
  inClipRange = until !== null;
  const seq = ++loadSeq;
  const token = auth.token();
  if (!token) throw new Error("Not signed in");
  reresolvedAt = 0;
  reresolveAttempts = 0;
  positionWrittenAt = 0;
  resumePending = true;
  sourceDuration = 0;
  pendingRestoreAt = null;
  const at = opts.at ?? playbackPositions.resume(rec.id, rec.durationMs / 1000);
  playerStore.setState({
    current: rec,
    status: "loading",
    playing: false,
    position: at,
    duration: rec.durationMs / 1000,
    until,
    error: null,
  });
  try {
    const uri = downloads.localUri(rec.id) ?? (await mediaUrl(rec.id, token));
    if (seq !== loadSeq) return;
    await player.replaceAsync({ uri, metadata: metadataFor(rec) });
    if (seq !== loadSeq) return;
    restoreAfterReplace(at, opts.autoplay ?? true);
  } catch (e) {
    if (seq !== loadSeq) return;
    resumePending = false;
    playerStore.setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

async function preload(rec: NowPlaying, at: number) {
  if (playerStore.getState().current || at <= 0) return;
  const seq = loadSeq + 1;
  try {
    await load(rec, { at, autoplay: false });
  } catch {
    // opening a meeting is not a playback request, so a failure is silent
  }
  const { current, status } = playerStore.getState();
  if (seq === loadSeq && status === "error" && current?.id === rec.id) reset(false);
}

function seekTo(seconds: number) {
  const duration = sourceDuration || playerStore.getState().duration;
  const last = duration ? duration - SEEK_END_EPSILON_SECONDS : 0;
  const clamped = Math.max(0, duration ? Math.min(seconds, last) : seconds);
  player.currentTime = clamped;
  pendingRestoreAt = null;
  inClipRange = false;
  playerStore.setState({ position: clamped, until: null });
  return clamped;
}

function seekBy(seconds: number) {
  seekTo(playerStore.getState().position + seconds);
}

settingsStore.subscribe((s, prev) => {
  if (s.playbackRate !== prev.playbackRate) player.playbackRate = s.playbackRate;
});

function setRate(rate: PlaybackRate) {
  settings.set("playbackRate", rate);
}

function retry() {
  reresolvedAt = 0;
  reresolveAttempts = 0;
  return reresolveSource();
}

function toggle() {
  if (playerStore.getState().playing) player.pause();
  else player.play();
}

function reset(persist: boolean) {
  if (persist) savePosition(true);
  perf.clearMarks();
  loadSeq++;
  reresolvedAt = 0;
  reresolveAttempts = 0;
  positionWrittenAt = 0;
  resumePending = false;
  inClipRange = false;
  sourceDuration = 0;
  pendingRestoreAt = null;
  void player.replaceAsync(null);
  playerStore.setState(initial);
}

function stop() {
  reset(true);
}

authStore.subscribe((s, prev) => {
  if (prev.status !== "signed-in" || s.token === prev.token) return;
  reset(false);
});

export const playback = {
  load,
  preload,
  play: () => player.play(),
  pause: () => player.pause(),
  toggle,
  seekTo,
  seekBy,
  setRate,
  stop,
  retry,
  startPictureInPicture,
};

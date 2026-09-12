import {
  createVideoPlayer,
  type VideoPlayer,
  type VideoPlayerEvents,
  type VideoView,
} from "expo-video";
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
import { warmPlayers } from "@/lib/warm-players";

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
  generation: number;
};

const initial: PlayerState = {
  current: null,
  status: "idle",
  playing: false,
  position: 0,
  duration: 0,
  until: null,
  error: null,
  generation: 0,
};

export const playerStore = create<PlayerState>(() => initial);

export const useNowPlaying = () => useStore(playerStore, (s) => s.current);
export const useIsCurrent = (id: string) => useStore(playerStore, (s) => s.current?.id === id);
export const usePlaybackStatus = () => useStore(playerStore, (s) => s.status);
export const usePlaybackError = () => useStore(playerStore, (s) => s.error);
export const useIsPlaying = () => useStore(playerStore, (s) => s.playing);
export const usePlaybackPosition = () => useStore(playerStore, (s) => s.position);
export const usePlaybackDuration = () => useStore(playerStore, (s) => s.duration);
export const usePlayerGeneration = () => useStore(playerStore, (s) => s.generation);
export const usePlaybackUntil = () => useStore(playerStore, (s) => s.until);
export const usePlaybackRate = () => useSetting("playbackRate");

function configure(p: VideoPlayer): VideoPlayer {
  p.muted = false;
  p.staysActiveInBackground = true;
  p.showNowPlayingNotification = true;
  p.timeUpdateEventInterval = 0.5;
  p.preservesPitch = true;
  p.playbackRate = settings.get().playbackRate;
  p.addListener("playingChange", onPlayingChange);
  p.addListener("timeUpdate", onTimeUpdate);
  p.addListener("sourceLoad", onSourceLoad);
  p.addListener("statusChange", onStatusChange);
  return p;
}

function build(): VideoPlayer {
  return configure(createVideoPlayer(null));
}

function detachListeners(p: VideoPlayer): void {
  p.removeListener("playingChange", onPlayingChange);
  p.removeListener("timeUpdate", onTimeUpdate);
  p.removeListener("sourceLoad", onSourceLoad);
  p.removeListener("statusChange", onStatusChange);
}

export function videoPlayer(): VideoPlayer {
  return instance;
}

// Instant start will adopt a pre-warmed player as the shared one, so building and releasing
// stay in one place instead of spread over module initialisation. Dropping `current` is what
// unmounts the `VideoView`s, and that is a React render, so the release waits for their detach
// callbacks rather than pulling the player out from under a live native view.
async function rebuildPlayer(): Promise<void> {
  const old = instance;
  detachListeners(old);
  instance = build();
  old.pause();
  const deadline = Date.now() + VIEW_DETACH_TIMEOUT_MS;
  while (videoViews.length > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, VIEW_DETACH_POLL_MS));
  }
  videoViews.length = 0;
  await old.replaceAsync(null).catch(() => undefined);
  old.release();
}

async function releaseHandedOver(old: VideoPlayer): Promise<void> {
  const handedOver = videoViews.slice();
  detachListeners(old);
  old.pause();
  const deadline = Date.now() + VIEW_DETACH_TIMEOUT_MS;
  while (videoViews.some((v) => handedOver.includes(v)) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, VIEW_DETACH_POLL_MS));
  }
  await old.replaceAsync(null).catch(() => undefined);
  old.release();
}

function adopt(warm: VideoPlayer, at: number, autoplay: boolean): void {
  const old = instance;
  instance = configure(warm);
  sourceDuration = warm.duration || 0;
  playerStore.setState((s) => ({
    status: warm.status === "readyToPlay" ? "ready" : "loading",
    duration: sourceDuration || s.duration,
    generation: s.generation + 1,
  }));
  restoreAfterReplace(at, autoplay);
  void releaseHandedOver(old).catch(() => undefined);
}

export const VIEW_DETACH_TIMEOUT_MS = 500;
export const VIEW_DETACH_POLL_MS = 16;
export const POSITION_WRITE_INTERVAL_MS = 5_000;
export const SEEK_END_EPSILON_SECONDS = 0.5;
let positionWrittenAt = 0;
let resumePending = false;
let inClipRange = false;
let sourceDuration = 0;
let pendingRestoreAt: number | null = null;
let restoreSeq = 0;
let playIntent = false;

function atSourceEnd(seconds: number) {
  return sourceDuration > 0 && seconds >= sourceDuration - RESUME_END_MARGIN_SECONDS;
}

function rewindToStart() {
  pendingRestoreAt = null;
  instance.currentTime = 0;
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

const onPlayingChange: VideoPlayerEvents["playingChange"] = ({ isPlaying }) => {
  // A replace in flight owns the intent; the flag only tracks it once the transition is over,
  // so a lock-screen or notification play is picked up without a mid-transition read winning.
  if (!resumePending) playIntent = isPlaying;
  playerStore.setState({ playing: isPlaying });
  if (!isPlaying) return savePosition(true);
  if (playerStore.getState().until === null) inClipRange = false;
};
const onTimeUpdate: VideoPlayerEvents["timeUpdate"] = ({ currentTime }) => {
  const { until } = playerStore.getState();
  if (until !== null && currentTime >= until) {
    instance.pause();
    playerStore.setState({ position: currentTime, until: null });
    return;
  }
  playerStore.setState({ position: currentTime });
  perf.measure(TTFF_MARK, ttffLabel);
  perf.measure("fullscreen-exit-playback", "fullscreen unmount → card surface playing");
  perf.measure("surface-attach", "video surface attached (card or fullscreen) → first timeUpdate");
  savePosition();
};
const onSourceLoad: VideoPlayerEvents["sourceLoad"] = ({ duration }) => {
  sourceDuration = duration;
  playerStore.setState({ duration });
  const at = pendingRestoreAt;
  if (at === null || restoreSeq !== loadSeq || !atSourceEnd(at)) return;
  rewindToStart();
};
const onStatusChange: VideoPlayerEvents["statusChange"] = ({ status, error }) => {
  if (playerStore.getState().status === "idle") return;
  playerStore.setState({
    status: status === "readyToPlay" ? "ready" : status === "error" ? "error" : "loading",
    error: error?.message ?? null,
  });
  if (status === "error") void reresolveSource();
};

let instance: VideoPlayer = build();

warmPlayers.bind(() => playerStore.getState().current?.id ?? null);

export const TTFF_MARK = "media-load";
let ttffLabel = "";

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
  instance.preservesPitch = true;
  instance.playbackRate = settings.get().playbackRate;
  restoreSeq = loadSeq;
  if (atSourceEnd(at)) {
    rewindToStart();
  } else {
    pendingRestoreAt = at;
    instance.currentTime = at;
  }
  if (autoplay) instance.play();
  else instance.pause();
  resumePending = false;
}

async function swapSource(uri: string) {
  const { current, position } = playerStore.getState();
  if (!current) return;
  const seq = loadSeq;
  resumePending = true;
  try {
    await instance.replaceAsync({ uri, metadata: metadataFor(current) });
  } catch (e) {
    // A newer sequence owns the flag and clears it itself.
    if (seq === loadSeq) resumePending = false;
    throw e;
  }
  if (seq !== loadSeq) return;
  restoreAfterReplace(position, playIntent);
}

export const RERESOLVE_BACKOFF_MS = 10_000;
export const RERESOLVE_MAX_ATTEMPTS = 2;
let reresolving = false;
let reresolvedAt = 0;
let reresolveAttempts = 0;

async function reresolveSource() {
  const { current } = playerStore.getState();
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
    await swapSource(uri);
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
    playIntent = opts.autoplay ?? true;
    if (playIntent) instance.play();
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
  playIntent = opts.autoplay ?? true;
  sourceDuration = 0;
  pendingRestoreAt = null;
  const local = downloads.localUri(rec.id);
  perf.mark(TTFF_MARK);
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
  const warm = local ? null : warmPlayers.take(rec.id);
  if (warm && warm.status !== "error") {
    ttffLabel = "time to first frame (warm)";
    adopt(warm, at, playIntent);
    return;
  }
  if (warm) warmPlayers.discard(warm);
  try {
    const uri = local ?? (await mediaUrl(rec.id, token));
    if (seq !== loadSeq) return;
    ttffLabel = `time to first frame (${local ? "downloaded" : "cold"})`;
    await instance.replaceAsync({ uri, metadata: metadataFor(rec) });
    if (seq !== loadSeq) return;
    restoreAfterReplace(at, playIntent);
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
  instance.currentTime = clamped;
  pendingRestoreAt = null;
  inClipRange = false;
  playerStore.setState({ position: clamped, until: null });
  return clamped;
}

function seekBy(seconds: number) {
  seekTo(playerStore.getState().position + seconds);
}

settingsStore.subscribe((s, prev) => {
  if (s.playbackRate === prev.playbackRate) return;
  instance.preservesPitch = true;
  instance.playbackRate = s.playbackRate;
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
  if (playerStore.getState().playing) instance.pause();
  else instance.play();
}

function reset(persist: boolean) {
  if (persist) savePosition(true);
  perf.clearMarks();
  loadSeq++;
  reresolvedAt = 0;
  reresolveAttempts = 0;
  positionWrittenAt = 0;
  resumePending = false;
  playIntent = false;
  inClipRange = false;
  sourceDuration = 0;
  pendingRestoreAt = null;
  void instance.replaceAsync(null).catch(() => undefined);
  playerStore.setState({ ...initial, generation: playerStore.getState().generation });
}

function stop() {
  reset(true);
}

authStore.subscribe((s, prev) => {
  if (prev.status !== "signed-in" || s.token === prev.token) return;
  reset(false);
  void rebuildPlayer().catch(() => undefined);
});

export const playback = {
  load,
  preload,
  play: () => instance.play(),
  pause: () => instance.pause(),
  toggle,
  seekTo,
  seekBy,
  setRate,
  stop,
  retry,
  startPictureInPicture,
};

import { createVideoPlayer, type VideoPlayer, type VideoView } from "expo-video";
import { create, useStore } from "zustand";
import { auth } from "@/lib/auth";
import { DEMO_MEDIA_URL, isDemoToken } from "@/lib/demo";
import { makeClient } from "@/lib/grain";
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

player.addListener("playingChange", ({ isPlaying }) =>
  playerStore.setState({ playing: isPlaying }),
);
player.addListener("timeUpdate", ({ currentTime }) => {
  const { until } = playerStore.getState();
  if (until !== null && currentTime >= until) {
    player.pause();
    playerStore.setState({ position: currentTime, until: null });
    return;
  }
  playerStore.setState({ position: currentTime });
});
player.addListener("sourceLoad", ({ duration }) => playerStore.setState({ duration }));
player.addListener("statusChange", ({ status, error }) => {
  if (playerStore.getState().status === "idle") return;
  playerStore.setState({
    status: status === "readyToPlay" ? "ready" : status === "error" ? "error" : "loading",
    error: error?.message ?? null,
  });
});

let loadSeq = 0;
const videoViews: VideoView[] = [];

export function attachVideoView(view: VideoView): () => void {
  videoViews.push(view);
  return () => {
    const i = videoViews.indexOf(view);
    if (i >= 0) videoViews.splice(i, 1);
  };
}

function startPictureInPicture() {
  return videoViews.at(-1)?.startPictureInPicture() ?? Promise.resolve();
}

type LoadOptions = { autoplay?: boolean; at?: number; until?: number };

async function load(rec: NowPlaying, opts: LoadOptions = {}) {
  const { current } = playerStore.getState();
  const until = opts.until ?? null;
  if (current?.id === rec.id) {
    if (opts.at !== undefined) seekTo(opts.at);
    playerStore.setState({ until });
    if (opts.autoplay ?? true) player.play();
    return;
  }
  const seq = ++loadSeq;
  const token = auth.token();
  if (!token) throw new Error("Not signed in");
  playerStore.setState({
    current: rec,
    status: "loading",
    playing: false,
    position: opts.at ?? 0,
    duration: rec.durationMs / 1000,
    until,
    error: null,
  });
  try {
    const uri = isDemoToken(token)
      ? DEMO_MEDIA_URL
      : await makeClient(token).recordings.resolveMediaUrl(rec.id);
    if (seq !== loadSeq) return;
    await player.replaceAsync({
      uri,
      metadata: { title: rec.title, artist: "Grain", artwork: rec.thumbnailUrl ?? undefined },
    });
    if (seq !== loadSeq) return;
    player.playbackRate = settings.get().playbackRate;
    if (opts.at) player.currentTime = opts.at;
    if (opts.autoplay ?? true) player.play();
  } catch (e) {
    if (seq !== loadSeq) return;
    playerStore.setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

function seekTo(seconds: number) {
  const { duration } = playerStore.getState();
  const clamped = Math.max(0, duration ? Math.min(seconds, duration) : seconds);
  player.currentTime = clamped;
  playerStore.setState({ position: clamped, until: null });
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

function toggle() {
  if (playerStore.getState().playing) player.pause();
  else player.play();
}

function stop() {
  loadSeq++;
  void player.replaceAsync(null);
  playerStore.setState(initial);
}

export const playback = {
  load,
  play: () => player.play(),
  pause: () => player.pause(),
  toggle,
  seekTo,
  seekBy,
  setRate,
  stop,
  startPictureInPicture,
};

import { createVideoPlayer, type VideoPlayer, type VideoView } from "expo-video";
import { create } from "zustand";
import { auth } from "@/lib/auth";
import { makeClient } from "@/lib/grain";

export type NowPlaying = {
  id: string;
  title: string;
  mediaType: string;
  thumbnailUrl: string | null;
  durationMs: number;
};

export const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

type PlayerState = {
  current: NowPlaying | null;
  status: "idle" | "loading" | "ready" | "error";
  playing: boolean;
  position: number;
  duration: number;
  rate: PlaybackRate;
  error: string | null;
};

const initial: PlayerState = {
  current: null,
  status: "idle",
  playing: false,
  position: 0,
  duration: 0,
  rate: 1,
  error: null,
};

export const usePlayer = create<PlayerState>(() => initial);

export const player: VideoPlayer = createVideoPlayer(null);
player.staysActiveInBackground = true;
player.showNowPlayingNotification = true;
player.timeUpdateEventInterval = 0.5;

player.addListener("playingChange", ({ isPlaying }) => usePlayer.setState({ playing: isPlaying }));
player.addListener("timeUpdate", ({ currentTime }) =>
  usePlayer.setState({ position: currentTime }),
);
player.addListener("sourceLoad", ({ duration }) => usePlayer.setState({ duration }));
player.addListener("statusChange", ({ status, error }) => {
  if (usePlayer.getState().status === "idle") return;
  usePlayer.setState({
    status: status === "readyToPlay" ? "ready" : status === "error" ? "error" : "loading",
    error: error?.message ?? null,
  });
});

let loadSeq = 0;
let videoView: VideoView | null = null;

export function setVideoView(view: VideoView | null) {
  videoView = view;
}

function startPictureInPicture() {
  return videoView?.startPictureInPicture() ?? Promise.resolve();
}

async function load(rec: NowPlaying, opts: { autoplay?: boolean; at?: number } = {}) {
  const { current } = usePlayer.getState();
  if (current?.id === rec.id) {
    if (opts.at !== undefined) seekTo(opts.at);
    if (opts.autoplay ?? true) player.play();
    return;
  }
  const seq = ++loadSeq;
  const token = auth.token();
  if (!token) throw new Error("Not signed in");
  usePlayer.setState({
    current: rec,
    status: "loading",
    playing: false,
    position: opts.at ?? 0,
    duration: rec.durationMs / 1000,
    error: null,
  });
  try {
    const uri = await makeClient(token).recordings.resolveMediaUrl(rec.id);
    if (seq !== loadSeq) return;
    await player.replaceAsync({
      uri,
      metadata: { title: rec.title, artist: "Grain", artwork: rec.thumbnailUrl ?? undefined },
    });
    if (seq !== loadSeq) return;
    player.playbackRate = usePlayer.getState().rate;
    if (opts.at) player.currentTime = opts.at;
    if (opts.autoplay ?? true) player.play();
  } catch (e) {
    if (seq !== loadSeq) return;
    usePlayer.setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

function seekTo(seconds: number) {
  const { duration } = usePlayer.getState();
  const clamped = Math.max(0, duration ? Math.min(seconds, duration) : seconds);
  player.currentTime = clamped;
  usePlayer.setState({ position: clamped });
}

function seekBy(seconds: number) {
  seekTo(usePlayer.getState().position + seconds);
}

function setRate(rate: PlaybackRate) {
  player.playbackRate = rate;
  usePlayer.setState({ rate });
}

function toggle() {
  if (usePlayer.getState().playing) player.pause();
  else player.play();
}

function stop() {
  loadSeq++;
  player.replace(null);
  usePlayer.setState({ ...initial, rate: usePlayer.getState().rate });
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

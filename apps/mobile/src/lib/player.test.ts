import { act, renderHook } from "@testing-library/react-native";
import { createVideoPlayer, type VideoPlayer, type VideoView } from "expo-video";
import { authStore } from "@/lib/auth";
import { playbackPositions } from "@/lib/data/playback-positions";
import { downloadsStore } from "@/lib/downloads";
import { makeClient } from "@/lib/grain";
import { queryClient } from "@/lib/query";
import {
  attachVideoView,
  isPlaybackRate,
  type NowPlaying,
  PLAYBACK_RATES,
  playback,
  POSITION_WRITE_INTERVAL_MS,
  RERESOLVE_BACKOFF_MS,
  SEEK_END_EPSILON_SECONDS,
  playerStore,
  useIsPlaying,
  VIEW_DETACH_POLL_MS,
  videoPlayer,
} from "@/lib/player";
import { perf } from "@/lib/perf";
import { settings, settingsStore } from "@/lib/settings";
import { warmPlayers } from "@/lib/warm-players";

jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("@/lib/warm-players", () => ({
  warmPlayers: { bind: jest.fn(), take: jest.fn(() => null), discard: jest.fn() },
}));
jest.mock("@/lib/data/playback-positions", () => {
  const db = jest.requireActual("@/test/db").testDb();
  const q = jest.requireActual("@/lib/db/playback-positions");
  return {
    playbackPositions: {
      get: (id: string) => q.getPlaybackPosition(db, id),
      resume: (id: string, duration: number) => q.resumePosition(db, id, duration),
      save: jest.fn((id: string, position: number) => q.setPlaybackPosition(db, id, position)),
      clear: (id: string) => q.clearPlaybackPosition(db, id),
    },
  };
});
jest.mock("expo-video", () => {
  const listeners = new Map<string, Function>();
  const emit = (name: string, payload: unknown) => listeners.get(name)?.(payload);
  const fake = {
    listeners,
    emit,
    playing: false,
    currentTime: 0,
    playbackRate: 1,
    preservesPitch: false,
    staysActiveInBackground: false,
    showNowPlayingNotification: false,
    timeUpdateEventInterval: 0,
    addListener: jest.fn((name: string, fn: Function) => listeners.set(name, fn)),
    removeListener: jest.fn((name: string) => listeners.delete(name)),
    replaceAsync: jest.fn(async () => {}),
    replace: jest.fn(),
    play: jest.fn(() => emit("playingChange", { isPlaying: true })),
    pause: jest.fn(() => emit("playingChange", { isPlaying: false })),
    release: jest.fn(),
  };
  return { createVideoPlayer: jest.fn(() => fake) };
});

type Fake = VideoPlayer & {
  emit: (name: string, payload: unknown) => void;
  listeners: Map<string, unknown>;
  addListener: jest.Mock;
  replaceAsync: jest.Mock;
  play: jest.Mock;
  pause: jest.Mock;
  release: jest.Mock;
};
const fake = videoPlayer() as Fake;
const resolveMediaUrl = jest.fn();
(makeClient as jest.Mock).mockImplementation(() => ({ recordings: { resolveMediaUrl } }));

const until = async (done: () => boolean) => {
  for (let i = 0; i < 100 && !done(); i++) await new Promise((r) => setTimeout(r, 0));
  if (!done()) throw new Error("condition never held");
};

const localFile = {
  status: "done" as const,
  progress: 1,
  uri: "file:///docs/downloads/r1.mp4",
  bytes: 1,
  error: null,
};

// Leaves the player paused on its resume frame with the store's `playing` flag stuck true: the
// native side reported a transient play while the replace was in flight and has not reported the
// pause that followed. Autoplay decisions taken after this must come from the load's intent.
const preloadWithStalePlayingFlag = async () => {
  let finish!: () => void;
  fake.replaceAsync.mockImplementationOnce(() => new Promise<void>((r) => (finish = () => r())));
  const preloading = playback.preload(rec, 45);
  await until(() => fake.replaceAsync.mock.calls.length > 0);
  fake.emit("playingChange", { isPlaying: true });
  fake.pause.mockImplementationOnce(() => {});
  finish();
  await preloading;
  expect(playerStore.getState().playing).toBe(true);
  fake.play.mockClear();
  fake.replaceAsync.mockClear();
};

const rec: NowPlaying = {
  id: "r1",
  title: "Pricing review",
  mediaType: "video",
  thumbnailUrl: "https://thumb/1",
  durationMs: 90_000,
};

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  queryClient.clear();
  (makeClient as jest.Mock).mockImplementation(() => ({ recordings: { resolveMediaUrl } }));
  authStore.setState({ status: "signed-in", token: "pat" });
  downloadsStore.setState({ byId: {} });
  playback.stop();
  playback.setRate(1);
  playbackPositions.clear("r1");
  playbackPositions.clear("r2");
  fake.replaceAsync.mockClear();
  (playbackPositions.save as jest.Mock).mockClear();
});

describe("player store", () => {
  it("configures the shared player for background audio and lock-screen controls", () => {
    expect(fake.staysActiveInBackground).toBe(true);
    expect(fake.showNowPlayingNotification).toBe(true);
  });

  it("resolves the media url, sets lock-screen metadata and autoplays", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    expect(makeClient).toHaveBeenCalledWith("pat");
    expect(fake.replaceAsync).toHaveBeenCalledWith({
      uri: "https://cdn/media.mp4",
      metadata: { title: "Pricing review", artist: "Grain", artwork: "https://thumb/1" },
    });
    expect(fake.play).toHaveBeenCalled();
    expect(playerStore.getState()).toMatchObject({ current: rec, playing: true, duration: 90 });
  });

  it("reuses the loaded source when the same recording is requested again", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    playback.pause();
    await playback.load(rec, { at: 30 });
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
    expect(playerStore.getState()).toMatchObject({ position: 30, playing: true });
  });

  it("ignores a stale load when a newer one starts", async () => {
    let release!: (url: string) => void;
    resolveMediaUrl.mockImplementationOnce(() => new Promise<string>((r) => (release = r)));
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/second.mp4");
    const first = playback.load(rec);
    await playback.load({ ...rec, id: "r2", title: "Second" });
    release("https://cdn/first.mp4");
    await first;
    expect(fake.replaceAsync).toHaveBeenCalledTimes(1);
    expect(playerStore.getState().current?.id).toBe("r2");
  });

  it("plays the public sample stream in demo mode without resolving a media url", async () => {
    authStore.setState({ status: "signed-in", token: "demo" });
    await playback.load(rec);
    expect(resolveMediaUrl).not.toHaveBeenCalled();
    expect(fake.replaceAsync).toHaveBeenCalledWith(
      expect.objectContaining({ uri: expect.stringContaining("devstreaming-cdn.apple.com") }),
    );
  });

  it("surfaces load failures without touching the player", async () => {
    resolveMediaUrl.mockRejectedValueOnce(new Error("offline"));
    await playback.load(rec);
    expect(fake.replaceAsync).not.toHaveBeenCalled();
    expect(playerStore.getState()).toMatchObject({ status: "error", error: "offline" });
  });

  it("mirrors player events and clamps seeks to the duration", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec, { autoplay: false });
    fake.emit("sourceLoad", { duration: 120 });
    fake.emit("statusChange", { status: "readyToPlay" });
    fake.emit("timeUpdate", { currentTime: 100 });
    expect(playerStore.getState()).toMatchObject({ status: "ready", duration: 120, position: 100 });
    playback.seekBy(30);
    expect(playerStore.getState().position).toBe(120 - SEEK_END_EPSILON_SECONDS);
    playback.seekBy(-200);
    expect(playerStore.getState().position).toBe(0);
    playback.setRate(1.5);
    expect(fake.playbackRate).toBe(1.5);
    playback.toggle();
    expect(playerStore.getState().playing).toBe(true);
    playback.toggle();
    expect(playerStore.getState().playing).toBe(false);
  });

  it("stop clears the source and state but keeps the chosen rate", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    playback.setRate(2);
    playback.stop();
    expect(fake.replaceAsync).toHaveBeenCalledWith(null);
    expect(playerStore.getState()).toMatchObject({ current: null, status: "idle" });
    expect(settingsStore.getState().playbackRate).toBe(2);
  });

  it("offers Grain's speed steps and validates them", () => {
    expect(PLAYBACK_RATES).toEqual([1, 1.2, 1.5, 1.7, 2, 2.2, 2.5]);
    expect(isPlaybackRate(1.7)).toBe(true);
    expect(isPlaybackRate(1.25)).toBe(false);
    expect(isPlaybackRate("2")).toBe(false);
  });

  it("reflects play/pause driven from the native side, such as the PiP window", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec, { autoplay: false });
    const { result } = await renderHook(() => useIsPlaying());
    expect(result.current).toBe(false);
    await act(async () => fake.emit("playingChange", { isPlaying: true }));
    expect(result.current).toBe(true);
    await act(async () => fake.emit("playingChange", { isPlaying: false }));
    expect(result.current).toBe(false);
  });

  it("starts picture in picture on the most recently attached view", async () => {
    const first = { startPictureInPicture: jest.fn(async () => {}) } as unknown as VideoView;
    const second = { startPictureInPicture: jest.fn(async () => {}) } as unknown as VideoView;
    const detachFirst = attachVideoView(first);
    const detachSecond = attachVideoView(second);
    await playback.startPictureInPicture();
    expect(second.startPictureInPicture).toHaveBeenCalledTimes(1);
    detachSecond();
    await playback.startPictureInPicture();
    expect(first.startPictureInPicture).toHaveBeenCalledTimes(1);
    detachFirst();
  });

  it("registers a view once however many times it attaches", async () => {
    const view = { startPictureInPicture: jest.fn(async () => {}) } as unknown as VideoView;
    attachVideoView(view);
    const detach = attachVideoView(view);
    detach();
    await expect(playback.startPictureInPicture()).rejects.toThrow("not on screen");
    expect(view.startPictureInPicture).not.toHaveBeenCalled();
  });

  it("rejects when no video view is on screen", async () => {
    await expect(playback.startPictureInPicture()).rejects.toThrow("not on screen");
  });
});

describe("clip ranges", () => {
  it("pauses at the end of the range and clears it", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec, { at: 10, until: 20 });
    expect(playerStore.getState()).toMatchObject({ position: 10, until: 20, playing: true });
    fake.emit("timeUpdate", { currentTime: 15 });
    expect(playerStore.getState()).toMatchObject({ position: 15, until: 20, playing: true });
    fake.emit("timeUpdate", { currentTime: 20.3 });
    expect(fake.pause).toHaveBeenCalledTimes(1);
    expect(playerStore.getState()).toMatchObject({ position: 20.3, until: null, playing: false });
    fake.emit("timeUpdate", { currentTime: 21 });
    expect(fake.pause).toHaveBeenCalledTimes(1);
  });

  it("clamps a clip start past the end of the source and drops the range", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.preload(rec, 30);
    fake.emit("sourceLoad", { duration: 600 });
    fake.emit("statusChange", { status: "readyToPlay" });

    await playback.load(rec, { at: 1800, until: 1830 });
    expect(fake.currentTime).toBe(600 - SEEK_END_EPSILON_SECONDS);
    expect(playerStore.getState()).toMatchObject({
      status: "ready",
      position: 600 - SEEK_END_EPSILON_SECONDS,
      playing: true,
      until: null,
    });
  });

  it("replaces the range on the loaded recording and clears it on seek or plain load", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec, { at: 10, until: 20 });
    await playback.load(rec, { at: 40, until: 50 });
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
    expect(playerStore.getState()).toMatchObject({ position: 40, until: 50 });
    playback.seekBy(-5);
    expect(playerStore.getState()).toMatchObject({ position: 35, until: null });
    await playback.load(rec, { at: 60, until: 70 });
    await playback.load(rec);
    expect(playerStore.getState().until).toBeNull();
    fake.emit("timeUpdate", { currentTime: 80 });
    expect(fake.pause).not.toHaveBeenCalled();
  });
});

describe("offline downloads", () => {
  const done = (uri: string) => ({
    status: "done" as const,
    progress: 1,
    uri,
    bytes: 1,
    error: null,
  });

  it("prefers a downloaded file over the network url", async () => {
    downloadsStore.setState({ byId: { r1: done("file:///docs/downloads/r1.mp4") } });
    await playback.load(rec);
    expect(resolveMediaUrl).not.toHaveBeenCalled();
    expect(fake.replaceAsync).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "file:///docs/downloads/r1.mp4" }),
    );
  });

  it("swaps to the local file when the current recording finishes downloading, keeping position", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    fake.emit("timeUpdate", { currentTime: 42 });
    fake.replaceAsync.mockClear();
    downloadsStore.setState({ byId: { r1: done("file:///docs/downloads/r1.mp4") } });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.replaceAsync).toHaveBeenCalledWith({
      uri: "file:///docs/downloads/r1.mp4",
      metadata: { title: "Pricing review", artist: "Grain", artwork: "https://thumb/1" },
    });
    expect(fake.currentTime).toBe(42);
    expect(playerStore.getState().playing).toBe(true);
  });

  it("keeps recording positions after a failed swap to a local file", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    fake.emit("timeUpdate", { currentTime: 42 });
    fake.replaceAsync.mockRejectedValueOnce(new Error("corrupt file"));
    downloadsStore.setState({ byId: { r1: done("file:///docs/downloads/r1.mp4") } });
    await new Promise((r) => setTimeout(r, 0));

    fake.emit("timeUpdate", { currentTime: 60 });
    playback.pause();
    expect(playbackPositions.get("r1")).toBe(60);
  });
  it("ignores downloads for other recordings", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    fake.replaceAsync.mockClear();
    downloadsStore.setState({ byId: { r2: done("file:///docs/downloads/r2.mp4") } });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.replaceAsync).not.toHaveBeenCalled();
  });
});

describe("expired media urls", () => {
  const fail = () =>
    fake.emit("statusChange", { status: "error", error: { message: "403 Forbidden" } });

  it("re-resolves a fresh url, restores the position and resumes", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/expired.mp4");
    await playback.load(rec);
    fake.emit("timeUpdate", { currentTime: 55 });
    fake.replaceAsync.mockClear();

    resolveMediaUrl.mockResolvedValueOnce("https://cdn/fresh.mp4");
    fail();
    expect(playerStore.getState()).toMatchObject({ status: "error", error: "403 Forbidden" });
    await new Promise((r) => setTimeout(r, 0));

    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
    expect(fake.replaceAsync).toHaveBeenCalledWith({
      uri: "https://cdn/fresh.mp4",
      metadata: { title: "Pricing review", artist: "Grain", artwork: "https://thumb/1" },
    });
    expect(fake.currentTime).toBe(55);
    expect(playerStore.getState()).toMatchObject({ playing: true, error: null });
  });

  it("re-resolves at most once per backoff window", async () => {
    resolveMediaUrl.mockResolvedValue("https://cdn/media.mp4");
    await playback.load(rec);
    fail();
    await new Promise((r) => setTimeout(r, 0));
    fail();
    fail();
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
  });

  it("keeps the error when the re-resolve fails, and leaves local files alone", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/expired.mp4");
    await playback.load(rec);
    fake.replaceAsync.mockClear();
    resolveMediaUrl.mockRejectedValueOnce(new Error("offline"));
    fail();
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.replaceAsync).not.toHaveBeenCalled();
    expect(playerStore.getState()).toMatchObject({ status: "error", error: "403 Forbidden" });

    downloadsStore.setState({
      byId: { r1: { status: "done", progress: 1, uri: "file:///r1.mp4", bytes: 1, error: null } },
    });
    await new Promise((r) => setTimeout(r, 0));
    resolveMediaUrl.mockClear();
    fake.emit("statusChange", { status: "error", error: { message: "corrupt" } });
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveMediaUrl).not.toHaveBeenCalled();
  });

  it("stops re-resolving after two attempts and lets a retry try once more", async () => {
    resolveMediaUrl.mockResolvedValue("https://cdn/media.mp4");
    await playback.load(rec);
    resolveMediaUrl.mockClear();

    const base = Date.now();
    const now = jest.spyOn(Date, "now");
    for (let i = 1; i <= 6; i++) {
      now.mockReturnValue(base + i * (RERESOLVE_BACKOFF_MS + 1));
      fail();
      await new Promise((r) => setTimeout(r, 0));
    }
    now.mockRestore();
    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
    expect(playerStore.getState()).toMatchObject({ status: "error", error: "403 Forbidden" });

    await playback.retry();
    expect(resolveMediaUrl).toHaveBeenCalledTimes(3);
  });

  it("does nothing when playback is idle", async () => {
    playback.stop();
    fail();
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveMediaUrl).not.toHaveBeenCalled();
    expect(playerStore.getState().status).toBe("idle");
  });
});

describe("playback rate persistence", () => {
  it("reapplies the chosen rate after a download swap replaces the source", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    playback.setRate(2);
    fake.playbackRate = 1;

    downloadsStore.setState({
      byId: { r1: { status: "done", progress: 1, uri: "file:///r1.mp4", bytes: 1, error: null } },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.playbackRate).toBe(2);
  });

  it("reapplies the chosen rate after an expired url is re-resolved", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/expired.mp4");
    await playback.load(rec);
    playback.setRate(1.5);
    fake.playbackRate = 1;

    resolveMediaUrl.mockResolvedValueOnce("https://cdn/fresh.mp4");
    fake.emit("statusChange", { status: "error", error: { message: "403 Forbidden" } });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.playbackRate).toBe(1.5);
  });

  it("applies the settings default speed to the player and persists later changes", () => {
    settings.set("playbackRate", 1.7);
    expect(fake.playbackRate).toBe(1.7);

    playback.setRate(2.2);
    expect(settingsStore.getState().playbackRate).toBe(2.2);
    expect(fake.playbackRate).toBe(2.2);
  });

  it("keeps pitch correction on through rate changes and source replacements", async () => {
    expect(fake.preservesPitch).toBe(true);

    fake.preservesPitch = false;
    playback.setRate(1.5);
    expect(fake.preservesPitch).toBe(true);

    fake.preservesPitch = false;
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    expect(fake.preservesPitch).toBe(true);
    playback.setRate(1);
  });
});

describe("resume position", () => {
  const saves = () => (playbackPositions.save as jest.Mock).mock.calls;

  it("throttles position writes to one per interval", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec, { autoplay: false });
    (playbackPositions.save as jest.Mock).mockClear();

    const base = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(base);
    fake.emit("timeUpdate", { currentTime: 10 });
    fake.emit("timeUpdate", { currentTime: 11 });
    now.mockReturnValue(base + POSITION_WRITE_INTERVAL_MS - 1);
    fake.emit("timeUpdate", { currentTime: 14 });
    expect(saves()).toEqual([["r1", 10]]);

    now.mockReturnValue(base + POSITION_WRITE_INTERVAL_MS);
    fake.emit("timeUpdate", { currentTime: 20 });
    expect(saves()).toEqual([
      ["r1", 10],
      ["r1", 20],
    ]);
    now.mockRestore();
  });

  it("writes on pause and on stop", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec, { autoplay: false });
    fake.emit("timeUpdate", { currentTime: 30 });
    (playbackPositions.save as jest.Mock).mockClear();

    playback.pause();
    expect(saves()).toEqual([["r1", 30]]);
    fake.emit("timeUpdate", { currentTime: 31 });
    playback.stop();
    expect(saves().at(-1)).toEqual(["r1", 31]);
    expect(playbackPositions.get("r1")).toBe(31);
  });

  it("stores a finished recording at the start, however long its metadata claims it is", async () => {
    resolveMediaUrl.mockResolvedValue("https://cdn/media.mp4");
    await playback.load(rec, { autoplay: false });
    fake.emit("sourceLoad", { duration: 600 });
    fake.emit("timeUpdate", { currentTime: 600 });
    playback.pause();
    expect(playbackPositions.get("r1")).toBe(0);

    playback.stop();
    await playback.load(rec, { autoplay: false });
    expect(playerStore.getState().position).toBe(0);
  });

  it("resumes a partially played recording when no explicit position is given", async () => {
    resolveMediaUrl.mockResolvedValue("https://cdn/media.mp4");
    await playback.load(rec, { autoplay: false });
    fake.emit("timeUpdate", { currentTime: 40 });
    playback.stop();

    await playback.load(rec, { autoplay: false });
    expect(playerStore.getState().position).toBe(40);
    expect(fake.currentTime).toBe(40);
  });

  it("prefers an explicit position and ignores one near the end", async () => {
    resolveMediaUrl.mockResolvedValue("https://cdn/media.mp4");
    playbackPositions.save("r1", 40);
    await playback.load(rec, { at: 5, autoplay: false });
    expect(playerStore.getState().position).toBe(5);
    playback.stop();

    playbackPositions.save("r1", 88);
    await playback.load(rec, { autoplay: false });
    expect(playerStore.getState().position).toBe(0);
  });

  it("does not overwrite the stored position with a timeUpdate during the load", async () => {
    playbackPositions.save("r1", 40);
    let release!: (url: string) => void;
    resolveMediaUrl.mockImplementationOnce(() => new Promise<string>((r) => (release = r)));
    const loading = playback.load(rec, { autoplay: false });
    fake.emit("timeUpdate", { currentTime: 0 });
    fake.emit("timeUpdate", { currentTime: 2 });
    expect(playbackPositions.get("r1")).toBe(40);

    release("https://cdn/media.mp4");
    await loading;
    expect(fake.currentTime).toBe(40);
    fake.emit("timeUpdate", { currentTime: 41 });
    expect(playbackPositions.get("r1")).toBe(41);
  });

  it("does not record a position while a clip range is playing", async () => {
    resolveMediaUrl.mockResolvedValue("https://cdn/media.mp4");
    await playback.load(rec, { at: 10, until: 20 });
    fake.emit("timeUpdate", { currentTime: 15 });
    fake.emit("timeUpdate", { currentTime: 20.3 });
    expect(playerStore.getState().until).toBeNull();

    fake.emit("playingChange", { isPlaying: false });
    fake.emit("timeUpdate", { currentTime: 20.8 });
    expect(playbackPositions.get("r1")).toBeNull();

    playback.play();
    fake.emit("timeUpdate", { currentTime: 25 });
    expect(playbackPositions.get("r1")).toBe(25);
  });

  it("stops playback on sign-out without persisting into the wiped database", async () => {
    resolveMediaUrl.mockResolvedValue("https://cdn/media.mp4");
    await playback.load(rec, { autoplay: false });
    fake.emit("timeUpdate", { currentTime: 33 });
    playbackPositions.clear("r1");

    authStore.setState({ status: "signed-out", token: null, rejected: null });
    expect(playerStore.getState()).toMatchObject({ current: null, status: "idle" });
    expect(fake.replaceAsync).toHaveBeenCalledWith(null);
    expect(playbackPositions.get("r1")).toBeNull();
  });

  it("records again when a scrub leaves the clip range mid-playback", async () => {
    resolveMediaUrl.mockResolvedValue("https://cdn/media.mp4");
    await playback.load(rec, { at: 10, until: 20 });
    fake.emit("timeUpdate", { currentTime: 15 });
    expect(playbackPositions.get("r1")).toBeNull();

    playback.seekTo(50);
    fake.emit("timeUpdate", { currentTime: 51 });
    expect(playbackPositions.get("r1")).toBe(51);
  });

  it("records again when playback resumes from the lock screen after a clip", async () => {
    resolveMediaUrl.mockResolvedValue("https://cdn/media.mp4");
    await playback.load(rec, { at: 10, until: 20 });
    fake.emit("timeUpdate", { currentTime: 20.3 });
    fake.emit("playingChange", { isPlaying: false });
    expect(playbackPositions.get("r1")).toBeNull();

    fake.emit("playingChange", { isPlaying: true });
    fake.emit("timeUpdate", { currentTime: 26 });
    expect(playbackPositions.get("r1")).toBe(26);
  });

  it("keeps a position per recording and writes the outgoing one on a switch", async () => {
    resolveMediaUrl.mockResolvedValue("https://cdn/media.mp4");
    await playback.load(rec, { autoplay: false });
    fake.emit("timeUpdate", { currentTime: 25 });
    await playback.load({ ...rec, id: "r2", title: "Second" }, { autoplay: false });
    expect(playbackPositions.get("r1")).toBe(25);
    expect(playerStore.getState().position).toBe(0);

    fake.emit("timeUpdate", { currentTime: 12 });
    await playback.load(rec, { autoplay: false });
    expect(playbackPositions.get("r2")).toBe(12);
    expect(playerStore.getState().position).toBe(25);
  });
});

describe("transition timing marks", () => {
  it("drops pending marks when playback resets, so they cannot time a later event", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    perf.mark("fullscreen-exit-playback");
    playback.stop();

    fake.emit("timeUpdate", { currentTime: 3 });
    expect(log).not.toHaveBeenCalled();

    perf.mark("fullscreen-exit-playback");
    fake.emit("timeUpdate", { currentTime: 4 });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("fullscreen unmount → card surface playing"),
    );
    log.mockRestore();
  });
});

describe("seeking before playback", () => {
  it("loads paused at the resume point without starting playback", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    playbackPositions.save("r1", 45);
    await playback.load(rec, { autoplay: false });
    expect(fake.play).not.toHaveBeenCalled();
    expect(fake.currentTime).toBe(45);
    expect(playerStore.getState()).toMatchObject({ position: 45, playing: false });
  });

  it("loads paused at an explicit seek position and stays paused", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec, { at: 12, autoplay: false });
    expect(fake.play).not.toHaveBeenCalled();
    expect(fake.currentTime).toBe(12);
    expect(playerStore.getState()).toMatchObject({ position: 12, playing: false });
  });

  it("pauses the source it just replaced when the new one is loaded paused", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec, { at: 12, autoplay: false });
    expect(fake.pause).toHaveBeenCalled();
    expect(playerStore.getState().playing).toBe(false);
  });

  it("leaves a renderable frame when a seek lands past the end of the source", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec, { autoplay: false });
    fake.emit("sourceLoad", { duration: 600 });
    fake.emit("statusChange", { status: "readyToPlay" });

    playback.seekTo(1800);
    expect(fake.currentTime).toBe(600 - SEEK_END_EPSILON_SECONDS);
    expect(playerStore.getState()).toMatchObject({
      status: "ready",
      position: 600 - SEEK_END_EPSILON_SECONDS,
    });

    playback.seekBy(-30);
    expect(playerStore.getState().position).toBe(570 - SEEK_END_EPSILON_SECONDS);
  });

  it("keeps a resume point that only looks like the end of the previous source", async () => {
    resolveMediaUrl.mockResolvedValue("https://cdn/media.mp4");
    await playback.load(rec, { autoplay: false });
    fake.emit("sourceLoad", { duration: 300 });

    const long = { ...rec, id: "r2", title: "Second", durationMs: 3_600_000 };
    await playback.load(long, { at: 290, until: 320 });
    expect(fake.currentTime).toBe(290);
    expect(playerStore.getState()).toMatchObject({ position: 290, until: 320 });
  });

  it("keeps the playing state across a seek", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    expect(playerStore.getState().playing).toBe(true);
    playback.seekTo(20);
    expect(playerStore.getState()).toMatchObject({ position: 20, playing: true });

    playback.pause();
    (fake.play as jest.Mock).mockClear();
    playback.seekTo(30);
    expect(fake.play).not.toHaveBeenCalled();
    expect(playerStore.getState()).toMatchObject({ position: 30, playing: false });
  });
});

describe("preload", () => {
  it("parks an idle player on the resume frame without playing or storing a position", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.preload(rec, 45);
    expect(fake.play).not.toHaveBeenCalled();
    expect(fake.currentTime).toBe(45);
    expect(playerStore.getState()).toMatchObject({ current: rec, position: 45, playing: false });
    expect(playbackPositions.save).not.toHaveBeenCalled();
  });

  it("never displaces a loaded recording", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    await playback.preload({ ...rec, id: "r2", title: "Second" }, 45);
    expect(playerStore.getState().current?.id).toBe("r1");
  });

  it("starts over when the source turns out to be shorter than the stored position", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.preload(rec, 600);
    expect(fake.currentTime).toBe(600);
    fake.emit("sourceLoad", { duration: 600 });
    fake.emit("statusChange", { status: "readyToPlay" });
    expect(fake.currentTime).toBe(0);
    expect(playerStore.getState()).toMatchObject({ status: "ready", position: 0, duration: 600 });
  });

  it("keeps a mid-recording preload on its resume frame", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.preload(rec, 300);
    fake.emit("sourceLoad", { duration: 600 });
    fake.emit("statusChange", { status: "readyToPlay" });
    expect(fake.currentTime).toBe(300);
    expect(playerStore.getState()).toMatchObject({ status: "ready", position: 300 });
  });

  it("does nothing without a stored position", async () => {
    await playback.preload(rec, 0);
    expect(fake.replaceAsync).not.toHaveBeenCalled();
    expect(playerStore.getState().current).toBeNull();
  });
});

describe("preload failures", () => {
  it("leaves the card untouched when the media url cannot be resolved", async () => {
    resolveMediaUrl.mockRejectedValueOnce(new Error("offline"));
    await playback.preload(rec, 45);
    expect(playerStore.getState()).toMatchObject({ current: null, status: "idle", error: null });
  });

  it("leaves the card untouched when nobody is signed in", async () => {
    authStore.setState({ status: "signed-out", token: null });
    await expect(playback.preload(rec, 45)).resolves.toBeUndefined();
    expect(playerStore.getState().current).toBeNull();
  });

  it("keeps an error the user asked for", async () => {
    resolveMediaUrl.mockRejectedValueOnce(new Error("offline"));
    await playback.load(rec, { at: 45 });
    expect(playerStore.getState()).toMatchObject({ status: "error", error: "offline" });
  });
});

describe("opening a meeting never starts playback", () => {
  it("stays paused after the resume preload", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.preload(rec, 45);
    fake.emit("sourceLoad", { duration: 600 });
    fake.emit("statusChange", { status: "readyToPlay" });
    expect(fake.play).not.toHaveBeenCalled();
    expect(playerStore.getState().playing).toBe(false);
  });

  it("stays paused when a preloaded source errors and the url is re-resolved", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/expired.mp4");
    await playback.preload(rec, 45);
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/fresh.mp4");
    fake.emit("statusChange", { status: "error", error: { message: "403 Forbidden" } });
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.replaceAsync).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "https://cdn/fresh.mp4" }),
    );
    expect(fake.play).not.toHaveBeenCalled();
    expect(playerStore.getState().playing).toBe(false);
  });

  it("stays paused when a download finishes under a preloaded recording", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.preload(rec, 45);
    downloadsStore.setState({
      byId: {
        r1: {
          status: "done",
          progress: 1,
          uri: "file:///docs/downloads/r1.mp4",
          bytes: 1,
          error: null,
        },
      },
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.replaceAsync).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "file:///docs/downloads/r1.mp4" }),
    );
    expect(fake.play).not.toHaveBeenCalled();
    expect(playerStore.getState().playing).toBe(false);
  });

  it("resumes a re-resolved source when the user had started playback", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/expired.mp4");
    await playback.preload(rec, 45);
    playback.play();
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/fresh.mp4");
    fake.emit("statusChange", { status: "error", error: { message: "403 Forbidden" } });
    await new Promise((r) => setTimeout(r, 0));
    expect(playerStore.getState().playing).toBe(true);
  });
});

describe("shared player lifecycle", () => {
  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, VIEW_DETACH_POLL_MS * 3));
    (fake.release as jest.Mock).mockClear();
    (fake.addListener as jest.Mock).mockClear();
    (createVideoPlayer as jest.Mock).mockClear();
  });

  it("releases the shared player and builds a fresh one on sign-out", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    const built = (createVideoPlayer as jest.Mock).mock.calls.length;

    authStore.setState({ status: "signed-in", token: "other" });
    expect(playerStore.getState().current).toBeNull();
    await until(() => (fake.release as jest.Mock).mock.calls.length > 0);

    expect((createVideoPlayer as jest.Mock).mock.calls.length).toBe(built + 1);
    expect(videoPlayer().staysActiveInBackground).toBe(true);
  });

  it("holds the release until the video surface has detached", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    const detach = attachVideoView({} as VideoView);

    authStore.setState({ status: "signed-in", token: "other" });
    await new Promise((r) => setTimeout(r, VIEW_DETACH_POLL_MS * 3));
    expect(fake.release).not.toHaveBeenCalled();

    detach();
    await until(() => (fake.release as jest.Mock).mock.calls.length > 0);
  });

  it("registers the listener set once per player, so a rebuild cannot leak", async () => {
    authStore.setState({ status: "signed-in", token: "other" });
    await until(() => (fake.release as jest.Mock).mock.calls.length > 0);

    expect(fake.addListener).toHaveBeenCalledTimes(4);
    expect(fake.listeners.size).toBe(4);
  });
});

describe("autoplay follows the load's intent, not the store's playing flag", () => {
  it("stays paused when a download finishes while the playing flag is stale", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await preloadWithStalePlayingFlag();

    downloadsStore.setState({ byId: { r1: localFile } });
    await until(() => fake.replaceAsync.mock.calls.length > 0);
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.replaceAsync).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "file:///docs/downloads/r1.mp4" }),
    );
    expect(fake.play).not.toHaveBeenCalled();
  });

  it("stays paused when the source errors while the playing flag is stale", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/expired.mp4");
    await preloadWithStalePlayingFlag();

    resolveMediaUrl.mockResolvedValueOnce("https://cdn/fresh.mp4");
    fake.emit("statusChange", { status: "error", error: { message: "403 Forbidden" } });
    await until(() => fake.replaceAsync.mock.calls.length > 0);
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.replaceAsync).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "https://cdn/fresh.mp4" }),
    );
    expect(fake.play).not.toHaveBeenCalled();
  });

  it("resumes when the user taps play during the re-resolve round trip", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/expired.mp4");
    await playback.preload(rec, 45);

    let giveUrl: ((url: string) => void) | null = null;
    resolveMediaUrl.mockImplementationOnce(
      () => new Promise<string>((r) => (giveUrl = r as (url: string) => void)),
    );
    fake.emit("statusChange", { status: "error", error: { message: "403 Forbidden" } });
    await until(() => giveUrl !== null);

    playback.play();
    giveUrl!("https://cdn/fresh.mp4");
    await new Promise((r) => setTimeout(r, 0));

    expect(playerStore.getState().playing).toBe(true);
  });
});

type WarmFake = Fake & { duration: number; status: string; muted: boolean; currentTime: number };

function warmFake(): WarmFake {
  const listeners = new Map<string, (payload: never) => void>();
  return {
    listeners,
    emit: (name: string, payload: unknown) => listeners.get(name)?.(payload as never),
    duration: 600,
    status: "readyToPlay",
    muted: true,
    currentTime: 0,
    playbackRate: 1,
    preservesPitch: false,
    staysActiveInBackground: false,
    showNowPlayingNotification: false,
    timeUpdateEventInterval: 0,
    addListener: jest.fn((name: string, fn: (payload: never) => void) => listeners.set(name, fn)),
    removeListener: jest.fn((name: string) => listeners.delete(name)),
    replaceAsync: jest.fn(async () => {}),
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
  } as unknown as WarmFake;
}

describe("adopting a warm player", () => {
  let warm: WarmFake;

  beforeEach(() => {
    warm = warmFake();
    (warmPlayers.take as jest.Mock).mockImplementation((id: string) =>
      id === rec.id ? (warm as unknown as VideoPlayer) : null,
    );
  });

  afterEach(async () => {
    (warmPlayers.take as jest.Mock).mockImplementation(() => null);
    playback.stop();
    authStore.setState({ status: "signed-out", token: null });
    authStore.setState({ status: "signed-in", token: "pat" });
    await until(() => videoPlayer() === (fake as unknown as VideoPlayer));
  });

  it("makes the warm player the shared one, paused at the resume point", async () => {
    await playback.load(rec, { at: 30, autoplay: false });

    expect(videoPlayer()).toBe(warm);
    expect(resolveMediaUrl).not.toHaveBeenCalled();
    expect(warm.replaceAsync).not.toHaveBeenCalled();
    expect(warm.currentTime).toBe(30);
    expect(warm.pause).toHaveBeenCalled();
    expect(warm.play).not.toHaveBeenCalled();
    expect(playerStore.getState()).toMatchObject({
      current: rec,
      status: "ready",
      playing: false,
      position: 30,
      duration: 600,
    });
  });

  it("registers the listener set once and restores the shared player's properties", async () => {
    playback.setRate(1.5);
    await playback.load(rec, { at: 30, autoplay: false });

    expect(warm.addListener).toHaveBeenCalledTimes(4);
    expect(warm.listeners.size).toBe(4);
    expect(warm.muted).toBe(false);
    expect(warm.staysActiveInBackground).toBe(true);
    expect(warm.showNowPlayingNotification).toBe(true);
    expect(warm.timeUpdateEventInterval).toBe(0.5);
    expect(warm.playbackRate).toBe(1.5);
    expect(warm.preservesPitch).toBe(true);
    playback.setRate(1);
  });

  it("keeps the surfaces on the adopted instance and releases the old one", async () => {
    const before = playerStore.getState().generation;
    await playback.load(rec, { at: 30, autoplay: false });

    expect(playerStore.getState().generation).toBe(before + 1);
    await until(() => (fake.release as jest.Mock).mock.calls.length > 0);
    expect(fake.listeners.size).toBe(0);
    playback.play();
    expect(warm.play).toHaveBeenCalled();
    expect(fake.play).not.toHaveBeenCalled();
  });

  it("plays straight away when the user asked for it", async () => {
    await playback.load(rec, { at: 30, autoplay: true });
    expect(warm.play).toHaveBeenCalled();
  });

  it("labels the load warm for the time to first frame mark", async () => {
    perf.clear();
    await playback.load(rec, { at: 30, autoplay: false });
    warm.emit("timeUpdate", { currentTime: 30 });
    expect(perf.recent().map((s) => s.label)).toContain("time to first frame (warm)");
  });

  it("ignores the pool for a downloaded recording", async () => {
    downloadsStore.setState({ byId: { r1: localFile } });
    await playback.load(rec, { at: 30, autoplay: false });
    expect(videoPlayer()).toBe(fake);
    expect(fake.replaceAsync).toHaveBeenCalledWith(expect.objectContaining({ uri: localFile.uri }));
  });

  it("loads normally and discards a warm player that already errored", async () => {
    warm.status = "error";
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec, { at: 30, autoplay: false });

    expect(videoPlayer()).toBe(fake);
    expect(warmPlayers.discard).toHaveBeenCalledWith(warm);
    expect(fake.replaceAsync).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "https://cdn/media.mp4" }),
    );
  });

  it("falls back to the normal load when nothing is warm", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load({ ...rec, id: "r2" }, { at: 30, autoplay: false });
    expect(videoPlayer()).toBe(fake);
    expect(resolveMediaUrl).toHaveBeenCalledWith("r2");
  });
});

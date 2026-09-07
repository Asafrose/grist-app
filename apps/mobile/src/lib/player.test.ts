import type { VideoView } from "expo-video";
import { authStore } from "@/lib/auth";
import { downloadsStore } from "@/lib/downloads";
import { makeClient } from "@/lib/grain";
import {
  attachVideoView,
  isPlaybackRate,
  type NowPlaying,
  PLAYBACK_RATES,
  playback,
  player,
  playerStore,
} from "@/lib/player";
import { settings, settingsStore } from "@/lib/settings";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("expo-video", () => {
  const listeners = new Map<string, Function>();
  const emit = (name: string, payload: unknown) => listeners.get(name)?.(payload);
  const fake = {
    listeners,
    emit,
    playing: false,
    currentTime: 0,
    playbackRate: 1,
    staysActiveInBackground: false,
    showNowPlayingNotification: false,
    timeUpdateEventInterval: 0,
    addListener: jest.fn((name: string, fn: Function) => listeners.set(name, fn)),
    replaceAsync: jest.fn(async () => {}),
    replace: jest.fn(),
    play: jest.fn(() => emit("playingChange", { isPlaying: true })),
    pause: jest.fn(() => emit("playingChange", { isPlaying: false })),
  };
  return { createVideoPlayer: jest.fn(() => fake) };
});

type Fake = typeof player & {
  emit: (name: string, payload: unknown) => void;
  replaceAsync: jest.Mock;
};
const fake = player as Fake;
const resolveMediaUrl = jest.fn();
(makeClient as jest.Mock).mockImplementation(() => ({ recordings: { resolveMediaUrl } }));

const rec: NowPlaying = {
  id: "r1",
  title: "Pricing review",
  mediaType: "video",
  thumbnailUrl: "https://thumb/1",
  durationMs: 90_000,
};

beforeEach(() => {
  jest.clearAllMocks();
  (makeClient as jest.Mock).mockImplementation(() => ({ recordings: { resolveMediaUrl } }));
  authStore.setState({ status: "signed-in", token: "pat" });
  downloadsStore.setState({ byId: {} });
  playback.stop();
  playback.setRate(1);
  fake.replaceAsync.mockClear();
});

describe("player store", () => {
  it("configures the shared player for background audio and lock-screen controls", () => {
    expect(player.staysActiveInBackground).toBe(true);
    expect(player.showNowPlayingNotification).toBe(true);
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
    expect(playerStore.getState().position).toBe(120);
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

  it("starts picture in picture on the most recently attached view", async () => {
    const first = { startPictureInPicture: jest.fn(async () => {}) } as unknown as VideoView;
    const second = { startPictureInPicture: jest.fn(async () => {}) } as unknown as VideoView;
    await playback.startPictureInPicture();
    const detachFirst = attachVideoView(first);
    const detachSecond = attachVideoView(second);
    await playback.startPictureInPicture();
    expect(second.startPictureInPicture).toHaveBeenCalledTimes(1);
    detachSecond();
    await playback.startPictureInPicture();
    expect(first.startPictureInPicture).toHaveBeenCalledTimes(1);
    detachFirst();
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

  it("ignores downloads for other recordings", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    fake.replaceAsync.mockClear();
    downloadsStore.setState({ byId: { r2: done("file:///docs/downloads/r2.mp4") } });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.replaceAsync).not.toHaveBeenCalled();
  });
});

describe("playback rate persistence", () => {
  it("applies the settings default speed to the player and persists later changes", () => {
    settings.set("playbackRate", 1.7);
    expect(fake.playbackRate).toBe(1.7);

    playback.setRate(2.2);
    expect(settingsStore.getState().playbackRate).toBe(2.2);
    expect(fake.playbackRate).toBe(2.2);
  });
});

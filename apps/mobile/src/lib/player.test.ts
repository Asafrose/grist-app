import { useAuth } from "@/lib/auth";
import { makeClient } from "@/lib/grain";
import { type NowPlaying, playback, player, usePlayer } from "@/lib/player";

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
  useAuth.setState({ status: "signed-in", token: "pat" });
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
    expect(usePlayer.getState()).toMatchObject({ current: rec, playing: true, duration: 90 });
  });

  it("reuses the loaded source when the same recording is requested again", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    playback.pause();
    await playback.load(rec, { at: 30 });
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
    expect(usePlayer.getState()).toMatchObject({ position: 30, playing: true });
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
    expect(usePlayer.getState().current?.id).toBe("r2");
  });

  it("plays the public sample stream in demo mode without resolving a media url", async () => {
    useAuth.setState({ status: "signed-in", token: "demo" });
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
    expect(usePlayer.getState()).toMatchObject({ status: "error", error: "offline" });
  });

  it("mirrors player events and clamps seeks to the duration", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec, { autoplay: false });
    fake.emit("sourceLoad", { duration: 120 });
    fake.emit("statusChange", { status: "readyToPlay" });
    fake.emit("timeUpdate", { currentTime: 100 });
    expect(usePlayer.getState()).toMatchObject({ status: "ready", duration: 120, position: 100 });
    playback.seekBy(30);
    expect(usePlayer.getState().position).toBe(120);
    playback.seekBy(-200);
    expect(usePlayer.getState().position).toBe(0);
    playback.setRate(1.5);
    expect(fake.playbackRate).toBe(1.5);
    playback.toggle();
    expect(usePlayer.getState().playing).toBe(true);
    playback.toggle();
    expect(usePlayer.getState().playing).toBe(false);
  });

  it("stop clears the source and state but keeps the chosen rate", async () => {
    resolveMediaUrl.mockResolvedValueOnce("https://cdn/media.mp4");
    await playback.load(rec);
    playback.setRate(2);
    playback.stop();
    expect(fake.replaceAsync).toHaveBeenCalledWith(null);
    expect(usePlayer.getState()).toMatchObject({ current: null, status: "idle", rate: 2 });
  });
});

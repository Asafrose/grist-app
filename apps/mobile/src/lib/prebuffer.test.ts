import * as Network from "expo-network";
import { createVideoPlayer } from "expo-video";
import { downloads } from "@/lib/downloads";
import {
  cancelPrebuffer,
  PREBUFFER_PER_PASS,
  PREBUFFER_POLL_MS,
  PREBUFFER_TARGET_SECONDS,
  PREBUFFER_TIMEOUT_MS,
  type PrebufferTarget,
  prebufferIdle,
  prebufferWindowStart,
  runPrebuffer,
  wasPrebuffered,
} from "@/lib/prebuffer";
import { DEFAULT_SETTINGS, settings, settingsStore } from "@/lib/settings";
import { videoPlayerDefaults, videoPlayers } from "@/test/mocks/expo-video";

jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
}));
jest.mock("@/lib/downloads", () => ({ downloads: { localUri: jest.fn(() => null) } }));

const networkState = Network.getNetworkStateAsync as jest.Mock;
const localUri = downloads.localUri as jest.Mock;

const targets = (count: number): PrebufferTarget[] =>
  Array.from({ length: count }, (_, i) => ({ id: `r${i}`, uri: `https://cdn/r${i}.mp4` }));

const uris = () =>
  videoPlayers.flatMap((p) =>
    p.replaceAsync.mock.calls.map(([source]) => (source as { uri: string }).uri),
  );

const tick = (ms = PREBUFFER_POLL_MS) => jest.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  jest.useFakeTimers();
  cancelPrebuffer();
  settingsStore.setState(DEFAULT_SETTINGS);
  videoPlayers.length = 0;
  videoPlayerDefaults.bufferedPosition = PREBUFFER_TARGET_SECONDS;
  videoPlayerDefaults.duration = 0;
  (createVideoPlayer as jest.Mock).mockClear();
  networkState.mockClear();
  networkState.mockResolvedValue({ type: "WIFI" });
  localUri.mockReturnValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("runPrebuffer", () => {
  it("warms one recording at a time and releases each player", async () => {
    const done = runPrebuffer(targets(2));
    await tick(0);
    expect(videoPlayers).toHaveLength(1);
    await tick();
    expect(videoPlayers).toHaveLength(2);
    expect(videoPlayers[0].release).toHaveBeenCalled();
    await tick();
    await done;
    expect(uris()).toEqual(["https://cdn/r0.mp4", "https://cdn/r1.mp4"]);
    expect(videoPlayers[1].release).toHaveBeenCalled();
    expect(wasPrebuffered("https://cdn/r1.mp4")).toBe(true);
  });

  it("sets the forward buffer target before it starts loading the cached source", async () => {
    const done = runPrebuffer(targets(1));
    await tick(0);
    expect(videoPlayers[0].bufferOptions).toEqual({
      preferredForwardBufferDuration: PREBUFFER_TARGET_SECONDS,
    });
    expect(videoPlayers[0].muted).toBe(true);
    expect(videoPlayers[0].replaceAsync).toHaveBeenCalledWith({
      uri: "https://cdn/r0.mp4",
      metadata: undefined,
      useCaching: true,
    });
    await tick();
    await done;
  });

  it("counts a recording as pre-buffered only once the buffer reaches the target", async () => {
    videoPlayerDefaults.bufferedPosition = 0;
    const done = runPrebuffer(targets(1));
    await tick(0);
    videoPlayers[0].bufferedPosition = PREBUFFER_TARGET_SECONDS / 2;
    await tick();
    expect(videoPlayers[0].release).not.toHaveBeenCalled();
    videoPlayers[0].bufferedPosition = PREBUFFER_TARGET_SECONDS;
    await tick();
    await done;
    expect(wasPrebuffered("https://cdn/r0.mp4")).toBe(true);
  });

  it("re-warms a recording whose signed url has rotated", async () => {
    const first = runPrebuffer([{ id: "r0", uri: "https://cdn/r0.mp4?sig=1" }]);
    await tick();
    await first;
    const second = runPrebuffer([{ id: "r0", uri: "https://cdn/r0.mp4?sig=2" }]);
    await tick();
    await second;
    expect(uris()).toEqual(["https://cdn/r0.mp4?sig=1", "https://cdn/r0.mp4?sig=2"]);
    expect(wasPrebuffered("https://cdn/r0.mp4?sig=1")).toBe(true);
  });

  it("warms at most a few recordings per pass", async () => {
    const done = runPrebuffer(targets(PREBUFFER_PER_PASS + 2));
    await tick(PREBUFFER_POLL_MS * (PREBUFFER_PER_PASS + 2));
    await done;
    expect(videoPlayers).toHaveLength(PREBUFFER_PER_PASS);
  });

  it("stays off cellular", async () => {
    networkState.mockResolvedValue({ type: "CELLULAR" });
    await runPrebuffer(targets(1));
    expect(createVideoPlayer).not.toHaveBeenCalled();
  });

  it("reports the pass as idle only once the last player is released", async () => {
    const done = runPrebuffer(targets(1));
    await tick(0);
    let settled = false;
    void prebufferIdle().then(() => {
      settled = true;
    });
    await tick(0);
    expect(settled).toBe(false);
    await tick();
    await done;
    expect(videoPlayers[0].release).toHaveBeenCalled();
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it("stays off when the network state is unknown", async () => {
    networkState.mockRejectedValue(new Error("no radio"));
    await runPrebuffer(targets(1));
    expect(createVideoPlayer).not.toHaveBeenCalled();
  });

  it("does nothing when the window setting is off", async () => {
    settings.set("prebufferDays", 0);
    await runPrebuffer(targets(1));
    expect(networkState).not.toHaveBeenCalled();
    expect(createVideoPlayer).not.toHaveBeenCalled();
  });

  it("skips recordings that are already downloaded", async () => {
    localUri.mockImplementation((id: string) => (id === "r0" ? "file:///r0.mp4" : null));
    const done = runPrebuffer(targets(2));
    await tick(PREBUFFER_POLL_MS * 2);
    await done;
    expect(uris()).toEqual(["https://cdn/r1.mp4"]);
  });

  it("leaves adaptive streams alone", async () => {
    await runPrebuffer([{ id: "r0", uri: "https://cdn/master.m3u8?sig=1" }]);
    expect(createVideoPlayer).not.toHaveBeenCalled();
  });

  it("stops and releases when the pass is cancelled", async () => {
    const done = runPrebuffer(targets(3));
    await tick(0);
    cancelPrebuffer();
    await tick();
    await done;
    expect(videoPlayers).toHaveLength(1);
    expect(videoPlayers[0].release).toHaveBeenCalled();
    expect(wasPrebuffered("https://cdn/r0.mp4")).toBe(false);
  });

  it("releases the player and records no success when the buffer never fills", async () => {
    videoPlayerDefaults.bufferedPosition = 0;
    const done = runPrebuffer(targets(1));
    await tick(0);
    await tick(PREBUFFER_TIMEOUT_MS - PREBUFFER_POLL_MS);
    expect(videoPlayers[0].release).not.toHaveBeenCalled();
    await tick();
    await done;
    expect(videoPlayers[0].release).toHaveBeenCalled();
    expect(wasPrebuffered("https://cdn/r0.mp4")).toBe(false);
  });

  it("warms a recording shorter than the target and stops selecting it", async () => {
    videoPlayerDefaults.bufferedPosition = 40;
    videoPlayerDefaults.duration = 40;
    const first = runPrebuffer(targets(1));
    await tick();
    await first;
    expect(wasPrebuffered("https://cdn/r0.mp4")).toBe(true);
    const second = runPrebuffer(targets(1));
    await tick(PREBUFFER_TIMEOUT_MS);
    await second;
    expect(videoPlayers).toHaveLength(1);
  });

  it("retries a recording that timed out on the next pass", async () => {
    videoPlayerDefaults.bufferedPosition = 0;
    const first = runPrebuffer(targets(1));
    await tick(PREBUFFER_TIMEOUT_MS);
    await first;
    const second = runPrebuffer(targets(1));
    await tick(PREBUFFER_TIMEOUT_MS);
    await second;
    expect(uris()).toEqual(["https://cdn/r0.mp4", "https://cdn/r0.mp4"]);
  });

  it("gives up on a source the player cannot load", async () => {
    videoPlayerDefaults.bufferedPosition = 0;
    const done = runPrebuffer(targets(2));
    await tick(0);
    videoPlayers[0].emit("statusChange", { status: "error" });
    await tick();
    expect(videoPlayers[0].release).toHaveBeenCalled();
    await tick(PREBUFFER_TIMEOUT_MS);
    await done;
    expect(videoPlayers).toHaveLength(2);
    expect(wasPrebuffered("https://cdn/r0.mp4")).toBe(false);
  });
});

describe("prebufferWindowStart", () => {
  it("follows the window setting", () => {
    const now = Date.parse("2026-09-06T10:00:00Z");
    expect(prebufferWindowStart(now)).toBe("2026-09-05T10:00:00.000Z");
    settings.set("prebufferDays", 2);
    expect(prebufferWindowStart(now)).toBe("2026-09-04T10:00:00.000Z");
    settings.set("prebufferDays", 0);
    expect(prebufferWindowStart(now)).toBeNull();
  });
});

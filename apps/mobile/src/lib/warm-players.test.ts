import type { Recording } from "@grist/grain-api";
import page from "@grist/grain-api/fixtures/recordings.json";
import { createVideoPlayer, type VideoPlayer } from "expo-video";
import * as Network from "expo-network";
import { authStore } from "@/lib/auth";
import { type Db, upsertRecordings } from "@/lib/db";
import { downloadsStore } from "@/lib/downloads";
import { libraryStore } from "@/lib/library";
import { clearMediaUrls } from "@/lib/media-url";
import { makeClient } from "@/lib/grain";
import { playerStore } from "@/lib/player";
import { queryClient } from "@/lib/query";
import {
  onWarmAppStateChange,
  WARM_BACKGROUND_RELEASE_MS,
  WARM_POOL_SIZE,
  warmPlayers,
} from "@/lib/warm-players";
import { testDb } from "@/test/db";

jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
  addNetworkStateListener: jest.fn(() => ({ remove: () => undefined })),
}));
jest.mock("@/lib/prewarm", () => ({
  ...jest.requireActual("@/lib/prewarm"),
  prewarmDone: () => new Promise(() => undefined),
}));
jest.mock("@/lib/data/playback-positions", () => ({
  playbackPositions: { resume: jest.fn(() => 12) },
}));

const DAY = 24 * 60 * 60 * 1000;
const base = (page.recordings as Recording[])[0];
const resolveMediaUrl = jest.fn(async (id: string) => `https://cdn/${id}.mp4`);

function seed(db: Db, ids: string[], daysAgo = 0) {
  const recs = ids.map((id, i) => ({
    ...base,
    id,
    title: `Meeting ${id}`,
    media_type: "video",
    start_datetime: new Date(Date.now() - (daysAgo * DAY + i * 1000)).toISOString(),
  }));
  upsertRecordings(db, recs, new Date().toISOString());
}

const players = () =>
  (createVideoPlayer as jest.Mock).mock.results.map((r) => r.value as VideoPlayer);

const warmed = (id: string) =>
  players().find(
    (p) =>
      (
        (p as unknown as { replaceAsync: jest.Mock }).replaceAsync.mock.calls[0]?.[0] as
          | { uri: string }
          | undefined
      )?.uri === `https://cdn/${id}.mp4`,
  );

type Gated = {
  emit: (name: string, payload: unknown) => void;
  release: jest.Mock;
  currentTime: number;
};

function gateNextPlayer(): { finish: () => void } {
  let finish!: () => void;
  const gate = new Promise<void>((r) => (finish = () => r()));
  (createVideoPlayer as jest.Mock).mockImplementationOnce(() => {
    const listeners = new Map<string, (payload: never) => void>();
    return {
      listeners,
      emit: (name: string, payload: never) => listeners.get(name)?.(payload),
      muted: false,
      currentTime: 0,
      addListener: jest.fn((name: string, fn: (payload: never) => void) => listeners.set(name, fn)),
      removeListener: jest.fn((name: string) => listeners.delete(name)),
      replaceAsync: jest.fn(() => gate),
      play: jest.fn(),
      pause: jest.fn(),
      release: jest.fn(),
    };
  });
  return { finish: () => finish() };
}

const player0 = () => players()[0] as unknown as Gated;

const releases = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

let db: Db;

beforeEach(() => {
  jest.clearAllMocks();
  (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({ type: "WIFI" });
  queryClient.setDefaultOptions({ queries: { retry: false } });
  clearMediaUrls();
  resolveMediaUrl.mockImplementation(async (id: string) => `https://cdn/${id}.mp4`);
  (makeClient as jest.Mock).mockImplementation(() => ({ recordings: { resolveMediaUrl } }));
  warmPlayers.releaseAll();
  downloadsStore.setState({ byId: {} });
  playerStore.setState({ current: null });
  authStore.setState({ status: "signed-in", token: "pat" });
  db = testDb();
  libraryStore.setState({ db });
});

afterEach(() => {
  warmPlayers.releaseAll();
  jest.useRealTimers();
});

describe("warm players", () => {
  it("keeps at most the pool size loaded, muted and paused at the resume point", async () => {
    seed(db, ["a", "b", "c", "d"]);
    await warmPlayers.sync();

    expect(warmPlayers.size()).toBe(WARM_POOL_SIZE);
    expect(resolveMediaUrl.mock.calls.map(([id]) => id)).toEqual(["a", "b", "c"]);
    const first = warmed("a") as unknown as {
      muted: boolean;
      preservesPitch: boolean;
      currentTime: number;
      pause: jest.Mock;
      replaceAsync: jest.Mock;
    };
    expect(first.muted).toBe(true);
    expect(first.preservesPitch).toBe(true);
    expect(first.currentTime).toBe(12);
    expect(first.pause).toHaveBeenCalled();
    expect(first.replaceAsync).toHaveBeenCalledWith({
      uri: "https://cdn/a.mp4",
      metadata: { title: "Meeting a", artist: "Grain", artwork: base.thumbnail_url ?? undefined },
    });
    expect(warmPlayers.has("d")).toBe(false);
  });

  it("leaves the playing recording, downloads and older recordings out of the pool", async () => {
    seed(db, ["a", "b"]);
    seed(db, ["old"], 5);
    playerStore.setState({ current: { id: "a" } as never });
    downloadsStore.setState({
      byId: { b: { status: "done", progress: 1, uri: "file:///b.mp4", bytes: 1, error: null } },
    });
    await warmPlayers.sync();

    expect(warmPlayers.size()).toBe(0);
    expect(resolveMediaUrl).not.toHaveBeenCalled();
  });

  it("releases players whose recordings left the window", async () => {
    seed(db, ["a", "b", "c"]);
    await warmPlayers.sync();
    const dropped = warmed("c") as unknown as { release: jest.Mock };

    seed(db, ["x", "y", "z"]);
    await warmPlayers.sync();

    await releases();
    expect(dropped.release).toHaveBeenCalled();
    expect(warmPlayers.size()).toBe(WARM_POOL_SIZE);
    expect(warmPlayers.has("x")).toBe(true);
    expect(warmPlayers.has("c")).toBe(false);
  });

  it("warms nothing off Wi-Fi and releases what it holds", async () => {
    seed(db, ["a"]);
    await warmPlayers.sync();
    expect(warmPlayers.size()).toBe(1);

    (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({ type: "CELLULAR" });
    await warmPlayers.sync();
    expect(warmPlayers.size()).toBe(0);

    (Network.getNetworkStateAsync as jest.Mock).mockRejectedValue(new Error("no radio"));
    await warmPlayers.sync();
    expect(warmPlayers.size()).toBe(0);
  });

  it("warms nothing in demo mode or signed out", async () => {
    seed(db, ["a"]);
    authStore.setState({ status: "signed-in", token: "demo" });
    await warmPlayers.sync();
    expect(warmPlayers.size()).toBe(0);

    authStore.setState({ status: "signed-out", token: null });
    await warmPlayers.sync();
    expect(warmPlayers.size()).toBe(0);
    expect(resolveMediaUrl).not.toHaveBeenCalled();
  });

  it("hands a warm player over unmuted and only once", async () => {
    seed(db, ["a"]);
    await warmPlayers.sync();

    const taken = warmPlayers.take("a");
    expect(taken).toBe(warmed("a"));
    expect(taken?.muted).toBe(false);
    expect(warmPlayers.size()).toBe(0);
    expect(warmPlayers.take("a")).toBeNull();
  });

  it("keeps a still-loading player out of reach and finishes its load untouched", async () => {
    seed(db, ["a"]);
    const { finish } = gateNextPlayer();

    const pass = warmPlayers.sync();
    await new Promise((r) => setTimeout(r, 0));
    expect(warmPlayers.take("a")).toBeNull();

    finish();
    await pass;

    const player = players()[0] as unknown as { release: jest.Mock; currentTime: number };
    expect(player.release).not.toHaveBeenCalled();
    expect(player.currentTime).toBe(12);
    expect(warmPlayers.take("a")).toBe(player as unknown as VideoPlayer);
  });

  it("releases a still-loading player exactly once when it errors mid-load", async () => {
    seed(db, ["a"]);
    const { finish } = gateNextPlayer();

    const pass = warmPlayers.sync();
    await new Promise((r) => setTimeout(r, 0));
    const player = players()[0] as unknown as Gated;
    player.emit("statusChange", { status: "error", error: { message: "403" } });

    finish();
    await pass;
    await releases();

    expect(player.release).toHaveBeenCalledTimes(1);
    expect(warmPlayers.size()).toBe(0);
  });

  it("releases a still-loading player exactly once when the pool is dropped mid-load", async () => {
    seed(db, ["a"]);
    const { finish } = gateNextPlayer();

    const pass = warmPlayers.sync();
    await new Promise((r) => setTimeout(r, 0));
    warmPlayers.releaseAll();

    finish();
    await pass;
    await releases();

    expect(player0().release).toHaveBeenCalledTimes(1);
    expect(warmPlayers.size()).toBe(0);
  });

  it("drops a pool player that errors instead of handing it over", async () => {
    seed(db, ["a"]);
    await warmPlayers.sync();
    const player = warmed("a") as unknown as {
      release: jest.Mock;
      emit: (name: string, payload: unknown) => void;
    };

    player.emit("statusChange", { status: "error", error: { message: "403" } });

    expect(warmPlayers.size()).toBe(0);
    expect(warmPlayers.take("a")).toBeNull();
    await releases();
    expect(player.release).toHaveBeenCalledTimes(1);
  });

  it("keeps the pass alive when a source fails to load", async () => {
    seed(db, ["a", "b"]);
    resolveMediaUrl.mockRejectedValueOnce(new Error("403"));
    await warmPlayers.sync();

    expect(warmPlayers.has("a")).toBe(false);
    expect(warmPlayers.has("b")).toBe(true);
  });

  it("dedupes concurrent passes", async () => {
    seed(db, ["a"]);
    const first = warmPlayers.sync();
    expect(warmPlayers.sync()).toBe(first);
    await first;
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
  });

  it("releases everything on sign-out", async () => {
    seed(db, ["a"]);
    await warmPlayers.sync();
    authStore.setState({ status: "signed-out", token: null });
    expect(warmPlayers.size()).toBe(0);
  });

  it("releases everything after a long spell in the background", async () => {
    seed(db, ["a"]);
    await warmPlayers.sync();
    jest.useFakeTimers();

    onWarmAppStateChange("background");
    expect(warmPlayers.size()).toBe(1);
    jest.advanceTimersByTime(WARM_BACKGROUND_RELEASE_MS);
    expect(warmPlayers.size()).toBe(0);
  });

  it("cancels the background release and schedules a pass when the app comes back", async () => {
    seed(db, ["a"]);
    await warmPlayers.sync();
    jest.useFakeTimers();

    onWarmAppStateChange("background");
    onWarmAppStateChange("active");
    jest.advanceTimersByTime(WARM_BACKGROUND_RELEASE_MS);
    expect(warmPlayers.size()).toBe(1);
  });
});

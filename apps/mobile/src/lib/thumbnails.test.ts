import { getThumbnailAsync } from "expo-video-thumbnails";
import { authStore } from "@/lib/auth";
import { makeClient } from "@/lib/grain";
import { frameTime, THUMBNAIL_RETRY_MS, thumbnails, thumbnailsStore } from "@/lib/thumbnails";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn() }));
jest.mock("expo-file-system", () => {
  const files = new Set<string>();
  class Entry {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts
        .map((p) => (typeof p === "string" ? p : (p as { uri: string }).uri))
        .join("/");
    }
  }
  class File extends Entry {
    get exists() {
      return files.has(this.uri);
    }
    delete() {
      files.delete(this.uri);
    }
    move(dest: File) {
      files.delete(this.uri);
      files.add(dest.uri);
      this.uri = dest.uri;
    }
  }
  class Directory extends Entry {
    get exists() {
      return [...files].some((f) => f.startsWith(`${this.uri}/`));
    }
    create() {}
    delete() {
      for (const f of files) if (f.startsWith(`${this.uri}/`)) files.delete(f);
    }
  }
  return { File, Directory, Paths: { cache: new Directory("cache") }, mockFiles: files };
});

const files = jest.requireMock("expo-file-system").mockFiles as Set<string>;
const resolveMediaUrl = jest.fn();
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  files.clear();
  thumbnails.clear();
  authStore.setState({ status: "signed-in", token: "pat" });
  (makeClient as jest.Mock).mockImplementation(() => ({ recordings: { resolveMediaUrl } }));
  resolveMediaUrl.mockImplementation(async (id: string) => `https://cdn/${id}.mp4`);
  (getThumbnailAsync as jest.Mock).mockImplementation(async (url: string) => {
    files.add(`tmp/${url.split("/").pop()}.jpg`);
    return { uri: `tmp/${url.split("/").pop()}.jpg`, width: 320, height: 180 };
  });
});

const video = (id: string) => ({ id, mediaType: "video", durationMs: 2_641_000 });

describe("thumbnails", () => {
  it("picks a frame a quarter in, between 30 seconds and 5 minutes", () => {
    expect(frameTime(2_641_000)).toBe(300_000);
    expect(frameTime(600_000)).toBe(150_000);
    expect(frameTime(60_000)).toBe(30_000);
    expect(frameTime(20_000)).toBe(10_000);
    expect(frameTime(0)).toBe(0);
  });

  it("generates a frame from the resolved media url and caches it on disk", async () => {
    thumbnails.request(video("r1"));
    await flush();
    await flush();
    expect(resolveMediaUrl).toHaveBeenCalledWith("r1");
    expect(getThumbnailAsync).toHaveBeenCalledWith("https://cdn/r1.mp4", {
      time: 300_000,
      quality: 0.6,
    });
    expect(thumbnailsStore.getState().byId.r1).toBe("cache/thumbnails/r1.jpg");
    expect(files.has("cache/thumbnails/r1.jpg")).toBe(true);
  });

  it("serves a cached file without touching the network", async () => {
    files.add("cache/thumbnails/r2.jpg");
    thumbnails.request(video("r2"));
    expect(thumbnailsStore.getState().byId.r2).toBe("cache/thumbnails/r2.jpg");
    await flush();
    expect(resolveMediaUrl).not.toHaveBeenCalled();
  });

  it("skips audio and transcript recordings", () => {
    thumbnails.request({ id: "a1", mediaType: "audio", durationMs: 1000 });
    expect(thumbnailsStore.getState().byId.a1).toBeNull();
    expect(resolveMediaUrl).not.toHaveBeenCalled();
  });

  it("records a failure as null and retries only after the back-off", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    try {
      resolveMediaUrl.mockRejectedValueOnce(new Error("rate limited"));
      thumbnails.request(video("r3"));
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(thumbnailsStore.getState().byId.r3).toBeNull();
      thumbnails.request(video("r3"));
      expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(THUMBNAIL_RETRY_MS);
      expect(thumbnailsStore.getState().byId).not.toHaveProperty("r3");
      thumbnails.request(video("r3"));
      expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("runs at most six generations at a time and dedupes requests", async () => {
    let inFlight = 0;
    let peak = 0;
    (getThumbnailAsync as jest.Mock).mockImplementation(async (url: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const uri = `tmp/${url.split("/").pop()}.jpg`;
      files.add(uri);
      return { uri, width: 1, height: 1 };
    });
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    for (const id of [...ids, "a", "b"]) thumbnails.request(video(id));
    expect(thumbnails.pending()).toBe(ids.length);
    await new Promise((r) => setTimeout(r, 60));
    expect(peak).toBe(6);
    expect(getThumbnailAsync).toHaveBeenCalledTimes(ids.length);
    expect(Object.keys(thumbnailsStore.getState().byId).toSorted()).toEqual(ids);
  });

  it("whenIdle resolves immediately when nothing is queued and after the queue drains", async () => {
    await expect(thumbnails.whenIdle()).resolves.toBeUndefined();
    thumbnails.request(video("w1"));
    thumbnails.request(video("w2"));
    expect(thumbnails.pending()).toBe(2);
    await thumbnails.whenIdle();
    expect(thumbnails.pending()).toBe(0);
    expect(thumbnailsStore.getState().byId.w1).toBe("cache/thumbnails/w1.jpg");
    expect(thumbnailsStore.getState().byId.w2).toBe("cache/thumbnails/w2.jpg");
  });

  it("uses the sample stream in demo mode", async () => {
    authStore.setState({ status: "signed-in", token: "demo" });
    thumbnails.request(video("demo-1"));
    await flush();
    await flush();
    expect(resolveMediaUrl).not.toHaveBeenCalled();
    expect((getThumbnailAsync as jest.Mock).mock.calls[0][0]).toContain(
      "devstreaming-cdn.apple.com",
    );
  });

  it("clear wipes the cache directory and the in-memory map", async () => {
    thumbnails.request(video("r4"));
    await flush();
    await flush();
    expect(files.has("cache/thumbnails/r4.jpg")).toBe(true);
    thumbnails.clear();
    expect(files.size).toBe(0);
    expect(thumbnailsStore.getState().byId).toEqual({});
  });
});

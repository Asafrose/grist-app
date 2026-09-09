import { clearVideoCacheAsync, setVideoCacheSizeAsync } from "expo-video";
import {
  cachedSource,
  clearVideoCache,
  configureVideoCache,
  isCacheableUri,
  uncachedSource,
  VIDEO_CACHE_BYTES,
} from "@/lib/video-cache";

const setSize = setVideoCacheSizeAsync as jest.Mock;
const clearCache = clearVideoCacheAsync as jest.Mock;

beforeEach(() => {
  setSize.mockReset().mockResolvedValue(undefined);
  clearCache.mockReset().mockResolvedValue(undefined);
});

describe("cachedSource", () => {
  it("never caches adaptive streams the player cannot cache", () => {
    expect(cachedSource("https://cdn/master.m3u8?sig=1")).toMatchObject({ useCaching: false });
    expect(cachedSource("https://cdn/manifest.MPD")).toMatchObject({ useCaching: false });
    expect(cachedSource("https://cdn/r1.mp4?playlist=master.m3u8")).toMatchObject({
      useCaching: true,
    });
    expect(isCacheableUri("https://cdn/r1.mp4")).toBe(true);
    expect(isCacheableUri("file:///downloads/r1.mp4")).toBe(false);
  });

  it("builds an uncached source for a retry", () => {
    expect(uncachedSource("https://cdn/r1.mp4", { title: "Standup" })).toEqual({
      uri: "https://cdn/r1.mp4",
      metadata: { title: "Standup" },
      useCaching: false,
    });
  });

  it("caches streamed sources and leaves local files alone", () => {
    expect(cachedSource("https://cdn/r1.mp4", { title: "Standup" })).toEqual({
      uri: "https://cdn/r1.mp4",
      metadata: { title: "Standup" },
      useCaching: true,
    });
    expect(cachedSource("file:///downloads/r1.mp4")).toEqual({
      uri: "file:///downloads/r1.mp4",
      metadata: undefined,
      useCaching: false,
    });
  });
});

describe("video cache", () => {
  it("bounds the cache and clears it", async () => {
    await configureVideoCache();
    expect(setSize).toHaveBeenCalledWith(VIDEO_CACHE_BYTES);
    await clearVideoCache();
    expect(clearCache).toHaveBeenCalled();
  });

  it("surfaces a native refusal to its caller", async () => {
    setSize.mockRejectedValue(new Error("active players"));
    clearCache.mockRejectedValue(new Error("active players"));
    await expect(configureVideoCache()).rejects.toThrow("active players");
    await expect(clearVideoCache()).rejects.toThrow("active players");
  });
});

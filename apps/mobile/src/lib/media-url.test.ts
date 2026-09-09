import { GrainApiError } from "@grist/grain-api";
import { auth, authStore } from "@/lib/auth";
import { DEMO_MEDIA_URL } from "@/lib/demo";
import { makeClient } from "@/lib/grain";
import {
  clearMediaUrls,
  invalidateMediaUrl,
  mediaUrl,
  MEDIA_URL_GC_MS,
  MEDIA_URL_PREWARM_STALE_MS,
  MEDIA_URL_STALE_MS,
  mediaUrlKey,
  prewarmMediaUrl,
} from "@/lib/media-url";
import { queryClient } from "@/lib/query";

jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));

let calls = 0;
const resolveMediaUrl = jest.fn(async (id: string) => `https://cdn/${id}.mp4?sig=${calls++}`);

beforeEach(() => {
  calls = 0;
  jest.clearAllMocks();
  queryClient.clear();
  (makeClient as jest.Mock).mockImplementation(() => ({ recordings: { resolveMediaUrl } }));
});

describe("mediaUrl", () => {
  it("stays inside the signed-URL lifetime", () => {
    expect(MEDIA_URL_STALE_MS).toBeLessThan(MEDIA_URL_GC_MS);
    expect(MEDIA_URL_GC_MS).toBe(60 * 60_000);
  });

  it("resolves once and serves the cached URL inside the stale window", async () => {
    const first = await mediaUrl("r1", "pat");
    const second = await mediaUrl("r1", "pat");
    expect(second).toBe(first);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryState(mediaUrlKey("r1", "pat"))?.dataUpdatedAt).toBeGreaterThan(0);
  });

  it("dedupes concurrent resolutions of the same recording", async () => {
    const [a, b] = await Promise.all([mediaUrl("r1", "pat"), mediaUrl("r1", "pat")]);
    expect(a).toBe(b);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
  });

  it("keys by token so a new account resolves again", async () => {
    await mediaUrl("r1", "pat");
    await mediaUrl("r1", "other");
    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
  });

  it("returns the sample stream for the demo token without calling the API", async () => {
    expect(await mediaUrl("r1", "demo")).toBe(DEMO_MEDIA_URL);
    expect(makeClient).not.toHaveBeenCalled();
  });

  it("invalidate forces the next resolution to hit the API again", async () => {
    const first = await mediaUrl("r1", "pat");
    invalidateMediaUrl("r1");
    const second = await mediaUrl("r1", "pat");
    expect(second).not.toBe(first);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
  });

  it("invalidate leaves other recordings cached", async () => {
    await mediaUrl("r1", "pat");
    await mediaUrl("r2", "pat");
    invalidateMediaUrl("r1");
    await mediaUrl("r2", "pat");
    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
  });

  it("rejects the token when the media URL comes back 401", async () => {
    authStore.setState({ status: "signed-in", token: "pat", rejected: null });
    resolveMediaUrl.mockRejectedValueOnce(new GrainApiError("Unauthorized", 401));
    await expect(mediaUrl("r1", "pat")).rejects.toThrow("Unauthorized");
    expect(auth.rejected()).toBe("Grain didn't accept that token. Check it and try again.");
    auth.accept();
  });

  it("re-resolves a pre-warmed URL that has outlived its shorter freshness", async () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now);
    const warmed = await prewarmMediaUrl("r1", "pat");
    jest.spyOn(Date, "now").mockReturnValue(now + MEDIA_URL_PREWARM_STALE_MS - 1);
    expect(await mediaUrl("r1", "pat")).toBe(warmed);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, "now").mockReturnValue(now + MEDIA_URL_PREWARM_STALE_MS);
    const fresh = await mediaUrl("r1", "pat");
    expect(fresh).not.toBe(warmed);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);

    expect(await mediaUrl("r1", "pat")).toBe(fresh);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
    jest.spyOn(Date, "now").mockRestore();
  });

  it("keeps a pre-warmed URL inside the plain stale window once re-resolved on tap", () => {
    expect(MEDIA_URL_PREWARM_STALE_MS).toBeLessThan(MEDIA_URL_STALE_MS);
  });

  it("clear drops every cached URL", async () => {
    await mediaUrl("r1", "pat");
    clearMediaUrls();
    expect(queryClient.getQueryState(mediaUrlKey("r1", "pat"))).toBeUndefined();
  });
});

import { File } from "expo-file-system";
import { authStore } from "@/lib/auth";
import {
  CAP_EXCEEDED,
  downloads,
  downloadsStore,
  extensionFor,
  hydrateDownloads,
  IDLE_DOWNLOAD,
} from "@/lib/downloads";
import { makeClient } from "@/lib/grain";
import { settingsStore } from "@/lib/settings";

jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("expo-file-system", () => require("@/test/mocks/expo-file-system"));

type DownloadOpts = {
  signal: AbortSignal;
  onProgress: (p: { bytesWritten: number; totalBytes: number }) => void;
};

const sizes = jest.requireMock("expo-file-system").mockSizes as Map<string, number>;
const downloadFileAsync = File.downloadFileAsync as jest.Mock;
const resolveMediaUrl = jest.fn(async (id: string) => `https://cdn/${id}.mp4`);
const flush = () => new Promise((r) => setTimeout(r, 0));

function scriptedDownload(steps: { bytesWritten: number; totalBytes: number }[]) {
  downloadFileAsync.mockImplementationOnce(
    async (_url: string, dest: { uri: string }, opts: DownloadOpts) => {
      for (const step of steps) {
        await flush();
        if (opts.signal.aborted) throw new Error("AbortError");
        opts.onProgress(step);
      }
      if (opts.signal.aborted) throw new Error("AbortError");
      sizes.set(dest.uri, steps.at(-1)?.totalBytes ?? 0);
      return new File(dest.uri);
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  sizes.clear();
  downloads.clear();
  settingsStore.setState({ downloadCapBytes: 2 * 1024 ** 3 });
  authStore.setState({ status: "signed-in", token: "pat" });
  (makeClient as jest.Mock).mockImplementation(() => ({ recordings: { resolveMediaUrl } }));
});

describe("downloads", () => {
  it("names files by recording id and media type", () => {
    expect(extensionFor("video")).toBe("mp4");
    expect(extensionFor("audio")).toBe("m4a");
  });

  it("reports progress, then a done entry with the file uri and size", async () => {
    scriptedDownload([
      { bytesWritten: 250, totalBytes: 1000 },
      { bytesWritten: 1000, totalBytes: 1000 },
    ]);
    const run = downloads.start("r1", "video");
    expect(downloadsStore.getState().byId.r1).toMatchObject({ status: "downloading", progress: 0 });
    await flush();
    await flush();
    expect(downloadsStore.getState().byId.r1).toMatchObject({ progress: 0.25, bytes: 250 });
    await run;
    expect(resolveMediaUrl).toHaveBeenCalledWith("r1");
    expect(downloadFileAsync).toHaveBeenCalledWith(
      "https://cdn/r1.mp4",
      expect.objectContaining({ uri: "file:///docs/downloads/r1.mp4" }),
      expect.objectContaining({ idempotent: true }),
    );
    expect(downloadsStore.getState().byId.r1).toEqual({
      status: "done",
      progress: 1,
      uri: "file:///docs/downloads/r1.mp4",
      bytes: 1000,
      error: null,
    });
    expect(downloads.localUri("r1")).toBe("file:///docs/downloads/r1.mp4");
    expect(downloads.localUri("other")).toBeNull();
  });

  it("ignores a second start while downloading or done", async () => {
    scriptedDownload([{ bytesWritten: 10, totalBytes: 10 }]);
    const first = downloads.start("r1");
    await downloads.start("r1");
    await first;
    await downloads.start("r1");
    expect(downloadFileAsync).toHaveBeenCalledTimes(1);
  });

  it("records failures and removes the partial file", async () => {
    downloadFileAsync.mockImplementationOnce(async (_u: string, dest: { uri: string }) => {
      sizes.set(dest.uri, 5);
      throw new Error("offline");
    });
    await downloads.start("r1");
    expect(downloadsStore.getState().byId.r1).toMatchObject({ status: "error", error: "offline" });
    expect(sizes.has("file:///docs/downloads/r1.mp4")).toBe(false);
    expect(downloads.localUri("r1")).toBeNull();
  });

  it("refuses when the download would exceed the cap", async () => {
    settingsStore.setState({ downloadCapBytes: 1 * 1024 ** 3 });
    sizes.set("file:///docs/downloads/old.mp4", 1024 ** 3 - 100);
    scriptedDownload([
      { bytesWritten: 50, totalBytes: 500 },
      { bytesWritten: 500, totalBytes: 500 },
    ]);
    await downloads.start("r1");
    expect(downloadsStore.getState().byId.r1).toMatchObject({
      status: "error",
      error: CAP_EXCEEDED,
    });
    expect(sizes.has("file:///docs/downloads/r1.mp4")).toBe(false);
  });

  it("cancel aborts the task and forgets the entry", async () => {
    scriptedDownload([
      { bytesWritten: 1, totalBytes: 10 },
      { bytesWritten: 10, totalBytes: 10 },
    ]);
    const run = downloads.start("r1");
    await flush();
    downloads.cancel("r1");
    expect(downloadsStore.getState().byId.r1).toBeUndefined();
    await run;
    expect(downloadsStore.getState().byId.r1).toBeUndefined();
    expect(sizes.has("file:///docs/downloads/r1.mp4")).toBe(false);
    downloads.cancel("never-started");
  });

  it("remove deletes the file and bumps the version", async () => {
    scriptedDownload([{ bytesWritten: 10, totalBytes: 10 }]);
    await downloads.start("r1");
    const before = downloadsStore.getState().version;
    downloads.remove("r1");
    expect(sizes.has("file:///docs/downloads/r1.mp4")).toBe(false);
    expect(downloadsStore.getState().byId.r1).toBeUndefined();
    expect(downloadsStore.getState().version).toBeGreaterThan(before);
  });

  it("hydrates completed downloads from the directory", () => {
    sizes.set("file:///docs/downloads/a.mp4", 600);
    sizes.set("file:///docs/downloads/b.m4a", 400);
    hydrateDownloads();
    expect(downloadsStore.getState().byId).toEqual({
      a: {
        status: "done",
        progress: 1,
        uri: "file:///docs/downloads/a.mp4",
        bytes: 600,
        error: null,
      },
      b: {
        status: "done",
        progress: 1,
        uri: "file:///docs/downloads/b.m4a",
        bytes: 400,
        error: null,
      },
    });
    expect(downloads.localUri("a")).toBe("file:///docs/downloads/a.mp4");
  });

  it("clear wipes files and state", async () => {
    scriptedDownload([{ bytesWritten: 10, totalBytes: 10 }]);
    await downloads.start("r1");
    downloads.clear();
    expect(sizes.size).toBe(0);
    expect(downloadsStore.getState().byId).toEqual({});
  });

  it("marks demo recordings as available without touching the network", async () => {
    authStore.setState({ status: "signed-in", token: "demo" });
    await downloads.start("demo-0");
    expect(downloadFileAsync).not.toHaveBeenCalled();
    expect(resolveMediaUrl).not.toHaveBeenCalled();
    expect(downloadsStore.getState().byId["demo-0"]).toMatchObject({ status: "done" });
    expect(downloads.localUri("demo-0")).toContain("devstreaming-cdn.apple.com");
  });

  it("fails without a token", async () => {
    authStore.setState({ status: "signed-out", token: null });
    await downloads.start("r1");
    expect(downloadsStore.getState().byId.r1).toMatchObject({
      status: "error",
      error: "Not signed in",
    });
    expect(IDLE_DOWNLOAD.status).toBe("idle");
  });
});

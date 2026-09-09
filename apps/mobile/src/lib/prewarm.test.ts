import type { Recording } from "@grist/grain-api";
import page from "@grist/grain-api/fixtures/recordings.json";
import { onlineManager } from "@tanstack/react-query";
import { authStore } from "@/lib/auth";
import { upsertRecordings } from "@/lib/db";
import { makeClient } from "@/lib/grain";
import { clearMediaUrls, mediaUrlKey } from "@/lib/media-url";
import { runPrebuffer } from "@/lib/prebuffer";
import { cancelPrewarm, PREWARM_PER_PASS, prewarmWindowStart, runPrewarm } from "@/lib/prewarm";
import { queryClient } from "@/lib/query";
import { DEFAULT_SETTINGS, settings, settingsStore } from "@/lib/settings";
import { testDb } from "@/test/db";

jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-file-system", () => require("@/test/mocks/expo-file-system"));
jest.mock("@/lib/prebuffer", () => ({
  ...jest.requireActual("@/lib/prebuffer"),
  runPrebuffer: jest.fn(async () => undefined),
}));

const DAY = 24 * 60 * 60 * 1000;
const base = (page.recordings as Recording[])[0];
const resolveMediaUrl = jest.fn(async (id: string) => `https://cdn/${id}.mp4?sig=1`);

function seed(db: ReturnType<typeof testDb>, count: number, daysAgo = 0) {
  const recs = Array.from({ length: count }, (_, i) => ({
    ...base,
    id: `r${i}`,
    title: `Meeting ${i}`,
    start_datetime: new Date(Date.now() - (daysAgo + i / 100) * DAY).toISOString(),
  }));
  upsertRecordings(db, recs, new Date().toISOString());
}

const ids = () => resolveMediaUrl.mock.calls.map(([id]) => id);

beforeEach(() => {
  jest.restoreAllMocks();
  cancelPrewarm();
  clearMediaUrls();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  resolveMediaUrl.mockClear();
  (runPrebuffer as jest.Mock).mockClear();
  resolveMediaUrl.mockImplementation(async (id: string) => `https://cdn/${id}.mp4?sig=1`);
  (makeClient as jest.Mock).mockImplementation(() => ({ recordings: { resolveMediaUrl } }));
  authStore.setState({ status: "signed-in", token: "pat" });
  onlineManager.setOnline(true);
  settingsStore.setState(DEFAULT_SETTINGS);
});

afterAll(() => onlineManager.setOnline(true));

describe("runPrewarm", () => {
  it("caches the signed url under the key the player reads", async () => {
    const db = testDb();
    seed(db, 1);
    await runPrewarm(db);
    expect(resolveMediaUrl).toHaveBeenCalledWith("r0");
    expect(queryClient.getQueryData(mediaUrlKey("r0", "pat"))).toBe("https://cdn/r0.mp4?sig=1");
  });

  it("leaves recordings older than a day alone", async () => {
    const db = testDb();
    seed(db, 1, 5);
    await runPrewarm(db);
    expect(resolveMediaUrl).not.toHaveBeenCalled();
  });

  it("covers the whole window across successive passes", async () => {
    const db = testDb();
    seed(db, PREWARM_PER_PASS + 4);
    await runPrewarm(db);
    expect(ids()).toEqual(Array.from({ length: PREWARM_PER_PASS }, (_, i) => `r${i}`));
    resolveMediaUrl.mockClear();
    await runPrewarm(db);
    expect(ids()).toEqual(["r10", "r11", "r12", "r13"]);
    resolveMediaUrl.mockClear();
    await runPrewarm(db);
    expect(resolveMediaUrl).not.toHaveBeenCalled();
  });

  it("does nothing while offline or signed out", async () => {
    const db = testDb();
    seed(db, 1);
    onlineManager.setOnline(false);
    await runPrewarm(db);
    onlineManager.setOnline(true);
    authStore.setState({ status: "signed-out", token: null });
    await runPrewarm(db);
    expect(resolveMediaUrl).not.toHaveBeenCalled();
  });

  it("resolves nothing over the network in demo mode", async () => {
    const db = testDb();
    seed(db, 1);
    authStore.setState({ status: "signed-in", token: "demo" });
    await runPrewarm(db);
    expect(resolveMediaUrl).not.toHaveBeenCalled();
  });

  it("backs a failed recording off and retries it later", async () => {
    const db = testDb();
    seed(db, 1);
    resolveMediaUrl.mockRejectedValue(new Error("403"));
    await runPrewarm(db);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
    await runPrewarm(db);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
    await runPrewarm(db);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent passes", async () => {
    const db = testDb();
    seed(db, 2);
    const first = runPrewarm(db);
    expect(runPrewarm(db)).toBe(first);
    await first;
    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
  });

  it("stops when the token changes and when the pass is cancelled", async () => {
    const db = testDb();
    seed(db, 3);
    resolveMediaUrl.mockImplementationOnce(async (id: string) => {
      authStore.setState({ status: "signed-in", token: "other" });
      return `https://cdn/${id}.mp4?sig=1`;
    });
    await runPrewarm(db);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);

    authStore.setState({ status: "signed-in", token: "pat" });
    cancelPrewarm();
    clearMediaUrls();
    resolveMediaUrl.mockClear();
    resolveMediaUrl.mockImplementationOnce(async (id: string) => {
      cancelPrewarm();
      return `https://cdn/${id}.mp4?sig=1`;
    });
    await runPrewarm(db);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
  });

  it("swallows a failing pass so the next one still happens", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(runPrewarm({} as never)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    const db = testDb();
    seed(db, 1);
    await runPrewarm(db);
    expect(resolveMediaUrl).toHaveBeenCalledTimes(1);
  });

  it("hands the resolved recent recordings to the pre-buffer runner", async () => {
    const db = testDb();
    seed(db, 2);
    await runPrewarm(db);
    expect(runPrebuffer).toHaveBeenCalledWith(
      [
        { id: "r0", uri: "https://cdn/r0.mp4?sig=1" },
        { id: "r1", uri: "https://cdn/r1.mp4?sig=1" },
      ],
      expect.any(Function),
    );
  });

  it("pre-buffers nothing when the window setting is off", async () => {
    const db = testDb();
    seed(db, 1);
    settings.set("prebufferDays", 0);
    await runPrewarm(db);
    expect(runPrebuffer).toHaveBeenCalledWith([], expect.any(Function));
  });

  it("widens the url window to cover a two day pre-buffer window", () => {
    const now = Date.parse("2026-09-06T10:00:00Z");
    settings.set("prebufferDays", 2);
    expect(prewarmWindowStart(now)).toBe("2026-09-04T10:00:00.000Z");
  });

  it("computes the window start a day back", () => {
    const now = Date.parse("2026-09-06T10:00:00Z");
    expect(prewarmWindowStart(now)).toBe("2026-09-05T10:00:00.000Z");
  });
});

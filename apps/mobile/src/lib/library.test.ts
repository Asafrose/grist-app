import type { Recording } from "@grist/grain-api";
import page from "@grist/grain-api/fixtures/recordings.json";
import { focusManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { renderHook, waitFor } from "@testing-library/react-native";
import { authStore } from "@/lib/auth";
import { listRecordings } from "@/lib/db";
import { makeClient } from "@/lib/grain";
import {
  library,
  libraryKey,
  libraryReady,
  libraryStore,
  useDb,
  useSyncError,
  useSyncStatus,
} from "@/lib/library";
import { queryClient } from "@/lib/query";

jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("@/lib/me", () => ({
  me: { resolve: jest.fn(async () => null), reset: jest.fn(), hydrate: jest.fn() },
}));

const recs = (page.recordings as Recording[]).slice(0, 2);
const iterate = jest.fn(async function* () {
  yield { cursor: null, recordings: recs };
});
const transcript = jest.fn(async () => []);
const workspaceLists = {
  users: { list: jest.fn(async () => ({ users: [] })) },
  teams: { list: jest.fn(async () => ({ teams: [] })) },
  meetingTypes: { list: jest.fn(async () => ({ meeting_types: [] })) },
};
const fakeClient = () => ({ recordings: { iterate, transcript }, ...workspaceLists });
(makeClient as jest.Mock).mockImplementation(fakeClient);

queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  focusManager.setFocused(false);
  (makeClient as jest.Mock).mockImplementation(fakeClient);
});

describe("library store", () => {
  it("opens the database before anything else and starts idle", async () => {
    await libraryReady;
    const s = libraryStore.getState();
    expect(s.db).not.toBeNull();
    expect(listRecordings(s.db!)).toEqual([]);
    expect(iterate).not.toHaveBeenCalled();
  });

  it("syncs when the user signs in and prefetches transcripts on Wi-Fi", async () => {
    await libraryReady;
    authStore.setState({ status: "signed-in", token: "pat" });
    await new Promise((r) => setTimeout(r, 0));
    await library.refresh();
    const s = libraryStore.getState();
    expect(listRecordings(s.db!)).toHaveLength(2);
    expect(queryClient.getQueryData(libraryKey("pat"))).toEqual(expect.any(String));
    await library.prefetchDone();
    expect(transcript).toHaveBeenCalledTimes(2);
  });

  it("holds a refresh inside the stale window but honours force", async () => {
    await libraryReady;
    authStore.setState({ status: "signed-in", token: "pat" });
    await library.refresh(true);
    iterate.mockClear();
    await library.refresh();
    expect(iterate).not.toHaveBeenCalled();
    await library.refresh(true);
    expect(iterate).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent refreshes into one sync", async () => {
    await libraryReady;
    await library.clear();
    authStore.setState({ status: "signed-in", token: "pat" });
    await Promise.all([library.refresh(true), library.refresh(true)]);
    expect(iterate).toHaveBeenCalledTimes(1);
  });

  it("skips transcript prefetch off Wi-Fi", async () => {
    await libraryReady;
    authStore.setState({ status: "signed-in", token: "pat" });
    (Network.getNetworkStateAsync as jest.Mock).mockResolvedValueOnce({ type: "CELLULAR" });
    transcript.mockClear();
    await library.refresh(true);
    await library.prefetchDone();
    expect(transcript).not.toHaveBeenCalled();
  });

  it("reports sync failures through useSyncStatus and useSyncError without throwing", async () => {
    await libraryReady;
    authStore.setState({ status: "signed-in", token: "pat" });
    iterate.mockImplementation(async function* () {
      yield* [];
      throw new Error("rate limited");
    });
    const { result } = await renderHook(() => ({
      status: useSyncStatus(),
      error: useSyncError(),
    }));
    expect(result.current).toEqual({ status: "idle", error: null });
    await library.refresh(true);
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("rate limited");
    iterate.mockImplementation(async function* () {
      yield { cursor: null, recordings: recs };
    });
  });

  it("refreshes when the app returns to the foreground", async () => {
    await libraryReady;
    authStore.setState({ status: "signed-in", token: "pat" });
    await library.refresh(true);
    await library.clear();
    iterate.mockClear();
    focusManager.setFocused(false);
    expect(iterate).not.toHaveBeenCalled();
    focusManager.setFocused(true);
    await waitFor(() => expect(iterate).toHaveBeenCalledTimes(1));
  });

  it("useDb hands screens the open database", async () => {
    await libraryReady;
    const { result } = await renderHook(() => useDb());
    expect(result.current).toBe(libraryStore.getState().db);
  });

  it("seeds fixtures instead of syncing when signed in with the demo token", async () => {
    await libraryReady;
    await library.clear();
    authStore.setState({ status: "signed-in", token: "demo" });
    await library.refresh(true);
    expect(iterate).not.toHaveBeenCalled();
    expect(listRecordings(libraryStore.getState().db!).length).toBeGreaterThanOrEqual(20);
    expect(queryClient.getQueryData(libraryKey("demo"))).toEqual(expect.any(String));
  });

  it("switching accounts wipes the previous account's data before syncing", async () => {
    await libraryReady;
    authStore.setState({ status: "signed-in", token: "demo" });
    await library.refresh(true);
    expect(listRecordings(libraryStore.getState().db!).length).toBeGreaterThan(2);
    authStore.setState({ status: "signed-in", token: "pat" });
    await waitFor(() => expect(iterate).toHaveBeenCalled());
    await waitFor(() => expect(queryClient.getQueryData(libraryKey("pat"))).toBeDefined());
    expect(listRecordings(libraryStore.getState().db!)).toHaveLength(2);
  });

  it("bumps version after every sync and clear so live queries re-run", async () => {
    await libraryReady;
    await library.clear();
    const start = libraryStore.getState().version;
    authStore.setState({ status: "signed-in", token: "pat" });
    await library.refresh(true);
    const afterSync = libraryStore.getState().version;
    expect(afterSync).toBeGreaterThan(start);
    await library.clear();
    expect(libraryStore.getState().version).toBe(afterSync + 1);
  });

  it("wipes the database and the cached sync on sign-out", async () => {
    await libraryReady;
    await library.clear();
    authStore.setState({ status: "signed-in", token: "pat" });
    await library.refresh(true);
    expect(listRecordings(libraryStore.getState().db!)).toHaveLength(2);
    authStore.setState({ status: "signed-out", token: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(listRecordings(libraryStore.getState().db!)).toEqual([]);
    expect(queryClient.getQueryData(libraryKey("pat"))).toBeUndefined();
  });
});

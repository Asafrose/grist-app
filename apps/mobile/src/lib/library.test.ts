import type { Recording } from "@grist/grain-api";
import page from "@grist/grain-api/fixtures/recordings.json";
import * as Network from "expo-network";
import { renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { useAuth } from "@/lib/auth";
import { listRecordings } from "@/lib/db";
import { makeClient } from "@/lib/grain";
import { library, libraryReady, useDb, useLibrary } from "@/lib/library";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("expo-video", () => ({
  createVideoPlayer: jest.fn(() => ({
    addListener: jest.fn(),
    replaceAsync: jest.fn(async () => {}),
  })),
}));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
}));
jest.mock("@/lib/db/open", () => ({
  openDb: jest.fn(async () => jest.requireActual("@/test/db").testDb()),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));

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

const appStateListener: (state: string) => void = (
  AppState.addEventListener as jest.Mock
).mock.calls.find(([event]) => event === "change")[1];

beforeEach(() => {
  jest.clearAllMocks();
  (makeClient as jest.Mock).mockImplementation(fakeClient);
});

describe("library store", () => {
  it("opens the database before anything else and starts idle", async () => {
    await libraryReady;
    const s = useLibrary.getState();
    expect(s.db).not.toBeNull();
    expect(s.sync).toBe("idle");
    expect(listRecordings(s.db!)).toEqual([]);
    expect(iterate).not.toHaveBeenCalled();
  });

  it("syncs when the user signs in and prefetches transcripts on Wi-Fi", async () => {
    await libraryReady;
    useAuth.setState({ status: "signed-in", token: "pat" });
    await new Promise((r) => setTimeout(r, 0));
    await library.refresh();
    const s = useLibrary.getState();
    expect(listRecordings(s.db!)).toHaveLength(2);
    expect(s.sync).toBe("idle");
    expect(s.lastSyncAt).not.toBeNull();
    expect(transcript).toHaveBeenCalledTimes(2);
  });

  it("debounces foreground refreshes but honours force", async () => {
    await libraryReady;
    useAuth.setState({ status: "signed-in", token: "pat" });
    await library.refresh(true);
    iterate.mockClear();
    await library.refresh();
    expect(iterate).not.toHaveBeenCalled();
    await library.refresh(true);
    expect(iterate).toHaveBeenCalledTimes(1);
  });

  it("skips transcript prefetch off Wi-Fi", async () => {
    await libraryReady;
    useAuth.setState({ status: "signed-in", token: "pat" });
    (Network.getNetworkStateAsync as jest.Mock).mockResolvedValueOnce({ type: "CELLULAR" });
    transcript.mockClear();
    await library.refresh(true);
    expect(transcript).not.toHaveBeenCalled();
  });

  it("records sync failures without throwing", async () => {
    await libraryReady;
    useAuth.setState({ status: "signed-in", token: "pat" });
    iterate.mockImplementationOnce(async function* () {
      yield* [];
      throw new Error("rate limited");
    });
    await library.refresh(true);
    expect(useLibrary.getState()).toMatchObject({ sync: "error", error: "rate limited" });
  });

  it("refreshes when the app returns to the foreground", async () => {
    await libraryReady;
    useAuth.setState({ status: "signed-in", token: "pat" });
    await library.refresh(true);
    await library.clear();
    iterate.mockClear();
    appStateListener("background");
    expect(iterate).not.toHaveBeenCalled();
    appStateListener("active");
    await new Promise((r) => setTimeout(r, 0));
    await library.refresh();
    expect(iterate).toHaveBeenCalledTimes(1);
  });

  it("useDb hands screens the open database", async () => {
    await libraryReady;
    const { result } = await renderHook(() => useDb());
    expect(result.current).toBe(useLibrary.getState().db);
  });

  it("seeds fixtures instead of syncing when signed in with the demo token", async () => {
    await libraryReady;
    await library.clear();
    useAuth.setState({ status: "signed-in", token: "demo" });
    await library.refresh(true);
    expect(iterate).not.toHaveBeenCalled();
    expect(listRecordings(useLibrary.getState().db!).length).toBeGreaterThanOrEqual(20);
    expect(useLibrary.getState().sync).toBe("idle");
  });

  it("switching accounts wipes the previous account's data before syncing", async () => {
    await libraryReady;
    useAuth.setState({ status: "signed-in", token: "demo" });
    await library.refresh(true);
    expect(listRecordings(useLibrary.getState().db!).length).toBeGreaterThan(2);
    useAuth.setState({ status: "signed-in", token: "pat" });
    await waitFor(() => expect(iterate).toHaveBeenCalled());
    await waitFor(() => expect(useLibrary.getState().sync).toBe("idle"));
    expect(listRecordings(useLibrary.getState().db!)).toHaveLength(2);
  });

  it("a forced refresh during an in-flight sync runs again after it finishes", async () => {
    await libraryReady;
    await library.clear();
    useAuth.setState({ status: "signed-in", token: "pat" });
    const first = library.refresh(true);
    const second = library.refresh(true);
    await Promise.all([first, second]);
    expect(iterate).toHaveBeenCalledTimes(2);
  });

  it("bumps version after every sync and clear so live queries re-run", async () => {
    await libraryReady;
    await library.clear();
    const start = useLibrary.getState().version;
    useAuth.setState({ status: "signed-in", token: "pat" });
    await library.refresh(true);
    const afterSync = useLibrary.getState().version;
    expect(afterSync).toBeGreaterThan(start);
    await library.clear();
    expect(useLibrary.getState().version).toBe(afterSync + 1);
  });

  it("wipes the database on sign-out", async () => {
    await libraryReady;
    await library.clear();
    useAuth.setState({ status: "signed-in", token: "pat" });
    await library.refresh(true);
    expect(listRecordings(useLibrary.getState().db!)).toHaveLength(2);
    useAuth.setState({ status: "signed-out", token: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(listRecordings(useLibrary.getState().db!)).toEqual([]);
    expect(useLibrary.getState().lastSyncAt).toBeNull();
  });
});

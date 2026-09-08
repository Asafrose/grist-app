import { act, renderHook, waitFor } from "@testing-library/react-native";
import { authStore } from "@/lib/auth";
import { listRecordings } from "@/lib/db";
import { downloadsStore, IDLE_DOWNLOAD } from "@/lib/downloads";
import { libraryKey, libraryReady } from "@/lib/library";
import { queryClient } from "@/lib/query";
import { currentDb } from "./live";
import { useDownloadedIds, useDownloadedRecordings } from "./index";

jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "CELLULAR" })),
}));
jest.mock("expo-sqlite", () => ({
  addDatabaseChangeListener: () => ({ remove() {} }),
  defaultDatabaseDirectory: "/tmp",
}));
jest.mock("expo-file-system", () => require("@/test/mocks/expo-file-system"));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));

const done = (uri: string) => ({ ...IDLE_DOWNLOAD, status: "done" as const, progress: 1, uri });

beforeAll(async () => {
  await libraryReady;
  authStore.setState({ status: "signed-in", token: "demo" });
  await waitFor(() => expect(queryClient.getQueryData(libraryKey("demo"))).toBeDefined());
});

afterEach(() => {
  downloadsStore.setState({ byId: {} });
});

describe("useDownloadedIds", () => {
  it("keeps only the ids whose entry is done", async () => {
    const [a, b, c] = listRecordings(currentDb());
    downloadsStore.setState({
      byId: {
        [c.id]: done("file:///c.mp4"),
        [a.id]: done("file:///a.mp4"),
        [b.id]: { ...IDLE_DOWNLOAD, status: "downloading", progress: 0.5 },
      },
    });
    const { result } = await renderHook(() => useDownloadedIds());
    expect(result.current).toEqual([a.id, c.id].toSorted());
  });
});

describe("useDownloadedRecordings", () => {
  it("is empty when nothing is downloaded", async () => {
    const { result } = await renderHook(() => useDownloadedRecordings());
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("joins the done entries against recording rows, newest first", async () => {
    const rows = listRecordings(currentDb());
    const [newer, older] = [rows[0], rows[3]];
    downloadsStore.setState({
      byId: { [older.id]: done("file:///older.mp4"), [newer.id]: done("file:///newer.mp4") },
    });
    const { result } = await renderHook(() => useDownloadedRecordings());
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((r) => r.id)).toEqual([newer.id, older.id]);
    expect(result.current[0].title).toBe(newer.title);
  });

  it("drops a recording as soon as its download is removed", async () => {
    const row = listRecordings(currentDb())[0];
    downloadsStore.setState({ byId: { [row.id]: done("file:///one.mp4") } });
    const { result } = await renderHook(() => useDownloadedRecordings());
    await waitFor(() => expect(result.current).toHaveLength(1));
    await act(async () => downloadsStore.setState({ byId: {} }));
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("ignores a done entry with no matching recording row", async () => {
    downloadsStore.setState({ byId: { "no-such-id": done("file:///ghost.mp4") } });
    const { result } = await renderHook(() => useDownloadedRecordings());
    await waitFor(() => expect(result.current).toEqual([]));
  });
});

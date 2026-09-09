import { act, renderHook, waitFor } from "@testing-library/react-native";
import { authStore } from "@/lib/auth";
import * as dbModule from "@/lib/db";
import { downloadsStore, IDLE_DOWNLOAD } from "@/lib/downloads";
import { libraryKey, libraryReady, libraryStore } from "@/lib/library";
import { queryClient } from "@/lib/query";
import { currentDb, positionsStore } from "./live";
import {
  playbackPositions,
  useClips,
  useDownloadedRecordings,
  useRecordings,
  useTranscript,
} from "./index";

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
jest.mock("@/lib/db", () => {
  const actual = jest.requireActual("@/lib/db");
  return {
    ...actual,
    recordingsQuery: jest.fn(actual.recordingsQuery),
    transcriptQuery: jest.fn(actual.transcriptQuery),
    highlightsQuery: jest.fn(actual.highlightsQuery),
  };
});

const builders = dbModule as unknown as {
  recordingsQuery: jest.Mock;
  transcriptQuery: jest.Mock;
  highlightsQuery: jest.Mock;
};

const done = (uri: string) => ({ ...IDLE_DOWNLOAD, status: "done" as const, progress: 1, uri });

beforeAll(async () => {
  await libraryReady;
  authStore.setState({ status: "signed-in", token: "demo" });
  await waitFor(() => expect(queryClient.getQueryData(libraryKey("demo"))).toBeDefined());
});

afterEach(() => {
  downloadsStore.setState({ byId: {} });
});

describe("a playback position save", () => {
  it("re-runs the recordings and downloads queries and nothing else", async () => {
    const [row] = dbModule.listRecordings(currentDb());
    downloadsStore.setState({ byId: { [row.id]: done("file:///one.mp4") } });

    const rows = await renderHook(() => useRecordings({}));
    const downloaded = await renderHook(() => useDownloadedRecordings());
    const transcript = await renderHook(() => useTranscript(row.id));
    const clips = await renderHook(() => useClips({ limit: 5 }));
    await waitFor(() => expect(rows.result.current.data.length).toBeGreaterThan(0));
    await waitFor(() => expect(downloaded.result.current).toHaveLength(1));
    await waitFor(() => expect(transcript.result.current).toBeDefined());
    await waitFor(() => expect(clips.result.current).toBeDefined());

    const libraryVersion = libraryStore.getState().version;
    builders.recordingsQuery.mockClear();
    builders.transcriptQuery.mockClear();
    builders.highlightsQuery.mockClear();

    await act(async () => playbackPositions.save(row.id, 90));

    expect(builders.recordingsQuery).toHaveBeenCalledTimes(2);
    expect(builders.transcriptQuery).not.toHaveBeenCalled();
    expect(builders.highlightsQuery).not.toHaveBeenCalled();
    expect(libraryStore.getState().version).toBe(libraryVersion);

    playbackPositions.clear(row.id);
  });

  it("shows the new row label within one save interval", async () => {
    const [row] = dbModule.listRecordings(currentDb());
    const rows = await renderHook(() => useRecordings({}));
    await waitFor(() => expect(rows.result.current.data.length).toBeGreaterThan(0));
    const positionOf = () =>
      rows.result.current.data.find((r) => r.id === row.id)?.positionSeconds ?? null;
    expect(positionOf()).toBeNull();

    await act(async () => playbackPositions.save(row.id, 42));
    await waitFor(() => expect(positionOf()).toBe(42));

    await act(async () => playbackPositions.save(row.id, 47));
    await waitFor(() => expect(positionOf()).toBe(47));

    playbackPositions.clear(row.id);
  });
});

describe("sign-out", () => {
  it("leaves no positions version behind", async () => {
    const [row] = dbModule.listRecordings(currentDb());
    playbackPositions.save(row.id, 30);
    expect(positionsStore.getState().version).toBeGreaterThan(0);

    await act(async () => {
      authStore.setState({ status: "signed-out", token: null, rejected: null });
    });
    expect(positionsStore.getState().version).toBe(0);

    authStore.setState({ status: "signed-in", token: "demo", rejected: null });
    await waitFor(() => expect(queryClient.getQueryData(libraryKey("demo"))).toBeDefined());
  });
});

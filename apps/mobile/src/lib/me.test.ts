import type { Recording } from "@grist/grain-api";
import page from "@grist/grain-api/fixtures/recordings.json";
import users from "@grist/grain-api/fixtures/users.json";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useAuth } from "@/lib/auth";
import { getMeta, setMeta } from "@/lib/db";
import { demoRecordings } from "@/lib/demo";
import { makeClient } from "@/lib/grain";
import { library, libraryReady, useLibrary } from "@/lib/library";
import { demoMeId, lookupMe, META_ME, type MeApi, resolveMe, useMe } from "@/lib/me";
import { testDb } from "@/test/db";

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
  getNetworkStateAsync: jest.fn(async () => ({ type: "CELLULAR" })),
}));
jest.mock("@/lib/db/open", () => ({
  openDb: jest.fn(async () => jest.requireActual("@/test/db").testDb()),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("drizzle-orm/expo-sqlite", () => ({
  useLiveQuery: (query: { all: () => unknown[] }, deps: unknown[]) => ({
    data: jest.requireActual("react").useMemo(() => query.all(), deps),
  }),
}));

const recs = page.recordings as Recording[];
const hostedBy = (id: string) => recs.filter((r) => r.recorders.some((rec) => rec.id === id));
const marcus = recs[0].recorders[0].id;

function fakeApi(hosted: Recording[], userList = users.users): MeApi {
  return {
    recordings: { list: jest.fn(async () => ({ cursor: null, recordings: hosted })) },
    users: { list: jest.fn(async () => ({ users: userList })) },
  } as unknown as MeApi;
}

beforeEach(() => {
  jest.clearAllMocks();
  (makeClient as jest.Mock).mockImplementation(() => fakeApi(hostedBy(marcus)));
});

describe("lookupMe", () => {
  it("picks the most frequent recorder of the recordings the user hosted", async () => {
    const api = fakeApi(recs);
    expect(await lookupMe(api)).toBe(marcus);
    expect(api.recordings.list).toHaveBeenCalledWith({ filter: { attendance: "hosted" } });
    expect(api.users.list).not.toHaveBeenCalled();
  });

  it("falls back to the only workspace user when nothing was hosted", async () => {
    expect(await lookupMe(fakeApi([], users.users.slice(0, 1)))).toBe(users.users[0].id);
    expect(await lookupMe(fakeApi([]))).toBeNull();
  });
});

describe("resolveMe", () => {
  it("uses the first seeded recorder for the demo account and caches it", async () => {
    const db = testDb();
    const id = await resolveMe(db, "demo");
    expect(id).toBe(demoRecordings()[0].recorders[0].id);
    expect(id).toBe(demoMeId());
    expect(getMeta(db, META_ME)).toBe(id);
    expect(makeClient).not.toHaveBeenCalled();
  });

  it("returns the cached id without touching the API", async () => {
    const db = testDb();
    setMeta(db, META_ME, "cached");
    const api = fakeApi(recs);
    expect(await resolveMe(db, "pat", api)).toBe("cached");
    expect(api.recordings.list).not.toHaveBeenCalled();
  });

  it("looks the id up for a real token and does not cache a miss", async () => {
    const db = testDb();
    expect(await resolveMe(db, "pat", fakeApi([]))).toBeNull();
    expect(getMeta(db, META_ME)).toBeNull();
    expect(await resolveMe(db, "pat")).toBe(marcus);
    expect(makeClient).toHaveBeenCalledWith("pat");
    expect(getMeta(db, META_ME)).toBe(marcus);
  });
});

describe("useMe", () => {
  it("resolves once the library is open and follows the signed-in token", async () => {
    await libraryReady;
    useAuth.setState({ status: "signed-out", token: null });
    const { result } = await renderHook(() => useMe());
    await waitFor(() => expect(result.current).toEqual({ id: null, status: "ready" }));

    await act(async () => useAuth.setState({ status: "signed-in", token: "pat" }));
    await waitFor(() => expect(result.current).toEqual({ id: marcus, status: "ready" }));
    expect(getMeta(useLibrary.getState().db!, META_ME)).toBe(marcus);
  });

  it("reads a cached id straight from the database and drops it when the library is cleared", async () => {
    await libraryReady;
    await library.clear();
    setMeta(useLibrary.getState().db!, META_ME, "cached-me");
    useAuth.setState({ status: "signed-in", token: "pat" });
    const { result } = await renderHook(() => useMe());
    expect(result.current).toEqual({ id: "cached-me", status: "ready" });
    expect(makeClient).not.toHaveBeenCalled();

    await act(() => library.clear());
    await waitFor(() => expect(result.current).toEqual({ id: marcus, status: "ready" }));
  });

  it("reports an error when the lookup fails", async () => {
    await libraryReady;
    await library.clear();
    (makeClient as jest.Mock).mockImplementation(() => ({
      recordings: { list: jest.fn(async () => Promise.reject(new Error("offline"))) },
      users: { list: jest.fn() },
    }));
    useAuth.setState({ status: "signed-in", token: "pat2" });
    const { result } = await renderHook(() => useMe());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.id).toBeNull();
  });
});

import type { Recording, RecordingsPage } from "@grist/grain-api";
import page from "@grist/grain-api/fixtures/recordings.json";
import users from "@grist/grain-api/fixtures/users.json";
import { waitFor } from "@testing-library/react-native";
import { authStore } from "@/lib/auth";
import { getMeta } from "@/lib/db";
import { libraryReady } from "@/lib/library";
import {
  cachedMe,
  chooseMe,
  DEMO_ME,
  detectMe,
  lookupMe,
  type MeApi,
  META_ME,
  resetMe,
  resolveMe,
  meStore,
} from "@/lib/me";
import { testDb } from "@/test/db";

jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
}));

const recs = page.recordings as Recording[];

function attendedBy(email: string, count = 3): Recording[] {
  return recs.slice(0, count).map((r, i) => ({
    ...r,
    id: `att-${i}`,
    participants: [
      ...(r.participants ?? []).slice(0, 2),
      { id: `me-${i}`, name: "Asaf R", email, scope: "internal", confirmed_attendee: true },
    ],
  }));
}

function fakeApi(attended: Recording[], workspaceUsers = users.users) {
  const iterate = jest.fn(async function* () {
    const half = Math.ceil(attended.length / 2);
    yield { cursor: "c", recordings: attended.slice(0, half) } as RecordingsPage;
    yield { cursor: null, recordings: attended.slice(half) } as RecordingsPage;
  });
  const list = jest.fn(async () => ({ users: workspaceUsers }));
  return {
    api: { recordings: { iterate }, users: { list } } as unknown as MeApi,
    iterate,
    list,
  };
}

beforeEach(() => {
  resetMe();
  authStore.setState({ status: "signed-in", token: "pat" });
});

describe("detectMe", () => {
  it("returns the one address present in every attended meeting", () => {
    expect(
      detectMe([
        ["a@x.io", "Me@X.io", "c@x.io"],
        ["me@x.io", "d@y.io"],
        ["", "me@x.io ", "a@x.io"],
      ]),
    ).toBe("me@x.io");
  });

  it("gives up when nobody or more than one person is in every meeting", () => {
    expect(detectMe([])).toBeNull();
    expect(detectMe([["a@x.io"], ["b@x.io"]])).toBeNull();
    expect(
      detectMe([
        ["a@x.io", "b@x.io"],
        ["a@x.io", "b@x.io"],
      ]),
    ).toBeNull();
    expect(detectMe([[], []])).toBeNull();
  });
});

describe("lookupMe", () => {
  it("intersects attended participants and enriches from the users list", async () => {
    const target = users.users[0];
    const { api, iterate, list } = fakeApi(attendedBy(target.email));
    const me = await lookupMe(api);
    expect(me).toEqual({
      email: target.email,
      name: target.name,
      userId: target.id,
      source: "detected",
    });
    expect(iterate).toHaveBeenCalledWith({
      filter: { attendance: "attended" },
      include: { participants: true },
    });
    expect(list).toHaveBeenCalled();
  });

  it("falls back to the participant name when the user list does not know the address", async () => {
    const { api } = fakeApi(attendedBy("someone@else.example"), []);
    expect(await lookupMe(api)).toEqual({
      email: "someone@else.example",
      name: "Asaf R",
      userId: null,
      source: "detected",
    });
  });

  it("returns null when no single attendee is common", async () => {
    const { api } = fakeApi(recs.slice(0, 3));
    expect(await lookupMe(api)).toBeNull();
  });
});

describe("resolveMe", () => {
  it("caches the detected identity in meta and in the store", async () => {
    const db = testDb();
    const target = users.users[1];
    const { api, iterate } = fakeApi(attendedBy(target.email));
    const me = await resolveMe(db, "pat", api);
    expect(me?.email).toBe(target.email);
    expect(cachedMe(db)).toEqual(me);
    expect(meStore.getState()).toEqual({ me, status: "ready" });

    resetMe();
    expect(await resolveMe(db, "pat", api)).toEqual(me);
    expect(iterate).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent lookups for the same token", async () => {
    const db = testDb();
    const { api, iterate } = fakeApi(attendedBy(users.users[0].email));
    const [first, second] = await Promise.all([
      resolveMe(db, "pat-dedupe", api),
      resolveMe(db, "pat-dedupe", api),
    ]);
    expect(first).toEqual(second);
    expect(first?.email).toBe(users.users[0].email);
    expect(iterate).toHaveBeenCalledTimes(1);
  });

  it("uses the fixture identity in demo mode without calling the API", async () => {
    const db = testDb();
    const { api, iterate } = fakeApi([]);
    expect(await resolveMe(db, "demo", api)).toEqual(DEMO_ME);
    expect(iterate).not.toHaveBeenCalled();
    expect(JSON.parse(getMeta(db, META_ME)!)).toEqual(DEMO_ME);
  });

  it("records an error state when the lookup throws and null when it finds nobody", async () => {
    const db = testDb();
    const failing = {
      recordings: {
        iterate: async function* () {
          yield* [];
          throw new Error("offline");
        },
      },
      users: { list: async () => ({ users: [] }) },
    } as unknown as MeApi;
    expect(await resolveMe(db, "pat", failing)).toBeNull();
    expect(meStore.getState().status).toBe("error");

    resetMe();
    const { api } = fakeApi(recs.slice(0, 3));
    expect(await resolveMe(db, "pat", api)).toBeNull();
    expect(meStore.getState()).toEqual({ me: null, status: "ready" });
    expect(cachedMe(db)).toBeNull();
  });

  it("ignores a corrupt cache entry", () => {
    const db = testDb();
    const { setMeta } = jest.requireActual("@/lib/db");
    setMeta(db, META_ME, "{nope");
    expect(cachedMe(db)).toBeNull();
    setMeta(db, META_ME, JSON.stringify({ email: 1 }));
    expect(cachedMe(db)).toBeNull();
  });
});

describe("chooseMe", () => {
  it("overrides the detected identity and survives a store reset", async () => {
    const db = testDb();
    const picked = chooseMe(db, users.users[2]);
    expect(picked.source).toBe("chosen");
    expect(meStore.getState().me).toEqual(picked);
    resetMe();
    const { api, iterate } = fakeApi(attendedBy("other@x.io"));
    expect(await resolveMe(db, "pat", api)).toEqual(picked);
    expect(iterate).not.toHaveBeenCalled();
  });
});

describe("library refresh", () => {
  it("resolves the identity as part of signing in", async () => {
    await libraryReady;
    authStore.setState({ status: "signed-in", token: "demo" });
    await waitFor(() => expect(meStore.getState().status).toBe("ready"));
    expect(meStore.getState().me).toEqual(DEMO_ME);
  });
});

import type { User } from "@grist/grain-api";
import fixture from "@grist/grain-api/fixtures/users.json";
import { getMeta, setMeta } from "@/lib/db";
import { seedDemo } from "@/lib/demo";
import { makeClient } from "@/lib/grain";
import {
  cachedProfile,
  initials,
  loadProfile,
  META_PROFILE,
  pickIdentity,
  PROFILE_TTL_MS,
} from "@/lib/profile";
import { testDb } from "@/test/db";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));

const users = fixture.users as User[];
const list = jest.fn();
(makeClient as jest.Mock).mockImplementation(() => ({ users: { list } }));

const NOW = Date.parse("2026-09-06T10:00:00Z");

beforeEach(() => {
  jest.clearAllMocks();
  (makeClient as jest.Mock).mockImplementation(() => ({ users: { list } }));
});

describe("pickIdentity", () => {
  const marcus = {
    id: "08b3f69b-b374-41b5-a3bc-b7fef590fc0f",
    name: "Marcus Kowalski",
    email: "marcus.kowalski@treyresearch.example",
  };
  const lucas = { id: "lucas", name: "Lucas Natarajan", email: null };

  it("prefers the most frequent recorder that is a workspace user", () => {
    const [noa, ravi] = users;
    const recorders = [marcus, marcus, marcus, { ...ravi }, { ...ravi }, { id: noa.id, name: "?" }];
    expect(pickIdentity(users, recorders)).toEqual({ name: ravi.name, email: ravi.email });
  });

  it("falls back to the most frequent recorder when none matches a user", () => {
    expect(pickIdentity(users, [lucas, marcus, marcus])).toEqual({
      name: marcus.name,
      email: marcus.email,
    });
    expect(pickIdentity(users, [lucas])).toEqual({ name: lucas.name, email: null });
  });

  it("matches by email when ids differ and uses the user's canonical name", () => {
    const [noa] = users;
    expect(pickIdentity(users, [{ id: "other", name: "N. A.", email: noa.email }])).toEqual({
      name: noa.name,
      email: noa.email,
    });
  });

  it("falls back to the first workspace user, or null with nothing to go on", () => {
    expect(pickIdentity(users, [])).toEqual({ name: users[0].name, email: users[0].email });
    expect(pickIdentity([], [])).toBeNull();
  });
});

describe("loadProfile", () => {
  it("uses the fixture user list in demo mode and caches the result in meta", async () => {
    const db = testDb();
    seedDemo(db, NOW);
    const profile = await loadProfile(db, "demo", { now: NOW });
    expect(makeClient).not.toHaveBeenCalled();
    expect(profile).toEqual({
      name: "Marcus Kowalski",
      email: "marcus.kowalski@treyresearch.example",
      userCount: users.length,
      fetchedAt: "2026-09-06T10:00:00Z",
    });
    expect(cachedProfile(db)).toEqual(profile);
  });

  it("fetches users with the token, then serves the cache until it expires", async () => {
    const db = testDb();
    list.mockResolvedValue({ users: users.slice(0, 2) });
    const first = await loadProfile(db, "pat", { now: NOW });
    expect(makeClient).toHaveBeenCalledWith("pat");
    expect(first).toMatchObject({ name: users[0].name, userCount: 2 });

    list.mockClear();
    const cached = await loadProfile(db, "pat", { now: NOW + PROFILE_TTL_MS - 1 });
    expect(list).not.toHaveBeenCalled();
    expect(cached).toEqual(first);

    await loadProfile(db, "pat", { now: NOW + PROFILE_TTL_MS });
    expect(list).toHaveBeenCalledTimes(1);

    list.mockClear();
    await loadProfile(db, "pat", { now: NOW, force: true });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("returns null and caches nothing when the workspace has no users", async () => {
    const db = testDb();
    list.mockResolvedValue({ users: [] });
    expect(await loadProfile(db, "pat", { now: NOW })).toBeNull();
    expect(getMeta(db, META_PROFILE)).toBeNull();
  });

  it("propagates API failures so the screen can fall back", async () => {
    list.mockRejectedValue(new Error("offline"));
    await expect(loadProfile(testDb(), "pat")).rejects.toThrow("offline");
  });

  it("ignores a corrupt or incomplete cache entry", () => {
    const db = testDb();
    setMeta(db, META_PROFILE, "{not json");
    expect(cachedProfile(db)).toBeNull();
    setMeta(db, META_PROFILE, JSON.stringify({ name: "x" }));
    expect(cachedProfile(db)).toBeNull();
    setMeta(db, META_PROFILE, JSON.stringify({ name: "x", fetchedAt: "2026-01-01T00:00:00Z" }));
    expect(cachedProfile(db)).toEqual({
      name: "x",
      email: null,
      userCount: 0,
      fetchedAt: "2026-01-01T00:00:00Z",
    });
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Asaf Rosentswaig")).toBe("AR");
    expect(initials("  marcus  ")).toBe("M");
    expect(initials("Ana Maria de Souza")).toBe("AM");
    expect(initials("")).toBe("");
  });
});

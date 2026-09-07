import meetingTypes from "@grist/grain-api/fixtures/meeting_types.json";
import teams from "@grist/grain-api/fixtures/teams.json";
import users from "@grist/grain-api/fixtures/users.json";
import { recorderOptions, setMeta } from "@/lib/db";
import { seedDemo } from "@/lib/demo";
import { getWorkspace, META_TEAMS, syncWorkspace, type WorkspaceApi } from "@/lib/workspace";
import { testDb } from "@/test/db";

const NOW = Date.parse("2026-09-06T10:00:00Z");

function fakeApi(): WorkspaceApi {
  return {
    users: { list: jest.fn(async () => users) },
    teams: { list: jest.fn(async () => teams) },
    meetingTypes: { list: jest.fn(async () => meetingTypes) },
  } as unknown as WorkspaceApi;
}

describe("workspace", () => {
  it("is empty with no data and no cache", () => {
    const db = testDb();
    expect(getWorkspace(db)).toEqual({ users: [], teams: [], meetingTypes: [] });
  });

  it("derives users, teams and meeting types from seeded recordings when nothing is cached", () => {
    const db = testDb();
    seedDemo(db, NOW);
    const ws = getWorkspace(db);
    expect(ws.teams.map((t) => t.name)).toContain("Lamna team");
    expect(ws.meetingTypes.map((m) => m.name)).toEqual(
      expect.arrayContaining(["Sales", "Internal"]),
    );
    expect(ws.meetingTypes.find((m) => m.name === "Internal")?.scope).toBe("internal");
    expect(ws.users.length).toBeGreaterThan(1);
    expect(ws.users[0]).toMatchObject({ id: recorderOptions(db)[0].id });
    expect(ws.users[0].email).toContain("@");
  });

  it("caches the API lists and prefers them over derived values", async () => {
    const db = testDb();
    seedDemo(db, NOW);
    const api = fakeApi();
    await syncWorkspace(db, api, "pat");
    const ws = getWorkspace(db);
    expect(ws.users).toEqual(users.users);
    expect(ws.teams).toEqual(teams.teams);
    expect(ws.meetingTypes).toEqual(meetingTypes.meeting_types);
    expect(api.users.list).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent syncs on the same token", async () => {
    const db = testDb();
    const api = fakeApi();
    await Promise.all([
      syncWorkspace(db, api, "dedupe-token"),
      syncWorkspace(db, api, "dedupe-token"),
    ]);
    expect(api.users.list).toHaveBeenCalledTimes(1);
    expect(getWorkspace(db).teams).toEqual(teams.teams);
  });

  it("ignores a corrupt cache entry", () => {
    const db = testDb();
    seedDemo(db, NOW);
    setMeta(db, META_TEAMS, "{not json");
    expect(getWorkspace(db).teams.length).toBeGreaterThan(0);
    setMeta(db, META_TEAMS, '{"a":1}');
    expect(getWorkspace(db).teams.length).toBeGreaterThan(0);
  });
});

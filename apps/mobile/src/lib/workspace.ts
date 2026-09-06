import type { GrainClient, MeetingType, Team, User } from "@grist/grain-api";
import {
  type Db,
  getMeta,
  meetingTypeOptions,
  recorderOptions,
  setMeta,
  teamOptions,
} from "@/lib/db";

export const META_USERS = "workspace_users";
export const META_TEAMS = "workspace_teams";
export const META_MEETING_TYPES = "workspace_meeting_types";
export const META_ME = "me_user_id";

export type Workspace = {
  users: User[];
  teams: Team[];
  meetingTypes: MeetingType[];
  meId: string | null;
};

export type WorkspaceApi = Pick<GrainClient, "users" | "teams" | "meetingTypes">;

export async function syncWorkspace(db: Db, api: WorkspaceApi): Promise<void> {
  const [users, teams, meetingTypes] = await Promise.all([
    api.users.list(),
    api.teams.list(),
    api.meetingTypes.list(),
  ]);
  setMeta(db, META_USERS, JSON.stringify(users.users));
  setMeta(db, META_TEAMS, JSON.stringify(teams.teams));
  setMeta(db, META_MEETING_TYPES, JSON.stringify(meetingTypes.meeting_types));
}

function cached<T>(db: Db, key: string): T[] | null {
  const raw = getMeta(db, key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export function inferMe(db: Db): string | null {
  return recorderOptions(db)[0]?.id ?? null;
}

export function setMe(db: Db, id: string): void {
  setMeta(db, META_ME, id);
}

export function getWorkspace(db: Db): Workspace {
  return {
    users:
      cached<User>(db, META_USERS) ??
      recorderOptions(db).map((r) => ({ id: r.id, name: r.name, email: r.email ?? "" })),
    teams: cached<Team>(db, META_TEAMS) ?? teamOptions(db).map(({ id, name }) => ({ id, name })),
    meetingTypes:
      cached<MeetingType>(db, META_MEETING_TYPES) ??
      meetingTypeOptions(db).map(({ id, name, scope }) => ({ id, name, scope })),
    meId: getMeta(db, META_ME) ?? inferMe(db),
  };
}

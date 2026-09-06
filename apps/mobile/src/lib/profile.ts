import type { User } from "@grist/grain-api";
import demoUsers from "@grist/grain-api/fixtures/users.json";
import { type Db, getMeta, listRecorders, setMeta } from "@/lib/db";
import { isDemoToken } from "@/lib/demo";
import { makeClient } from "@/lib/grain";
import { isoSeconds } from "@/lib/sync";

export const META_PROFILE = "profile";
export const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export type Identity = { name: string; email: string | null };
export type Profile = Identity & { userCount: number; fetchedAt: string };

type Recorder = { id: string; name: string; email?: string | null };

const sameUser = (u: User, r: Recorder) => u.id === r.id || (!!r.email && u.email === r.email);

export function pickIdentity(users: User[], recorders: Recorder[]): Identity | null {
  const tally = new Map<string, { recorder: Recorder; count: number }>();
  for (const r of recorders) {
    const entry = tally.get(r.id);
    if (entry) entry.count++;
    else tally.set(r.id, { recorder: r, count: 1 });
  }
  const mostFrequent = (accept: (r: Recorder) => boolean): Recorder | undefined => {
    let best: { recorder: Recorder; count: number } | undefined;
    for (const entry of tally.values()) {
      if (accept(entry.recorder) && (!best || entry.count > best.count)) best = entry;
    }
    return best?.recorder;
  };
  const top = mostFrequent((r) => users.some((u) => sameUser(u, r))) ?? mostFrequent(() => true);
  if (top) {
    const user = users.find((u) => sameUser(u, top));
    return { name: user?.name ?? top.name, email: user?.email ?? top.email ?? null };
  }
  const first = users[0];
  return first ? { name: first.name, email: first.email } : null;
}

export function cachedProfile(db: Db): Profile | null {
  const raw = getMeta(db, META_PROFILE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Profile>;
    if (typeof parsed.name !== "string" || typeof parsed.fetchedAt !== "string") return null;
    return {
      name: parsed.name,
      email: parsed.email ?? null,
      userCount: parsed.userCount ?? 0,
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
}

export async function loadProfile(
  db: Db,
  token: string,
  opts: { force?: boolean; now?: number } = {},
): Promise<Profile | null> {
  const now = opts.now ?? Date.now();
  const cached = cachedProfile(db);
  if (cached && !opts.force && now - Date.parse(cached.fetchedAt) < PROFILE_TTL_MS) return cached;
  const users = isDemoToken(token)
    ? (demoUsers.users as User[])
    : (await makeClient(token).users.list()).users;
  const identity = pickIdentity(users, listRecorders(db));
  if (!identity) return null;
  const profile: Profile = { ...identity, userCount: users.length, fetchedAt: isoSeconds(now) };
  setMeta(db, META_PROFILE, JSON.stringify(profile));
  return profile;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

import type { GrainClient, User } from "@grist/grain-api";
import { create } from "zustand";
import { type Db, getMeta, setMeta } from "@/lib/db";
import { DEMO_ME, isDemoToken } from "@/lib/demo";
import { makeClient } from "@/lib/grain";

export const META_ME = "me";
export const ME_LOOKUP_PAGES = 3;

export type Me = {
  email: string;
  name: string;
  userId: string | null;
  source: "detected" | "chosen";
};

export type MeApi = Pick<GrainClient, "recordings" | "users">;

export { DEMO_ME };

type MeState = { me: Me | null; status: "idle" | "loading" | "ready" | "error" };

export const meStore = create<MeState>(() => ({ me: null, status: "idle" }));

export const useMe = () => meStore((s) => s.me);
export const useMeStatus = () => meStore((s) => s.status);

export function detectMe(participantEmails: string[][]): string | null {
  const sets = participantEmails
    .map((emails) => new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)))
    .filter((s) => s.size > 0);
  if (!sets.length) return null;
  const common = [...sets[0]].filter((email) => sets.every((s) => s.has(email)));
  return common.length === 1 ? common[0] : null;
}

export async function lookupMe(api: MeApi): Promise<Me | null> {
  const emailSets: string[][] = [];
  const names = new Map<string, string>();
  let pages = 0;
  for await (const page of api.recordings.iterate({
    filter: { attendance: "attended" },
    include: { participants: true },
  })) {
    for (const r of page.recordings) {
      const ps = r.participants ?? [];
      emailSets.push(ps.map((p) => p.email ?? ""));
      for (const p of ps) if (p.email) names.set(p.email.toLowerCase(), p.name);
    }
    if (++pages >= ME_LOOKUP_PAGES) break;
  }
  const email = detectMe(emailSets);
  if (!email) return null;
  const user = await api.users
    .list()
    .then(({ users }) => users.find((u) => u.email.toLowerCase() === email))
    .catch(() => undefined);
  return {
    email,
    name: user?.name ?? names.get(email) ?? email,
    userId: user?.id ?? null,
    source: "detected",
  };
}

export function cachedMe(db: Db): Me | null {
  const raw = getMeta(db, META_ME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Me>;
    if (typeof parsed.email !== "string" || typeof parsed.name !== "string") return null;
    return {
      email: parsed.email,
      name: parsed.name,
      userId: parsed.userId ?? null,
      source: parsed.source === "chosen" ? "chosen" : "detected",
    };
  } catch {
    return null;
  }
}

function remember(db: Db, me: Me) {
  setMeta(db, META_ME, JSON.stringify(me));
  meStore.setState({ me, status: "ready" });
}

let inflight: Promise<Me | null> | null = null;

export async function resolveMe(db: Db, token: string, api?: MeApi): Promise<Me | null> {
  const cached = cachedMe(db);
  if (cached) {
    meStore.setState({ me: cached, status: "ready" });
    return cached;
  }
  if (inflight) return inflight;
  meStore.setState({ status: "loading" });
  const run = (async () => {
    try {
      const me = isDemoToken(token) ? DEMO_ME : await lookupMe(api ?? makeClient(token));
      if (me) remember(db, me);
      else meStore.setState({ me: null, status: "ready" });
      return me;
    } catch {
      meStore.setState({ me: null, status: "error" });
      return null;
    }
  })();
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

export function chooseMe(db: Db, user: Pick<User, "id" | "name" | "email">): Me {
  const me: Me = { email: user.email, name: user.name, userId: user.id, source: "chosen" };
  remember(db, me);
  return me;
}

export function resetMe(): void {
  meStore.setState({ me: null, status: "idle" });
}

export const me = { resolve: resolveMe, choose: chooseMe, reset: resetMe, cached: cachedMe };

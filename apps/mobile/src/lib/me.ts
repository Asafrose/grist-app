import type { GrainClient } from "@grist/grain-api";
import { eq } from "drizzle-orm";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { type Db, getMeta, meta, setMeta } from "@/lib/db";
import { demoRecordings, isDemoToken } from "@/lib/demo";
import { makeClient } from "@/lib/grain";
import { useDb, useLibrary } from "@/lib/library";

export const META_ME = "me_user_id";

export type MeApi = Pick<GrainClient, "recordings" | "users">;

export function demoMeId(): string | null {
  return demoRecordings()[0]?.recorders[0]?.id ?? null;
}

export async function lookupMe(api: MeApi): Promise<string | null> {
  const hosted = await api.recordings.list({ filter: { attendance: "hosted" } });
  const counts = new Map<string, number>();
  for (const r of hosted.recordings) {
    for (const rec of r.recorders) counts.set(rec.id, (counts.get(rec.id) ?? 0) + 1);
  }
  const top = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0];
  if (top) return top[0];
  const { users } = await api.users.list();
  return users.length === 1 ? users[0].id : null;
}

export async function resolveMe(db: Db, token: string, api?: MeApi): Promise<string | null> {
  const cached = getMeta(db, META_ME);
  if (cached) return cached;
  const id = isDemoToken(token) ? demoMeId() : await lookupMe(api ?? makeClient(token));
  if (id) setMeta(db, META_ME, id);
  return id;
}

export type Me = { id: string | null; status: "loading" | "ready" | "error" };

type Lookup = { token: string; id: string | null; error: boolean };

export function useMe(): Me {
  const db = useDb();
  const token = useAuth((s) => s.token);
  const version = useLibrary((s) => s.version);
  const { data } = useLiveQuery(
    db.select({ value: meta.value }).from(meta).where(eq(meta.key, META_ME)),
    [version],
  );
  const cached = data[0]?.value ?? null;
  const [lookup, setLookup] = useState<Lookup | null>(null);

  useEffect(() => {
    if (!token || cached) return;
    let cancelled = false;
    resolveMe(db, token).then(
      (id) => {
        if (!cancelled) setLookup({ token, id, error: false });
      },
      () => {
        if (!cancelled) setLookup({ token, id: null, error: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, token, cached]);

  if (!token) return { id: null, status: "ready" };
  if (cached) return { id: cached, status: "ready" };
  if (lookup?.token === token) return { id: lookup.id, status: lookup.error ? "error" : "ready" };
  return { id: null, status: "loading" };
}

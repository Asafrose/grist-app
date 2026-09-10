import { onlineManager } from "@tanstack/react-query";
import { auth } from "@/lib/auth";
import { type Db, listRecordings } from "@/lib/db";
import { prewarmMediaUrl } from "@/lib/media-url";

export const PREWARM_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PREWARM_PER_PASS = 10;
export const PREWARM_MAX_BACKOFF = 8;

let running: Promise<void> | null = null;
let generation = 0;
let passes = 0;
const resolved = new Set<string>();
const backoff = new Map<string, { failures: number; retryAtPass: number }>();

export function prewarmWindowStart(now = Date.now()): string {
  return new Date(now - PREWARM_WINDOW_MS).toISOString();
}

function due(id: string): boolean {
  if (resolved.has(id)) return false;
  const waiting = backoff.get(id);
  return !waiting || passes >= waiting.retryAtPass;
}

function wanted(db: Db): string[] {
  return listRecordings(db, { after: prewarmWindowStart() })
    .map((r) => r.id)
    .filter(due)
    .slice(0, PREWARM_PER_PASS);
}

function penalise(id: string): void {
  const failures = (backoff.get(id)?.failures ?? 0) + 1;
  backoff.set(id, {
    failures,
    retryAtPass: passes + Math.min(2 ** failures, PREWARM_MAX_BACKOFF),
  });
}

async function run(db: Db, gen: number): Promise<void> {
  passes += 1;
  if (!onlineManager.isOnline()) return;
  const token = auth.token();
  if (!token) return;
  for (const id of wanted(db)) {
    if (gen !== generation || auth.token() !== token) return;
    try {
      await prewarmMediaUrl(id, token);
      resolved.add(id);
      backoff.delete(id);
    } catch {
      penalise(id);
    }
  }
}

export function runPrewarm(db: Db): Promise<void> {
  if (running) return running;
  running = run(db, generation)
    .catch((e: unknown) => {
      if (__DEV__) console.warn("media url pre-resolve failed", e);
    })
    .finally(() => {
      running = null;
    });
  return running;
}

export function cancelPrewarm(): void {
  generation += 1;
  resolved.clear();
  backoff.clear();
}

export const prewarmDone = (): Promise<void> => running ?? Promise.resolve();

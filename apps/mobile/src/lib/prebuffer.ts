import * as Network from "expo-network";
import { createVideoPlayer, type VideoPlayer } from "expo-video";
import { downloads } from "@/lib/downloads";
import { settings } from "@/lib/settings";
import { cachedSource, isCacheableUri } from "@/lib/video-cache";

export const PREBUFFER_TARGET_SECONDS = 60;
export const PREBUFFER_PER_PASS = 3;
export const PREBUFFER_POLL_MS = 500;
export const PREBUFFER_TIMEOUT_MS = 20_000;
export const PREBUFFER_END_EPSILON_SECONDS = 0.5;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PrebufferTarget = { id: string; uri: string };
type Outcome = "full" | "timeout" | "error" | "cancelled";

let generation = 0;
let pass: Promise<void> | null = null;
const buffered = new Set<string>();

export function prebufferWindowMs(): number {
  return settings.get().prebufferDays * DAY_MS;
}

export function prebufferWindowStart(now = Date.now()): string | null {
  const window = prebufferWindowMs();
  return window === 0 ? null : new Date(now - window).toISOString();
}

export function wasPrebuffered(uri: string): boolean {
  return buffered.has(uri);
}

export function cancelPrebuffer(): void {
  generation += 1;
  buffered.clear();
}

export const prebufferIdle = (): Promise<void> => pass ?? Promise.resolve();

async function onWifi(): Promise<boolean> {
  try {
    const net = await Network.getNetworkStateAsync();
    return net.type === Network.NetworkStateType.WIFI;
  } catch {
    return false;
  }
}

// `bufferedPosition` is capped by the item duration, so a recording shorter than the target is
// fully buffered well below it.
function bufferTarget(duration: number): number {
  if (duration <= 0) return PREBUFFER_TARGET_SECONDS;
  return Math.min(PREBUFFER_TARGET_SECONDS, duration - PREBUFFER_END_EPSILON_SECONDS);
}

function fill(player: VideoPlayer, gen: number, failed: () => boolean): Promise<Outcome> {
  return new Promise((resolve) => {
    let polls = Math.ceil(PREBUFFER_TIMEOUT_MS / PREBUFFER_POLL_MS);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = (outcome: Outcome) => {
      if (timer) clearTimeout(timer);
      timer = null;
      resolve(outcome);
    };
    const tick = () => {
      timer = null;
      if (gen !== generation) return stop("cancelled");
      if (failed()) return stop("error");
      if (player.bufferedPosition >= bufferTarget(player.duration)) return stop("full");
      if (--polls <= 0) return stop("timeout");
      timer = setTimeout(tick, PREBUFFER_POLL_MS);
    };
    timer = setTimeout(tick, PREBUFFER_POLL_MS);
  });
}

async function warm(target: PrebufferTarget, gen: number): Promise<void> {
  const player = createVideoPlayer(null);
  let failed = false;
  const subscription = player.addListener("statusChange", ({ status }) => {
    if (status === "error") failed = true;
  });
  try {
    player.muted = true;
    player.bufferOptions = { preferredForwardBufferDuration: PREBUFFER_TARGET_SECONDS };
    await player.replaceAsync(cachedSource(target.uri));
    if (gen !== generation) return;
    if ((await fill(player, gen, () => failed)) === "full") buffered.add(target.uri);
  } finally {
    subscription.remove();
    player.release();
  }
}

async function run(targets: readonly PrebufferTarget[], shouldStop: () => boolean): Promise<void> {
  if (settings.get().prebufferDays === 0) return;
  const gen = generation;
  const pending = targets
    .filter((t) => isCacheableUri(t.uri) && !buffered.has(t.uri) && !downloads.localUri(t.id))
    .slice(0, PREBUFFER_PER_PASS);
  if (pending.length === 0) return;
  if (!(await onWifi())) return;
  for (const target of pending) {
    if (gen !== generation || shouldStop()) return;
    try {
      await warm(target, gen);
    } catch (e: unknown) {
      if (__DEV__) console.warn("pre-buffer failed", e);
    }
  }
}

export function runPrebuffer(
  targets: readonly PrebufferTarget[],
  shouldStop: () => boolean = () => false,
): Promise<void> {
  pass = run(targets, shouldStop).finally(() => {
    pass = null;
  });
  return pass;
}

export type PerfSample = { label: string; ms: number; at: number };

export const PERF_RECENT_LIMIT = 20;
export const PERF_MARK_TTL_MS = 10_000;

const marks = new Map<string, number>();
const samples: PerfSample[] = [];

function mark(name: string) {
  if (!__DEV__) return;
  marks.set(name, performance.now());
}

function measure(name: string, label: string): PerfSample | null {
  if (!__DEV__) return null;
  const startedAt = marks.get(name);
  if (startedAt === undefined) return null;
  marks.delete(name);
  const ms = Math.round(performance.now() - startedAt);
  if (ms > PERF_MARK_TTL_MS) return null;
  const sample: PerfSample = { label, ms, at: Date.now() };
  samples.push(sample);
  if (samples.length > PERF_RECENT_LIMIT) samples.shift();
  console.log(`[perf] ${label}: ${ms}ms`);
  return sample;
}

function recent(): PerfSample[] {
  return [...samples];
}

function clearMarks() {
  marks.clear();
}

function clear() {
  marks.clear();
  samples.length = 0;
}

export const perf = { mark, measure, recent, clearMarks, clear };

if (__DEV__) (globalThis as { gristPerf?: typeof perf }).gristPerf = perf;

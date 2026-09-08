export type Timed = { start: number; end: number };

export function segmentAt<T extends Timed>(segments: readonly T[], ms: number): T | null {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found < 0 ? null : segments[found];
}

const MIN_ADVANCE_MS = 500;

export function nextSpeakerStart<T extends Timed & { speaker: string }>(
  segments: readonly T[],
  positionMs: number,
  leadMs = 1000,
): number | null {
  let speaker = segmentAt(segments, positionMs)?.speaker ?? null;
  for (const s of segments) {
    if (s.start <= positionMs || s.speaker === speaker) continue;
    const target = Math.max(0, Math.min(s.start, Math.max(positionMs + 1, s.start - leadMs)));
    if (target - positionMs >= MIN_ADVANCE_MS) return target;
    speaker = s.speaker;
  }
  return null;
}

export function speakers(segments: readonly { speaker: string }[]): string[] {
  const seen: string[] = [];
  for (const s of segments) if (!seen.includes(s.speaker)) seen.push(s.speaker);
  return seen;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

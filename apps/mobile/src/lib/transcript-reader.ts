import { speakers, type Timed } from "@/lib/transcript";

export type Run = { text: string; match: boolean; at: number };

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchingSegments(segments: readonly { text: string }[], query: string): number[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const out: number[] = [];
  segments.forEach((s, i) => {
    if (s.text.toLowerCase().includes(q)) out.push(i);
  });
  return out;
}

export function highlightRuns(text: string, query: string): Run[] {
  const q = normalizeQuery(query);
  if (!q) return [{ text, match: false, at: 0 }];
  const lower = text.toLowerCase();
  const runs: Run[] = [];
  let from = 0;
  for (let at = lower.indexOf(q, from); at >= 0; at = lower.indexOf(q, from)) {
    if (at > from) runs.push({ text: text.slice(from, at), match: false, at: from });
    runs.push({ text: text.slice(at, at + q.length), match: true, at });
    from = at + q.length;
  }
  if (from < text.length || !runs.length)
    runs.push({ text: text.slice(from), match: false, at: from });
  return runs;
}

export function stepMatch(position: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return -1;
  return (((position + direction) % total) + total) % total;
}

export function indexAt(segments: readonly Timed[], ms: number): number {
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
  return found;
}

export function speakerColors(
  segments: readonly { speaker: string }[],
  palette: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  speakers(segments).forEach((name, i) => map.set(name, palette[i % palette.length]));
  return map;
}

export type SnippetRun = { text: string; match: boolean };

export const SNIPPET_MAX_CHARS = 140;

export function queryTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.replaceAll(/["*[\]]/g, "").trim())
    .filter(Boolean);
}

export function snippetRuns(snippet: string): SnippetRun[] {
  const runs: SnippetRun[] = [];
  let last = 0;
  for (const m of snippet.matchAll(/\[([^[\]]*)\]/g)) {
    if (m.index > last) runs.push({ text: snippet.slice(last, m.index), match: false });
    runs.push({ text: m[1], match: true });
    last = m.index + m[0].length;
  }
  if (last < snippet.length) runs.push({ text: snippet.slice(last), match: false });
  return runs;
}

export function serializeRuns(runs: SnippetRun[]): string {
  return runs.map((r) => (r.match ? `[${r.text}]` : r.text)).join("");
}

const escapeRegExp = (s: string) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function matchRuns(text: string, query: string, max = SNIPPET_MAX_CHARS): SnippetRun[] {
  const terms = queryTerms(query);
  if (!terms.length) return clipRuns([{ text, match: false }], 0, max);
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${terms.map(escapeRegExp).join("|")})[\\p{L}\\p{N}]*`,
    "giu",
  );

  const runs: SnippetRun[] = [];
  let last = 0;
  let firstMatch = -1;
  for (const m of text.matchAll(re)) {
    if (firstMatch < 0) firstMatch = m.index;
    if (m.index > last) runs.push({ text: text.slice(last, m.index), match: false });
    runs.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), match: false });
  if (firstMatch < 0) return clipRuns(runs, 0, max);

  return clipRuns(runs, Math.max(0, firstMatch - Math.floor(max / 3)), max);
}

function clipRuns(runs: SnippetRun[], start: number, max: number): SnippetRun[] {
  const full = runs.map((r) => r.text).join("");
  let from = start;
  if (from > 0) {
    const space = full.lastIndexOf(" ", from);
    from = space > 0 ? space + 1 : from;
  }
  let to = Math.min(full.length, from + max);
  if (to < full.length) {
    const space = full.lastIndexOf(" ", to);
    to = space > from ? space : to;
  }

  const out: SnippetRun[] = [];
  let pos = 0;
  for (const r of runs) {
    const a = Math.max(pos, from);
    const b = Math.min(pos + r.text.length, to);
    if (b > a) out.push({ text: r.text.slice(a - pos, b - pos), match: r.match });
    pos += r.text.length;
  }
  if (from > 0) out.unshift({ text: "…", match: false });
  if (to < full.length) out.push({ text: "…", match: false });
  return out;
}

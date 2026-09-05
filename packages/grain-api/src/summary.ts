export type SummarySection = { title: string; markdown: string };

export function splitSummarySections(markdown: string): SummarySection[] {
  const sections: SummarySection[] = [];
  let current: SummarySection | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[1], markdown: "" };
      continue;
    }
    if (!current) current = { title: "Summary", markdown: "" };
    current.markdown += (current.markdown ? "\n" : "") + line;
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ ...s, markdown: s.markdown.trim() }));
}

const TIMESTAMP = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;

export function timestampsToMs(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(TIMESTAMP)) {
    const [, a, b, c] = m;
    out.push(c ? (+a * 3600 + +b * 60 + +c) * 1000 : (+a * 60 + +b) * 1000);
  }
  return out;
}

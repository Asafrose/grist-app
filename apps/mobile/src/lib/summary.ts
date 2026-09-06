import { timestampsToMs } from "@grist/grain-api";

export type Timestamp = { label: string; ms: number };
export type TextPart = string | Timestamp;

const TIMESTAMP = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

export function splitTimestamps(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(TIMESTAMP)) {
    const index = m.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push({ label: m[0], ms: timestampsToMs(m[0])[0] });
    last = index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

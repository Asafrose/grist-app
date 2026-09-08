import type { Recording } from "@grist/grain-api";
import { companyFromEmail } from "@/lib/company";
import type { ParticipantRow, TranscriptSegmentRow } from "@/lib/db";

export type Range = { start: number; end: number };

export type TalkRow = {
  key: string;
  label: string;
  participantIds: string[];
  external: boolean;
  colorIndex: number;
  ms: number;
  pct: number;
  ranges: Range[];
};

export type TalkTime = { rows: TalkRow[]; totalMs: number; durationMs: number };

export function roundToHundred(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 100);
  const floored = exact.map(Math.floor);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - floored[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    if (values[i] > 0) {
      floored[i] += 1;
      remainder -= 1;
    }
  }
  return floored;
}

export function normalizeRanges(ranges: Range[], durationMs: number): Range[] {
  const cap = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
  return ranges
    .map((r) => {
      const [a, b] = r.start <= r.end ? [r.start, r.end] : [r.end, r.start];
      return { start: Math.max(0, Math.min(a, cap)), end: Math.max(0, Math.min(b, cap)) };
    })
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
}

export function mergeRanges(ranges: Range[], gapMs = 0): Range[] {
  const out: Range[] = [];
  for (const r of ranges) {
    const last = out.at(-1);
    if (last && r.start - last.end <= gapMs) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

export const rangesMs = (ranges: Range[]) => ranges.reduce((a, r) => a + (r.end - r.start), 0);

export function screenshareRanges(
  screenshares: Recording["screenshares"] | null | undefined,
  durationMs: number,
): Range[] {
  return mergeRanges(normalizeRanges(screenshares ?? [], durationMs));
}

export function timelineDuration(
  durationMs: number,
  segments: TranscriptSegmentRow[],
  screenshares: Recording["screenshares"] | null | undefined,
): number {
  let max = Math.max(0, durationMs);
  for (const s of segments) if (s.end > max) max = s.end;
  for (const s of screenshares ?? []) {
    const end = Math.max(s.start, s.end);
    if (end > max) max = end;
  }
  return max;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function groupKey(p: ParticipantRow | undefined, segment: TranscriptSegmentRow) {
  if (!p) return { key: `speaker:${segment.speaker}`, company: null };
  const company = p.scope === "external" ? companyFromEmail(p.email) : null;
  return { key: company ? `company:${company}` : `participant:${p.id}`, company };
}

export function talkTime(
  segments: TranscriptSegmentRow[],
  participants: ParticipantRow[],
  durationMs: number,
): TalkTime {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const byName = new Map(participants.map((p) => [p.name.toLowerCase(), p]));
  const rows = new Map<string, TalkRow & { members: Set<string> }>();
  const duration = timelineDuration(durationMs, segments, null);

  for (const s of segments) {
    const p =
      (s.participantId ? byId.get(s.participantId) : undefined) ??
      byName.get(s.speaker.toLowerCase());
    const { key, company } = groupKey(p, s);
    let row = rows.get(key);
    if (!row) {
      const index = p ? participants.indexOf(p) : -1;
      row = {
        key,
        label: company ?? p?.name ?? s.speaker,
        participantIds: [],
        external: p?.scope === "external",
        colorIndex: index >= 0 ? index : participants.length + rows.size,
        ms: 0,
        pct: 0,
        ranges: [],
        members: new Set(),
      };
      rows.set(key, row);
    }
    if (p && !row.participantIds.includes(p.id)) {
      row.participantIds.push(p.id);
      if (company) row.members.add(firstName(p.name));
    }
    row.ranges.push({ start: s.start, end: s.end });
  }

  const list = [...rows.values()].map(({ members, ...row }) => {
    const ranges = mergeRanges(normalizeRanges(row.ranges, duration));
    const label = members.size ? `${row.label} (${[...members].join(", ")})` : row.label;
    return { ...row, label, ranges, ms: rangesMs(ranges) };
  });
  list.sort((a, b) => b.ms - a.ms || a.label.localeCompare(b.label));
  const pcts = roundToHundred(list.map((r) => r.ms));
  const withPct = list.map((r, i) => ({ ...r, pct: pcts[i] }));
  const totalMs = withPct.reduce((a, r) => a + r.ms, 0);
  return { rows: withPct, totalMs, durationMs: duration };
}

export type BarSegment = { start: number; left: number; width: number };

export function barSegments(ranges: Range[], durationMs: number, minWidth = 0.5): BarSegment[] {
  if (durationMs <= 0) return [];
  const gap = (durationMs * minWidth) / 100;
  return mergeRanges(normalizeRanges(ranges, durationMs), gap).map((r) => {
    const left = (r.start / durationMs) * 100;
    const width = Math.max(minWidth, ((r.end - r.start) / durationMs) * 100);
    return { start: r.start, left: Math.min(left, 100 - width), width };
  });
}

export type ParticipantRole = "host" | "attended" | "invited";

export function participantRole(
  p: ParticipantRow,
  recorders: Recording["recorders"],
): ParticipantRole {
  const host = recorders.some(
    (r) =>
      r.participant_id === p.id ||
      (!!r.email && !!p.email && r.email.toLowerCase() === p.email.toLowerCase()),
  );
  if (host) return "host";
  return p.confirmedAttendee ? "attended" : "invited";
}

export function participantSubtitle(p: ParticipantRow): string | null {
  if (!p.email) return null;
  return p.scope === "external" ? (p.email.split("@")[1] ?? p.email) : p.email;
}

export function toggleTag(tags: string[], tag: string, on: boolean): string[] {
  const rest = tags.filter((t) => t !== tag);
  return on ? [...rest, tag] : rest;
}

export function normalizeTag(input: string): string | null {
  const tag = input.trim().replace(/\s+/g, " ");
  return tag ? tag : null;
}

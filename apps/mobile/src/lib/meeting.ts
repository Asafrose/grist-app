import { companyFromEmail } from "@/lib/company";
import type { ActionItemRow, ParticipantRow } from "@/lib/db";

export const MEETING_TABS = ["summary", "transcript", "timeline", "clips"] as const;
export type MeetingTab = (typeof MEETING_TABS)[number];

export function parseMeetingTab(value: unknown): MeetingTab {
  return MEETING_TABS.find((t) => t === value) ?? "summary";
}

export function parseSeekParam(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export const RECORDING_STALE_MS = 10 * 60_000;

export function isRecordingStale(syncedAt: string, now = Date.now()): boolean {
  const at = Date.parse(syncedAt);
  return Number.isNaN(at) || now - at >= RECORDING_STALE_MS;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export type AssigneeGroup = {
  key: string;
  name: string;
  company: string | null;
  colorIndex: number;
  items: ActionItemRow[];
};

export function groupActionItems(
  items: ActionItemRow[],
  participants: ParticipantRow[],
): AssigneeGroup[] {
  const groups = new Map<string, AssigneeGroup>();
  for (const item of items) {
    const key = item.assignee?.id ?? item.assignee?.name ?? "unassigned";
    let group = groups.get(key);
    if (!group) {
      const name = item.assignee?.name ?? "Unassigned";
      const participantIndex = participants.findIndex(
        (p) => p.id === item.assignee?.id || p.name.toLowerCase() === name.toLowerCase(),
      );
      const participant = participants[participantIndex];
      group = {
        key,
        name: participant?.name ?? name,
        company: companyFromEmail(participant?.email),
        colorIndex: participantIndex >= 0 ? participantIndex : groups.size,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}

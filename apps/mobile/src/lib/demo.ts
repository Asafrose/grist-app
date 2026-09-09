import type { Recording, Transcript } from "@grist/grain-api";
import withClips from "@grist/grain-api/fixtures/recording-with-highlights.json";
import detail from "@grist/grain-api/fixtures/recording.json";
import page from "@grist/grain-api/fixtures/recordings.json";
import transcript from "@grist/grain-api/fixtures/transcript.json";
import { useAuthToken } from "@/lib/auth";
import { type Db, setTranscript, upsertRecordings } from "@/lib/db";
import { isoSeconds } from "@/lib/sync";

export const DEMO_TOKEN = "demo";
export const DEMO_MEDIA_URL =
  "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8";

// A meeting with a poster frame: demo media is a remote HLS stream with no thumbnail.
export const DEMO_THUMBNAIL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAASCAIAAAC1qksFAAAAX0lEQVR42rXChxGCAAAAsR8EVJReLBRRECv7z+QUnwtB3KkJk17NJh3UbLOrml0+qomKm5p9eVdzqCY1cT2rSZqHmvS4qMlOTzX5+aWmuLzVlO1HTdV91dT9T00zrOo/P6E8MCHL8mkAAAAASUVORK5CYII=";

export const DEMO_ME = {
  email: "marcus.kowalski@treyresearch.example",
  name: "Marcus Kowalski",
  userId: "08b3f69b-b374-41b5-a3bc-b7fef590fc0f" as string | null,
  source: "detected" as const,
};

export function isDemoToken(token: string | null | undefined): boolean {
  return token === DEMO_TOKEN;
}

export function useIsDemo(): boolean {
  return isDemoToken(useAuthToken());
}

const customers = ["Relecloud", "Wingtip", "Fabrikam", "Trey Research", "Contoso", "Adatum"];
const topics = [
  "Pricing review",
  "Demo + POV discussion",
  "Onboarding call",
  "Renewal discussion",
  "Quarterly check-in",
  "Security questionnaire",
  "Integration planning",
  "Weekly sync",
];
const internal = ["Design review", "Sprint planning", "Hiring sync", "Roadmap check-in"];
const teams = ["Sales", "Customer Success", "Engineering", "Design", "Marketing", "Support"].map(
  (name, i) => ({ id: `demo-team-${i}`, name }),
);

const HOUR = 3_600_000;
const offsetsHours = [
  2, 5, 26, 29, 31, 50, 74, 98, 122, 150, 170, 200, 240, 290, 340, 400, 470, 560, 650, 760, 900,
  1100, 1400, 1800,
];

export function demoRecordings(now = Date.now()): Recording[] {
  const bases = [...(page.recordings as Recording[]), detail as Recording, withClips as Recording];
  const recorders = [...new Map(bases.flatMap((b) => b.recorders).map((r) => [r.id, r])).values()];
  return offsetsHours.map((hours, i) => {
    const base = bases[i % bases.length];
    const recorder = recorders[i % recorders.length];
    const start = now - hours * HOUR;
    const isInternal = i % 4 === 3;
    const title = isInternal
      ? `${internal[i % internal.length]}`
      : `${customers[i % customers.length]} / Northwind: ${topics[i % topics.length]}`;
    const attendsAsMe = i % 5 !== 4;
    const baseParticipants = base.participants ?? [];
    const hasMe = baseParticipants.some((p) => p.email === DEMO_ME.email);
    const withMe =
      attendsAsMe && !hasMe
        ? [
            ...baseParticipants,
            {
              id: DEMO_ME.userId ?? "demo-me",
              name: DEMO_ME.name,
              email: DEMO_ME.email,
              scope: "internal",
              confirmed_attendee: true,
            },
          ]
        : attendsAsMe
          ? baseParticipants
          : baseParticipants.filter((p) => p.email !== DEMO_ME.email);
    const participants = withMe.map((p) => (isInternal ? { ...p, scope: "internal" } : p));
    const durationMs = base.duration_ms;
    return {
      ...base,
      id: `demo-${i}`,
      title,
      media_type: i % 5 === 4 ? "audio" : base.media_type,
      thumbnail_url: i === 2 ? DEMO_THUMBNAIL : base.thumbnail_url,
      workspace_shared: i % 3 !== 0,
      start_datetime: isoSeconds(start),
      end_datetime: isoSeconds(start + durationMs),
      participants,
      teams: [teams[i % teams.length]],
      recorders: base.recorders.map((r) => ({
        ...r,
        id: recorder.id,
        name: recorder.name,
        email: recorder.email,
      })),
      highlights: (base.highlights ?? []).map((h) => ({
        ...h,
        id: `demo-${i}-${h.id}`,
        recording_id: `demo-${i}`,
        created_datetime: isoSeconds(start + h.timestamp + h.duration + HOUR),
      })),
      meeting_type: isInternal
        ? { id: "mt-internal", name: "Internal", scope: "internal" }
        : base.meeting_type,
    };
  });
}

export function seedDemo(db: Db, now = Date.now()): number {
  const recs = demoRecordings(now);
  const stamp = isoSeconds(now);
  upsertRecordings(db, recs, stamp);
  for (const r of recs) setTranscript(db, r.id, transcript as Transcript, stamp);
  return recs.length;
}

export const demoWindowDays = Math.ceil(Math.max(...offsetsHours) / 24);

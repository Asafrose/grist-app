import type { Recording, Transcript } from "@grist/grain-api";
import withClips from "@grist/grain-api/fixtures/recording-with-highlights.json";
import detail from "@grist/grain-api/fixtures/recording.json";
import page from "@grist/grain-api/fixtures/recordings.json";
import transcript from "@grist/grain-api/fixtures/transcript.json";
import { type Db, setTranscript, upsertRecordings } from "@/lib/db";
import { isoSeconds } from "@/lib/sync";

export const DEMO_TOKEN = "demo";
export const DEMO_MEDIA_URL =
  "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8";

export function isDemoToken(token: string | null | undefined): boolean {
  return token === DEMO_TOKEN;
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

const HOUR = 3_600_000;
const offsetsHours = [
  2, 5, 26, 29, 31, 50, 74, 98, 122, 150, 170, 200, 240, 290, 340, 400, 470, 560, 650, 760, 900,
  1100, 1400, 1800,
];

export function demoRecordings(now = Date.now()): Recording[] {
  const bases = [...(page.recordings as Recording[]), detail as Recording, withClips as Recording];
  return offsetsHours.map((hours, i) => {
    const base = bases[i % bases.length];
    const start = now - hours * HOUR;
    const isInternal = i % 4 === 3;
    const title = isInternal
      ? `${internal[i % internal.length]}`
      : `${customers[i % customers.length]} / Northwind: ${topics[i % topics.length]}`;
    const participants = (base.participants ?? []).map((p) =>
      isInternal ? { ...p, scope: "internal" } : p,
    );
    const durationMs = base.duration_ms;
    return {
      ...base,
      id: `demo-${i}`,
      title,
      media_type: i % 5 === 4 ? "audio" : base.media_type,
      start_datetime: isoSeconds(start),
      end_datetime: isoSeconds(start + durationMs),
      participants,
      highlights: (base.highlights ?? []).map((h) => ({
        ...h,
        id: `demo-${i}-${h.id}`,
        recording_id: `demo-${i}`,
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

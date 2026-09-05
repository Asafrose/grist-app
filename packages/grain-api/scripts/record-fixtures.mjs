#!/usr/bin/env node
// Records real responses with GRAIN_PAT and writes anonymized fixtures.
// Shapes are preserved; every name, email, company, title, and piece of
// spoken or summarized content is replaced with deterministic synthetic text.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const out = join(here, "..", "fixtures");

function loadToken() {
  if (process.env.GRAIN_PAT) return process.env.GRAIN_PAT;
  const envFile = join(root, ".env.local");
  if (existsSync(envFile)) {
    const m = /^GRAIN_PAT=(.+)$/m.exec(readFileSync(envFile, "utf8"));
    if (m) return m[1].trim();
  }
  throw new Error("GRAIN_PAT not set and no .env.local found");
}

const token = loadToken();
const BASE = "https://api.grain.com/_/public-api/v2";
const headers = {
  Authorization: `Bearer ${token}`,
  "Public-Api-Version": "2025-10-31",
  "Content-Type": "application/json",
};

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers,
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}
async function getText(path, extra = {}) {
  const res = await fetch(BASE + path, { headers: { ...headers, ...extra } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res;
}

// ------------------------------------------------------------------ anonymizer
const FIRST = [
  "Jonah",
  "Priya",
  "Marcus",
  "Dana",
  "Sofia",
  "Tomas",
  "Noa",
  "Felix",
  "Ravi",
  "Lena",
  "Omar",
  "Ines",
  "Mira",
  "Jordan",
  "Mia",
  "Theo",
  "Lucas",
  "Amara",
  "Kenji",
  "Zara",
  "Elias",
  "Nadia",
  "Bruno",
  "Yara",
];
const LAST = [
  "Reyes",
  "Natarajan",
  "Lind",
  "Whitfield",
  "Marin",
  "Berg",
  "Peretz",
  "Hoffmann",
  "Okafor",
  "Duarte",
  "Kowalski",
  "Haddad",
  "Sato",
  "Nyström",
  "Costa",
  "Abara",
  "Fischer",
  "Moreau",
  "Iqbal",
  "Novak",
];
const COMPANIES = [
  "Acme",
  "Contoso",
  "Fabrikam",
  "Litware",
  "Tailspin",
  "Woodgrove",
  "Lamna",
  "Proseware",
  "Wingtip",
  "Alpine",
  "Coho",
  "Adatum",
  "Relecloud",
  "Northwind",
  "Trey Research",
  "Blue Yonder",
];
const TITLES = [
  "Demo + POV discussion",
  "Weekly sync",
  "Integration kickoff",
  "Pricing review",
  "Security review",
  "Onboarding call",
  "Quarterly check-in",
  "Renewal discussion",
  "Technical deep dive",
  "Discovery call",
];
const SENTENCES = [
  "So the way we think about ingestion is you connect the point solutions directly, or through a SIEM if you already have one.",
  "Got it. And does the filtering happen on our side or yours?",
  "On ours. If something is noisy the team pushes a change; it is not a self-serve toggle today.",
  "To be clear, ingestion cost is not a concern because we do not price by volume.",
  "What does the timeline look like if we start integration in the middle of the month?",
  "We would integrate first, tune while your team is out, and go live early next month.",
  "Can you send over the list of supported integrations after the call?",
  "Yes, I will send that along with the measurement guidance today.",
  "Let me share my screen and walk through the investigation view.",
  "That makes sense. I need to take this to leadership before we commit.",
  "Which identity providers do you support out of the box?",
  "All the common ones, and we add new sources quickly when a customer needs one.",
];
const BULLETS = [
  "The customer has no central monitoring today and wants to answer security questionnaires with confidence.",
  "Positioned the offering as a blend of automated triage and senior human response.",
  "Proof of value would cover cloud, identity, and endpoint sources with a go-live early next month.",
  "Pricing was discussed as an annual flat fee; the customer will confirm budget with leadership.",
  "Data filtering is handled by the vendor team on request rather than by a self-serve control.",
  "Open question on how limited endpoint visibility affects detection coverage during the pilot.",
];
const ACTIONS = [
  "Send the measurement requirements and pricing summary",
  "Share the full list of supported integrations",
  "Confirm endpoint data visibility for the pilot",
  "Schedule a scoping session and define success criteria",
  "Take pricing to leadership for budget approval",
];

const h = (s) => createHash("sha256").update(String(s)).digest();
const pick = (arr, seed) => arr[h(seed)[0] % arr.length];
const pick2 = (arr, seed) => arr[h(seed)[1] % arr.length];

const idMap = new Map();
function fakeId(id) {
  if (!id) return id;
  if (!idMap.has(id)) {
    const b = h(`id:${id}`).toString("hex");
    idMap.set(
      id,
      /^[0-9a-f-]{36}$/i.test(id)
        ? `${b.slice(0, 8)}-${b.slice(8, 12)}-4${b.slice(13, 16)}-a${b.slice(17, 20)}-${b.slice(20, 32)}`
        : b.slice(0, id.length),
    );
  }
  return idMap.get(id);
}

const nameMap = new Map();
function fakeName(name) {
  if (!name) return name;
  if (!nameMap.has(name))
    nameMap.set(name, `${pick(FIRST, `f:${name}`)} ${pick2(LAST, `l:${name}`)}`);
  return nameMap.get(name);
}
const domainMap = new Map();
function fakeDomain(domain) {
  if (!domainMap.has(domain))
    domainMap.set(
      domain,
      `${pick(COMPANIES, `d:${domain}`).toLowerCase().replace(/\s+/g, "")}.example`,
    );
  return domainMap.get(domain);
}
function fakeEmail(email, name) {
  if (!email) return email;
  const domain = email.split("@")[1] ?? "example.com";
  return `${fakeName(name).toLowerCase().replace(/\s+/g, ".")}@${fakeDomain(domain)}`;
}
function fakeTitle(title, seed) {
  const ext = pick(COMPANIES, `c:${seed}`);
  return `${ext} / Northwind: ${pick2(TITLES, `t:${seed}`)}`;
}
function fakeSentences(seed, n) {
  return Array.from({ length: n }, (_, i) => pick(SENTENCES, `${seed}:${i}`)).join(" ");
}
function fakeSummary(md, seed) {
  const lines = md.split("\n");
  let i = 0;
  return lines
    .map((line) => {
      if (/^#+\s/.test(line))
        return line.replace(
          /^(#+\s+).*$/,
          (_, p) =>
            `${p}${pick(["Summary", "Customer context", "Positioning", "Demo highlights", "Next steps", "Open questions"], `${seed}:h:${i++}`)}`,
        );
      if (/^\s*[-*]\s/.test(line))
        return line.replace(
          /^(\s*[-*]\s+).*$/,
          (_, p) =>
            `${p}${pick(BULLETS, `${seed}:b:${i++}`)} ${pick(["1:28", "10:14", "17:04", "42:12", "42:29"], `${seed}:ts:${i}`)}`,
        );
      return line.trim() ? pick(BULLETS, `${seed}:p:${i++}`) : line;
    })
    .join("\n");
}

function anonRecording(r) {
  const id = fakeId(r.id);
  return {
    ...r,
    id,
    title: fakeTitle(r.title, r.id),
    url: `https://grain.com/share/recording/${id}/${h(`tok:${r.id}`).toString("base64url").slice(0, 40)}`,
    thumbnail_url: r.thumbnail_url
      ? `https://media.grain.com/public_thumbnails/recordings/${id}`
      : r.thumbnail_url,
    teams: r.teams?.map((t) => ({
      ...t,
      id: fakeId(t.id),
      name: `${pick(COMPANIES, `team:${t.id}`)} team`,
    })),
    recorders: r.recorders?.map((p) => ({
      ...p,
      id: fakeId(p.id),
      participant_id: fakeId(p.participant_id),
      name: fakeName(p.name),
      email: fakeEmail(p.email, p.name),
    })),
    participants: r.participants?.map((p) => ({
      ...p,
      id: fakeId(p.id),
      name: fakeName(p.name),
      email: fakeEmail(p.email, p.name),
    })),
    meeting_type: r.meeting_type
      ? { ...r.meeting_type, id: fakeId(r.meeting_type.id) }
      : r.meeting_type,
    calendar_event: r.calendar_event
      ? {
          ...r.calendar_event,
          ical_uid: r.calendar_event.ical_uid
            ? `event-${fakeId(r.id).slice(0, 8)}`
            : r.calendar_event.ical_uid,
        }
      : r.calendar_event,
    ai_summary: r.ai_summary ? { text: fakeSummary(r.ai_summary.text, r.id) } : r.ai_summary,
    ai_action_items: r.ai_action_items?.map((a, i) => ({
      ...a,
      text: pick(ACTIONS, `${r.id}:a:${i}`),
      assignee: a.assignee
        ? {
            ...a.assignee,
            id: fakeId(a.assignee.id),
            user_id: fakeId(a.assignee.user_id),
            name: fakeName(a.assignee.name),
          }
        : a.assignee,
    })),
    private_notes: r.private_notes
      ? { text: "Follow up on the pilot scope before Thursday." }
      : r.private_notes,
    screenshares: r.screenshares?.map((s) => ({ ...s, participant_id: fakeId(s.participant_id) })),
    highlights: r.highlights?.map((hl) => anonHighlight(hl)),
    hubspot: r.hubspot
      ? {
          hubspot_company_ids: r.hubspot.hubspot_company_ids.map((x) => fakeId(x)),
          hubspot_deal_ids: r.hubspot.hubspot_deal_ids.map((x) => fakeId(x)),
        }
      : r.hubspot,
  };
}
function anonHighlight(hl) {
  const id = fakeId(hl.id);
  return {
    ...hl,
    id,
    recording_id: fakeId(hl.recording_id),
    text: pick(BULLETS, `hl:${hl.id}`),
    transcript: hl.transcript ? fakeSentences(`hlt:${hl.id}`, 3) : hl.transcript,
    speakers: hl.speakers?.map((s) => fakeName(s)),
    url: `https://grain.com/share/highlight/${id}`,
    thumbnail_url: hl.thumbnail_url
      ? `https://media.grain.com/public_thumbnails/highlights/${id}`
      : hl.thumbnail_url,
  };
}
function anonTranscript(segs) {
  return segs.map((s, i) => ({
    ...s,
    participant_id: fakeId(s.participant_id),
    speaker: fakeName(s.speaker),
    text: pick(SENTENCES, `seg:${i}:${s.start}`),
  }));
}
function toTxt(segs) {
  return `${segs.map((s) => `${s.speaker}: ${s.text}`).join("\n")}\n`;
}
const ts = (ms, sep) => {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  const mmm = String(d.getUTCMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}${sep}${mmm}`;
};
function toVtt(segs) {
  return `WEBVTT\n\n${segs.map((s, i) => `${i + 1}\n${ts(s.start, ".")} --> ${ts(s.end, ".")}\n<v ${s.speaker}>${s.text}\n`).join("\n")}`;
}
function toSrt(segs) {
  return segs
    .map((s, i) => `${i + 1}\n${ts(s.start, ",")} --> ${ts(s.end, ",")}\n${s.speaker}: ${s.text}\n`)
    .join("\n");
}

// ------------------------------------------------------------------ record
const include = {
  participants: true,
  highlights: true,
  ai_action_items: true,
  ai_summary: true,
  calendar_event: true,
  screenshares: true,
  private_notes: true,
  hubspot: true,
  ai_template_sections: { format: "json" },
};

const page = await post("/recordings", { include });
const recordings = page.recordings.slice(0, 5);
const first = recordings[0];
let withClips = page.recordings.find((r) => r.highlights?.length);
if (!withClips) {
  let cursor = page.cursor;
  for (let i = 0; i < 5 && cursor && !withClips; i++) {
    const next = await post("/recordings", { include, cursor });
    withClips = next.recordings.find((r) => r.highlights?.length);
    cursor = next.cursor;
  }
}
const detail = await post(`/recordings/${first.id}`, { include });
const transcript = (await (await getText(`/recordings/${first.id}/transcript`)).json()).slice(
  0,
  40,
);
const users = await post("/users");
const teams = await post("/teams");
const meetingTypes = await post("/meeting_types");
const hooks = await post("/hooks");
const dl = await fetch(`${BASE}/recordings/${first.id}/download`, { headers, redirect: "manual" });
const signed = dl.headers.get("location");
let range = null;
if (signed) {
  const probe = await fetch(signed, { headers: { Range: "bytes=0-0" } });
  range = {
    status: probe.status,
    accept_ranges: probe.headers.get("accept-ranges"),
    content_range: probe.headers.get("content-range"),
    content_type: probe.headers.get("content-type"),
  };
  await probe.body?.cancel();
}

const anonSegs = anonTranscript(transcript);
const write = (name, data) =>
  writeFileSync(
    join(out, name),
    typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`,
  );

write("recordings.json", {
  cursor: page.cursor ? "ApJNWoNoBHcCdjJ3DWNocm9ub2xvZ2ljYWx3BGRlc2No" : null,
  recordings: recordings.map(anonRecording),
});
write("recording.json", anonRecording(detail));
write("recording-with-highlights.json", withClips ? anonRecording(withClips) : null);
write("transcript.json", anonSegs);
write("transcript.txt", toTxt(anonSegs));
write("transcript.vtt", toVtt(anonSegs));
write("transcript.srt", toSrt(anonSegs));
write("users.json", {
  users: users.users
    .slice(0, 6)
    .map((u) => ({ id: fakeId(u.id), name: fakeName(u.name), email: fakeEmail(u.email, u.name) })),
});
write("teams.json", {
  teams: teams.teams.map((t) => ({
    id: fakeId(t.id),
    name: `${pick(COMPANIES, `team:${t.id}`)} team`,
  })),
});
write("meeting_types.json", {
  meeting_types: meetingTypes.meeting_types.map((m) => ({ ...m, id: fakeId(m.id) })),
});
write(
  "hooks.json",
  hooks.hooks.length
    ? hooks
    : {
        hooks: [
          {
            id: randomUUID(),
            enabled: true,
            hook_url: "https://relay.example/hooks/abc",
            hook_type: "recording_added",
            include: {},
            inserted_at: "2026-01-01T09:30:00Z",
          },
        ],
      },
);
write("download.json", {
  status: dl.status,
  location: signed
    ? `https://media.grain.com/recordings/${fakeId(first.id)}.mp4?Expires=1900000000&Key-Pair-Id=EXAMPLE&Signature=EXAMPLE`
    : null,
  range,
});
write("error-400.json", {
  error: "bad_request",
  data: "Invalid input arguments:\nType mismatch. Expected Boolean but got Object. At path: #/include/highlights.",
});

console.log(`wrote fixtures to ${out}`);
console.log(
  `recordings=${recordings.length} clips=${withClips ? "yes" : "no"} transcript=${anonSegs.length} segments range=${range?.status}`,
);

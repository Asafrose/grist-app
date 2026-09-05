# Grain: application capabilities and mobile-compatibility targets

Surveyed on 2025-09-05 against the Grain web app (`grain.com/app`) as a
non-admin member of a Business-plan workspace without a paid recording seat,
plus the public API reference at `developers.grain.com`. This document
describes what Grain does today and what a mobile client must implement to be
a credible replacement for consuming meetings on a phone.

Legend for the "API" column used throughout:

| Mark | Meaning |
|------|---------|
| ✅ | Fully available through the public API v2 |
| ◐ | Partially available (see note) |
| ❌ | Not exposed by the public API; would require the private web API |
| — | Not relevant to a consumption-first mobile client |

---

## 1. Product overview

Grain is a meeting-recording platform. It captures calls (via a bot that joins
Zoom, Google Meet, Teams, or Webex; via a desktop-capture app; via file
upload; via Zoom cloud import; via Aircall phone calls), transcribes them,
generates AI notes, and stores them in a shared workspace. Its value to a
consumer is the *post-meeting* experience: reading the AI summary and action
items, scrubbing the video by speaker or chapter, searching transcripts across
all meetings, and sharing clips.

The web app is a single-page application. Its information architecture:

```
Sidebar
├── Workspace switcher (Acme ▾)  → Account settings / Workspace settings / Open in desktop app / Sign out
├── + New                            → Desktop Capture / Bot recording / File upload / Zoom import
├── Search
├── Updates (badge)                  → notifications popover
├── Meetings                         → primary list
├── Playlists
├── Stories                          → Stories tab + Clips tab
├── Coaching                         → paywalled (paid seat)
└── Invite / Help
Floating: "Ask anything…" (⇧A)      → AI chat over all meetings (Beta)
```

---

## 2. Meetings list (`/app/meetings`)

The landing page. This is the screen a mobile app opens to.

### 2.1 Views (top tabs)

| Tab | Content | API |
|-----|---------|-----|
| My meetings | Meetings the user recorded, attended, or was shared | ✅ `filter.attendance` (Personal API) or default list |
| Workspace meetings | All meetings with workspace visibility | ✅ default list, `share_state` = `workspace` |
| `<Team name>` (one per team) | Meetings assigned to a team, URL `/app/meetings/teams/<uuid>` | ✅ `filter.team` + `POST /teams` |

### 2.2 "Up next" section

Upcoming calendar events for the next day(s), shown above the history with:
date badge, title, recurring icon, time, Internal/External label, company
chip, recorder count, participant count, and a per-event **auto-capture
selector** (Auto-capture with Grain Bot / Auto-capture with Grain Desktop /
Don't auto-capture). "Show all" expands the list.

API: ❌. The public API has no calendar/upcoming-events endpoint. The mobile
app can either omit this section or read the user's device calendar directly
for a read-only "up next" (no auto-capture toggle).

### 2.3 History list

Grouped by day (`Today`, `Yesterday`, `Wednesday, Aug 26th`, …), newest
first, infinite scroll. Each row:

| Column | API field |
|--------|-----------|
| Thumbnail | `thumbnail_url` ✅ |
| Title (+ recurring icon) | `title` ✅ (recurring: `calendar_event.ical_uid` ◐) |
| Start time · duration · Internal/External | `start_datetime`, `duration_ms`, `meeting_type.scope` / participant scopes ✅ |
| Company chip (external domain) | derive from external participants' email domains ◐ |
| Recorder avatar + "1 recorder" | `recorders[]` ✅ |
| Participant count | `participants[]` (include) ✅ |

### 2.4 List controls

**Filter by title** text box → `filter.title_search` ✅.

**Filters menu** (funnel icon):

| Filter | API |
|--------|-----|
| Date | `filter.after_datetime` / `before_datetime` ✅ |
| Participants | client-side over `participants[]` ◐ |
| Team | `filter.team` ✅ |
| Company | client-side over participant email domains ◐ |
| Recorder | client-side over `recorders[]` ◐ |
| Trackers | ❌ (Business feature, not in API) |
| Tags | client-side over `tags[]` ◐ |
| Meeting Type | `filter.meeting_type` ✅ |

**List properties** (columns toggle): Team, Company, Recorder, Participants,
Sensitivity, Meeting tags, Trackers, Comments, Clips, Views, Meeting type,
Playlists. Mobile should pick a fixed compact row; toggles are desktop
affordances.

**⋮ menu** → "Recently deleted" (trash with restore). ❌ not in API.

### 2.5 Mobile target

- Two-level navigation: segmented control (My / Workspace / Teams) + day-grouped
  list with pull-to-refresh and cursor pagination (`cursor` in list response).
- Search-as-you-type on title.
- Filter sheet with Date range, Meeting type, Team, Internal/External,
  Participant, Tag.
- Offline cache of the last N pages so the list opens instantly.

---

## 3. Meeting detail (`/share/recording/<uuid>/<share-token>`)

The core screen. Desktop layout is two-pane: left = notes/transcript, right =
video player + timeline. On mobile this must collapse to player-on-top with
swipeable tabs beneath.

### 3.1 Header

| Element | API |
|---------|-----|
| Breadcrumb back to Meetings | — |
| Title (editable inline for owners) | `title` ✅ read, `PATCH title` ✅ write |
| Date chip | `start_datetime` ✅ |
| Participants chip ("aashish +3") → popover list | `participants[]` ✅ |
| Teams chip ("1 team") | `teams[]` ✅ |
| Sensitivity chip ("Pending" with tooltip) | ❌ |
| ⋮ chip → Meeting type · Viewers · Automation sharing | `meeting_type` ✅ / viewers ❌ / automations ❌ |

### 3.2 Top-right actions

| Action | API |
|--------|-----|
| Share (dialog: add people by name/email, per-person Can edit/view, "People in <Team>", Workspace access, Link access, Start at 00:00, Copy link) | `PUT /users`, `PUT /teams` (share) ✅; access levels ❌; link copy from `url` ✅ |
| Copy link | `url` ✅ |
| ✱ AI menu: Open in Claude · Open in ChatGPT · Copy transcript for AI · Download transcript for AI · Connect MCP | transcript text ✅ (`/transcript.txt`) |
| ⋮ menu: Copy ▸ · Download ▸ · Send to Slack · Send to Salesforce · Send follow-up email · Add to playlist ▸ · Add all clips to story ▸ · Add tags ▸ · Edit transcript · Change transcript language ▸ · Delete recording | Download `GET /download` ✅; Tags `PUT/DELETE /tags` ✅; everything else ❌ |

### 3.3 Left pane tabs

#### Summary

- **Search summary** box, copy button, and **send** menu (Send to HubSpot /
  Slack / Salesforce / follow-up email).
- **Action Items** grouped by assignee (avatar · name · company), each with a
  checkbox and a timestamp that seeks the player.
  API: `include.ai_action_items` ✅ → `text`, `status` (pending/completed),
  `timestamp`, `assignee{id,name,user_id}`. Toggling the checkbox: ❌ no
  write endpoint.
- **Summary** section: hierarchical bullets, bold names, each bullet has a
  timestamp that seeks the player.
  API: `include.ai_summary` ✅ → `text` (markdown). Timestamps appear inside
  the markdown; the app must parse `m:ss` tokens into seek links.
- **Template sections** (e.g. "Pylon's Security Posture & Drivers", "Demo
  Highlights", "Proposed Timeline & Next Steps", "Open Questions"). Each is a
  titled bullet group. Generated by the AI template attached to the meeting
  type.
  API: `include.ai_template_sections {format: json|markdown|text,
  allowed_sections}` ✅.
- **Add custom template** button → "Customize Summary" modal listing Grain
  templates (Sales Discovery 6 sections, Sales Follow-Up 3, Customer Feedback
  4, Partner Check-in 6, …) with an Add button, plus "Template settings".
  ❌ not in API (read-only sections only).

#### Private Notes

Rich-text editor ("Write or type / for commands…"), per-user, not visible to
others.
API: `include.private_notes` (Personal API only) ✅ read → `text` markdown.
❌ no write endpoint.

#### Transcript

- **Search transcript** box, comment counter, copy, ⋮ (Edit Transcript ·
  Change transcript language ▸ · Download transcript ▸).
- Body grouped by **Chapter** headings ("Chapter 1: Introductions,
  environment, and triage needs"), then speaker blocks: avatar · name · text.
  Clicking a line seeks the player; the current line is highlighted while
  playing. A thin scroll-position indicator sits at the right edge.
- Hovering a segment exposes actions (create clip, comment, copy).

API: `GET /transcript` ✅ → array of `{participant_id, speaker, start, end,
text}` in ms. Also `.txt`, `.vtt`, `.srt`. **Chapters are not exposed** ❌;
the player's chapter label ("Introductions, environment, and triage needs")
is likewise unavailable. The app can synthesize chapters from
`ai_template_sections` timestamps or simply omit them.

### 3.4 Right pane

#### Video player

Controls observed: current time · chapter title · total time; scrubber with
segment markers (chapters); volume; speed (1, 1.2, 1.5, 1.7, 2, 2.2, 2.5);
−10s / play / +10s; picture-in-picture; fullscreen.

API: no streaming URL is exposed. `GET /recordings/:id/download` ✅ returns
the media file (mp4 or audio). A mobile client can stream that download URL
directly into the native player with range requests. `media_type` tells the
client whether it is `video`, `audio`, or `transcript`-only.

#### Timeline tab

Per-speaker talk-time bars: name · percentage · minutes, with a bar showing
where in the recording each person spoke. Includes an aggregate row for
external participants grouped by company (e.g. "Pylon 20% · 8m") and a
**Screenshare** row (e.g. "31 min") with shaded ranges. Below: **Clips**
count and **Comments** count rows that expand.

API: talk-time is derivable client-side from the transcript's per-segment
`participant_id`/`start`/`end` ✅. Screenshare ranges:
`include.screenshares` ✅ → `{start, end, participant_id}`. Comments ❌.

#### Clips tab

"N clips" with "Copy clips" and a list of clip cards (thumbnail, duration
badge, title). Clicking plays the clip range.

API: `include.highlights` ✅ → `{id, recording_id, text, transcript,
speakers[], timestamp, duration, tags[], url, thumbnail_url,
created_datetime}`. Creating clips ❌.

#### Coaching tab

Paywalled: "Request a paid seat to access Coaching." Contains AI scorecards
when enabled. ❌ not in API.

### 3.5 Mobile target

Priority order for a phone:

1. Native video/audio player (background audio, lock-screen controls,
   AirPlay/Chromecast, PiP) fed by the download URL, with speed control and
   ±10s.
2. Summary tab: action items and summary bullets with tap-to-seek
   timestamps.
3. Transcript tab: auto-scrolling, tap-to-seek, in-transcript search, speaker
   avatars/colors.
4. Timeline: speaker talk-time bars computed locally; tap a bar segment to
   seek.
5. Clips list with playback of the clip range.
6. Participants sheet, tags (read + add/remove), share via native share sheet
   using `url`, download for offline.
7. Private notes (read-only until Grain exposes a write endpoint).

Things the mobile app cannot do through the public API and must deep-link
back to the web app for: edit transcript, comments, create clips, change
sharing permissions, send to Slack/HubSpot/Salesforce, custom templates,
delete/restore.

---

## 4. Search (`/app/search`)

- Large query box; on submit shows **N Meetings** with a snippet per match
  (bold query term, speaker name, timestamp that opens the meeting at that
  point).
- **Include transcripts** toggle (default on). Off = title-only.
- Filters: Recorder, Participants, Company, Trackers, Tags, Date, Playlists,
  Meeting Type.
- Right-hand icon: result list column properties.
- Empty state shows **Recent searches** and **Recent meetings** with a ⋮
  quick-action menu per row.

API: only `filter.title_search` ✅. **Full-text transcript search is not
exposed** ❌. Options for mobile:

- Title search live via API.
- Transcript search by downloading transcripts for recent meetings into a
  local index (SQLite FTS) and searching on-device. Feasible for a personal
  library; rate limit is 300 req/min.

---

## 5. Updates (bell popover)

Notification feed with filter "All ▾", "Mark all as read", unread dots.
Observed types: "There's a new scorecard for your meeting: X", "<Person> has
shared <Meeting> with you." Relative timestamps.

API: ❌ no notifications endpoint. Webhooks (`recording_added`,
`recording_updated`, `highlight_added`, `story_*`, `upload_status`) exist but
require a server to receive them. A mobile app could get push notifications
by running a small relay that registers hooks and forwards to APNs/FCM.
Otherwise poll the list for new `recording_added` items and show "new since
last open".

---

## 6. Playlists (`/app/playlists`)

- Tabs: Playlists (all) plus one per team; filter by title; **New playlist**.
- Rows: thumbnail, name, "Created <date> by <user>", owning workspace/team,
  meeting count.
- Detail: title, creation chip, team chip, filter, day-grouped meeting list
  identical to the Meetings list. Header actions: Share, copy link, AI menu,
  **+ Add**, ⋮.

API: ❌ no playlist endpoints (playlist appears only as a filter and column
in the UI). Mobile v1 should omit playlists or deep-link to web.

---

## 7. Stories and Clips (`/app/stories`, `/app/clips`)

- **Stories** tab: "collections of Clips you can stitch together". New story
  button. Empty in this workspace.
- **Clips** tab: flat list of every clip in the workspace: thumbnail,
  AI-generated title ("Conrad questions SIEM alerts; prefers consolidating
  investigations in Google SecOps"), date · duration, creator, source meeting,
  ⋮ menu. Filter by title.

API: clips are only reachable through `include.highlights` on a recording ✅,
so a global clips feed means listing recordings with highlights included and
flattening. Stories: only webhook events, no read endpoint ❌.

---

## 8. Coaching (`/app/coaching`)

Paywalled for this seat. Business plan feature: AI scorecards, trackers,
team interaction metrics. ❌ not in API. Out of scope.

---

## 9. "Ask anything" AI chat (⇧A)

Floating panel, "All Meetings · Beta". Scope chip ("All meetings"), suggested
prompts ("What are my action items from today?", "What pain points were
raised in my customer calls recently?", "What decisions did my team make this
week?"), free-text question box.

API: ❌ no chat endpoint. Grain instead ships an MCP server and official
Claude/ChatGPT apps. A mobile app could offer an equivalent by feeding
summaries/transcripts from the API into a model of its own choosing, or link
out to the Claude/ChatGPT apps.

---

## 10. Creation flows (+ New)

| Flow | Description | API |
|------|-------------|-----|
| Desktop Capture | Transcribe & summarize from the desktop app | — (desktop only) |
| Bot recording | Send Grain bot to a meeting URL | ❌ |
| File upload | Upload .mov .mp4 .mp3 .m4a | ✅ `POST /recordings/upload` → signed PUT URL, `upload_status` hook |
| Zoom import | Import from Zoom cloud | ❌ |

File upload is the one creation flow a mobile client can offer (e.g. upload a
voice memo recorded on the phone). Requires a paid seat.

---

## 11. Settings

### Account (`/app/settings/account`)

| Tab | Content | Mobile relevance |
|-----|---------|------------------|
| My Meetings | Auto-capture rules (paywalled here: "Request a paid seat to record meetings") | Low |
| App | Redirects to desktop app | None |
| Profile | Picture, email, preferred name | Show read-only via `POST /users` |
| Integrations | Google Calendar, Microsoft Calendar, Claude, ChatGPT, MCP Clients, Zoom, **Personal API** (Generate personal API token · View API docs) | Token entry point for the app |

### Workspace (`/app/settings/workspace`)

General, Meetings, Templates, Trackers = admin-only. Scorecards, Members,
Billing, Plans, Integrations (HubSpot, Salesforce, Slack, Aircall, Zapier,
API) visible. Plans page confirms: **Personal API** is Starter+, **Workspace
API** and advanced MCP are Business+.

---

## 12. Public API v2 summary (what the app can build on)

Base URL `https://api.grain.com`, header `Authorization: Bearer <token>`,
header `Public-Api-Version: 2025-10-31`, 300 requests/minute, cursor
pagination.

Auth options:

| Method | Where obtained | Notes |
|--------|----------------|-------|
| Personal Access Token | Account settings → Integrations → Personal API | Self-serve. Scope = everything the user can see. v1 of the app should start here. |
| Workspace Access Token | Workspace settings (admin) | All workspace data. Not for a personal client. |
| OAuth2 Authorization Code + PKCE | Client ID requested manually from Grain | Proper sign-in flow for a distributed app. Redirect URI prefix must be registered. |

Endpoints:

| Endpoint | Use in app |
|----------|-----------|
| `POST /recordings` (filter, include, cursor) | Meetings list, team lists, title search, clips feed |
| `POST /recordings/:id` (include) | Meeting detail: summary, action items, template sections, participants, highlights, private notes, screenshares, calendar event, hubspot ids |
| `GET /recordings/:id/transcript` (+ .txt .vtt .srt) | Transcript tab, talk-time, on-device search index, subtitles |
| `GET /recordings/:id/download` | Media playback and offline download |
| `PATCH /recordings/:id` | Rename |
| `PUT/DELETE /recordings/:id/tags` | Tag management |
| `PUT/DELETE /recordings/:id/users`, `/teams` | Share / unshare |
| `POST /recordings/upload` | Upload from phone |
| `POST /users`, `/teams`, `/meeting_types` | Filter pickers, avatars, "me" |
| `POST /hooks/create`, `/hooks`, `DELETE /hooks/:id` | Push-notification relay (server-side) |

Recording object fields: `id, title, start_datetime, end_datetime,
duration_ms, media_type (audio|transcript|video), source (aircall |
local_capture | meet | teams | upload | webex | zoom | other), share_state
(public | workspace | restricted), url, thumbnail_url, tags[], teams[],
recorders[], meeting_type{id,name,scope}` plus the optional includes above.

---

## 13. Compatibility matrix: what "parity" means for the mobile app

### Must have (v1, fully API-backed)

- Sign in with Personal Access Token; later OAuth2 PKCE.
- Meetings list: My / Workspace / Team tabs, day grouping, thumbnails,
  duration, internal/external, participant count, infinite scroll,
  pull-to-refresh, title search, date/type/team filters.
- Meeting detail: native player (video + audio-only mode, background play,
  speed, ±10s, lock-screen controls), Summary with tap-to-seek action items
  and bullets, template sections, Transcript with follow-along highlighting
  and tap-to-seek, Timeline talk-time bars, Clips list with clip playback,
  Participants sheet, Tags add/remove, Share via `url`, Download for offline.
- Private notes read-only.
- Clips feed (flattened highlights across recent recordings).
- Profile (name, email) from `/users`.

### Should have (v1.x, partially API-backed)

- On-device transcript search across cached meetings.
- "New since last open" badge by diffing the list; optional hook relay for
  real push.
- Company and recorder filters computed client-side.
- Upload a recording from the phone (paid seat).
- Read-only "Up next" from the device calendar.

### Deferred / deep-link to web (no public API)

- Comments, clip creation, transcript editing, chapters, sensitivity,
  viewers, automation sharing, Send to Slack/HubSpot/Salesforce, follow-up
  email, custom summary templates, playlists, stories, coaching/scorecards,
  trackers, recently deleted, workspace/admin settings, bot/Zoom capture,
  auto-capture rules, the "Ask anything" chat.

Each deferred item should open `recording.url` (or the relevant `/app/…`
route) in an in-app browser so the user is never stuck.

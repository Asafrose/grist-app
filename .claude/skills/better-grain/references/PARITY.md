# Feature ↔ API pairing and build status

Snapshot of our understanding as of 2025-09-05, against API version
`2025-10-31` as shown on developers.grain.com that day. The live docs are
authoritative; when they disagree with this file, fix this file.

Status values:

| Status | Meaning |
|--------|---------|
| native | Directly served by a public endpoint |
| derived | Computed on the client from public data |
| deep-link | Not in the public API; open `recording.url` or the `/app/…` route in an in-app browser |
| deferred | Out of scope for a consumption client |

## Meetings list

| Feature | Pairing | Status |
|---------|---------|--------|
| My meetings tab | list recordings; Personal API `filter.attendance` | native |
| Workspace meetings tab | list recordings, `share_state = workspace` | native |
| Team tabs | list teams, then `filter.team` | native |
| Day grouping, infinite scroll | `start_datetime`, response `cursor` | native |
| Row: thumbnail, title, time, duration | recording fields | native |
| Row: Internal/External | `meeting_type.scope`, participant scopes | derived |
| Row: company chip | external participants' email domains | derived |
| Row: recorder, participant count | `recorders[]`, `include.participants` | native |
| Recurring icon | `include.calendar_event.ical_uid` | derived |
| Filter by title | `filter.title_search` | native |
| Filter: Date | `filter.after_datetime` / `before_datetime` | native |
| Filter: Meeting type | `filter.meeting_type` + list meeting types | native |
| Filter: Team | `filter.team` | native |
| Filter: Participants, Company, Recorder, Tags | client-side over included fields | derived |
| Filter: Trackers | none | deferred |
| Up next (calendar) | none; device calendar possible for read-only | deep-link |
| Auto-capture selector | none | deferred |
| Recently deleted | none | deep-link |

## Meeting detail

| Feature | Pairing | Status |
|---------|---------|--------|
| Title read / rename | recording `title`; update recording | native |
| Date, participants, teams chips | recording fields + `include.participants` | native |
| Meeting type | `meeting_type` | native |
| Sensitivity, viewers, automation sharing | none | deep-link |
| Video / audio playback | download recording, streamed with range requests; `media_type` picks player | native |
| Speed, ±10s, PiP, background audio | native player | native |
| Chapters (labels and scrubber markers) | none | derived from template-section timestamps, or omitted |
| Action items | `include.ai_action_items` (text, status, timestamp, assignee) | native |
| Action item checkbox toggle | none | deep-link |
| Summary bullets with seek | `include.ai_summary` markdown; parse `m:ss` tokens | native |
| Template sections | `include.ai_template_sections` (json / markdown / text) | native |
| Add custom template | none | deep-link |
| Private notes read | Personal API `include.private_notes` | native |
| Private notes write | none | deep-link |
| Transcript with speakers and seek | get transcript (json: participant_id, speaker, start, end, text) | native |
| Transcript search within meeting | local over transcript json | derived |
| Transcript export | transcript `.txt` `.vtt` `.srt` | native |
| Edit transcript, change language | none | deep-link |
| Comments | none | deep-link |
| Timeline talk-time bars | aggregate transcript segments per participant | derived |
| Timeline company aggregate | group participants by email domain | derived |
| Screenshare row | `include.screenshares` (start, end, participant_id) | native |
| Clips tab | `include.highlights` (text, transcript, speakers, timestamp, duration, url, thumbnail) | native |
| Create clip | none | deep-link |
| Coaching tab | none | deferred |
| Tags add / remove | put / delete tag | native |
| Share to user / team | put / delete user, team | native |
| Share access levels, link access | none | deep-link |
| Copy link, native share sheet | `url` | native |
| Download for offline | download recording | native |
| Send to Slack / HubSpot / Salesforce, follow-up email | none | deep-link |
| Add to playlist / story | none | deep-link |
| Delete recording | none | deep-link |
| Open in Claude / ChatGPT, copy transcript for AI | transcript `.txt` + system share | derived |

## Search

| Feature | Pairing | Status |
|---------|---------|--------|
| Title search | `filter.title_search` | native |
| Transcript full-text search | none; build a local FTS index over cached transcripts | derived |
| Result snippet with seek | local index hit → segment `start` | derived |
| Filters | same as list | native / derived |
| Recent searches | local | derived |

## Updates

| Feature | Pairing | Status |
|---------|---------|--------|
| Notification feed | none | deep-link |
| "New since last open" badge | diff list of recordings | derived |
| Push notifications | hooks (`recording_added`, `highlight_added`, …) via our own relay to APNs/FCM | derived, needs a server |

## Playlists, Stories, Clips feed

| Feature | Pairing | Status |
|---------|---------|--------|
| Playlists list / detail | none | deep-link |
| Stories | hook events only, no read endpoint | deep-link |
| Workspace clips feed | list recordings with `include.highlights`, flatten | derived |

## Coaching, Ask anything, Creation

| Feature | Pairing | Status |
|---------|---------|--------|
| Coaching, scorecards, trackers | none | deferred |
| Ask anything chat | none; Grain offers MCP + official Claude/ChatGPT apps | deep-link |
| File upload from phone | upload recording (signed PUT URL, `upload_status` hook) | native, paid seat |
| Bot recording, Zoom import, desktop capture | none | deferred |

## Settings and identity

| Feature | Pairing | Status |
|---------|---------|--------|
| Sign in | Personal Access Token pasted by user | native |
| Sign in (later) | OAuth2 authorization code + PKCE; client ID from Grain | native, pending client ID |
| Profile name / email | list users | native |
| Workspace / admin settings | none | deferred |

## Known API gaps that most affect the mobile experience

1. No transcript full-text search.
2. No chapters.
3. No notifications endpoint.
4. No write access to action items, private notes, comments, clips.
5. No playlists or stories read endpoints.
6. No streaming URL; the download endpoint is the only media source.

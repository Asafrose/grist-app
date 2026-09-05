---
name: better-grain
description: Product context for better-grain, an open-source mobile client for Grain meeting recordings. Load before designing screens, touching the data layer, or deciding whether a Grain feature belongs in the app.
---

# better-grain

## Goal

Grain (grain.com) records, transcribes, and summarizes meetings. Our team
consumes those recordings mostly on phones, and Grain has no mobile app and a
poor mobile web experience. better-grain is a mobile client, built on Grain's
public API, that makes *consuming* a meeting on a phone fast and pleasant:
open the app, find the meeting, listen or watch, read the AI summary and
action items, follow the transcript, share a link.

It is a client, not a replacement. Recording, workspace admin, and
collaboration features stay in Grain. Anything the public API does not expose
deep-links back to the Grain web app rather than being reimplemented.

Constraints that shape decisions:

- Open source, personal-account project, distributed to our team via
  TestFlight or sideload first. Not sold, not published to other Grain
  customers without Grain's consent (Grain ToS 2.3(a)).
- Auth starts with a Personal Access Token pasted by the user. OAuth2 PKCE
  comes later and requires a client ID issued manually by Grain.
- Public API only. Never call grain.com's private web endpoints or scrape
  the web app (ToS 2.3(c), 2.3(i)).
- Rate limit is 300 requests/minute per token. Cache aggressively; the
  app should open instantly to the last-seen list.

## Stack

React Native with Expo, one codebase for iOS and Android. Media playback via
`expo-video` (AVPlayer / ExoPlayer underneath) for picture-in-picture,
background audio, and lock-screen controls. Distribution via EAS to TestFlight
and Play internal testing.

Companion skills vendored in this repo (see `../VENDORED.md`):

| Task | Load |
|------|------|
| Project layout, routing, native controls, tokens, data fetching | `expo-overview` and the `expo-*` skills it points to |
| RN performance and implementation rules | `vercel-react-native-skills` |
| UX and visual design decisions | `ui-ux-pro-max` (web-leaning; take its patterns, not its landing-page layouts) |
| iOS conventions (HIG, SF Symbols, Dynamic Type) | `mobile-ios-design` |
| Android conventions (Material 3) | `mobile-android-design` |
| Builds and store distribution | `eas-app-stores`, `eas-simulator` |

## References

- `references/GRAIN_APP_FEATURES.md`: what the Grain web app does today,
  screen by screen, with no API detail. This is the definition of "parity".
  Update it only when Grain's UI changes.
- `references/PARITY.md`: our current understanding of which Grain features
  map to which API capability, and what we've decided to build, derive
  client-side, or deep-link. Update it as we build and as the API grows.

## API reference is live, not vendored

Do not maintain a copy of the API docs in this repo. Before adding or
changing any API call, fetch the current reference:

```
https://developers.grain.com/
```

Read the endpoint, its params, the `include` options, and the response
schema from there. Use the `Public-Api-Version` header value shown in the
docs' examples. If the docs disagree with `PARITY.md`, the docs win; fix
`PARITY.md`.

## How to use this skill

- Designing a screen: read the matching section of
  `GRAIN_APP_FEATURES.md`, then the matching rows in `PARITY.md`. Build to
  the status in the row. Deferred items get a deep link to the recording's
  `url`, never a stub.
- Adding data access: confirm the endpoint on developers.grain.com, then
  implement. If it unlocks a deferred row, promote the row.
- Unsure whether something belongs: if it is about consuming an existing
  recording on a phone, yes. If it is about recording, admin, or
  collaboration, no.

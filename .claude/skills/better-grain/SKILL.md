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

React Native with Expo SDK 57 and Expo Router, one codebase for iOS and
Android. App display name is **Grist**, bundle `com.asafrose.grist`; the repo
stays `better-grain`. Media playback via `expo-video` (AVPlayer / ExoPlayer
underneath) for picture-in-picture, background audio, and lock-screen
controls; all three need the config plugin, so development uses a dev client
(`npx expo run:ios`), never Expo Go. Distribution via EAS to TestFlight and a
signed Android APK.

Repo is an npm-workspaces monorepo:

```
apps/mobile          Expo app, src/ layout (routes only in src/app)
packages/grain-api   HTTP client, response types, Zod schemas (also for webhook payloads)
apps/relay           (future) webhooks → push notifications; app never assumes it exists
```

Tooling: npm, oxlint + oxfmt (`npm run lint` checks both), TypeScript strict,
Vitest in `packages/*`; `jest-expo` + React Native Testing Library in `apps/mobile`
for stores and components (RNTL 14: `await render(...)`, then query via `screen`;
use `@/test/render` which wraps SafeAreaProvider). GitHub Actions on Ubuntu (lint, typecheck,
test). Maestro end-to-end flows run on the local iOS simulator, not in CI.
After `npm install`, run `npm run fix-lock`: the work machine resolves packages through a private proxy and CI cannot reach it (`npm run lint` fails on proxy URLs).
Use the Node binary at `~/.nvm/versions/node/v22*/bin` directly in
non-interactive shells; the `nvm` shell function hangs there.

## Architecture decisions

- SQLite (`expo-sqlite`, FTS5) is the source of truth. Recordings,
  participants, action items, summaries, template sections, transcripts.
  Cold open renders from the database before any network call.
- Sync: `after_datetime` incremental on foreground, weekly full reconcile of
  the 90-day window to catch renames and deletions.
- Transcripts for the last 90 days are prefetched on Wi-Fi with a small
  concurrency cap and indexed for on-device search.
- Media streams from the download endpoint; downloads happen only on an
  explicit "Download for offline" tap. Caps: 2 GB media, 30-day downloads,
  90-day index. All three are Settings rows.
- Single account per install (one PAT). OAuth2 PKCE later.
- App state lives in zustand stores under `apps/mobile/src/lib` (auth first; player and settings follow). Each store exports the hook plus a plain-function facade for use outside React. Stores hydrate themselves at module load and expose a readiness promise; the root layout suspends on it with React `use()` rather than triggering loads from effects.
- UI: NativeWind (Tailwind classes) with react-native-reusables as the component
  kit, copy-pasted into `apps/mobile/src/components/ui` and owned by us. Design
  tokens live as CSS variables in `apps/mobile/global.css` (light and dark via
  `prefers-color-scheme`) and as Tailwind theme extensions in
  `tailwind.config.js`: semantic colors (`bg-background`, `text-foreground`,
  `text-muted-foreground`, `bg-primary`, `bg-accent`, `text-external`),
  fonts (`font-jakarta`, `font-jakarta-medium/semibold/bold/extrabold`,
  `font-mono`), radii. Screens import primitives from `@/components/ui/*`
  only, never from the kit's packages directly. Compound components
  (`<Button><Text>…</Text></Button>`), no string-title props.
  `apps/mobile/src/theme` keeps only the hex palette (`useColors`) and font
  names for code that needs raw values: navigation theme, tab bar, SVG icons.
  Our own SVG icon set stays in `components/icon.tsx` (SF Symbols don't render
  on Android). `@expo/ui` for the few controls where native feel matters
  (filter bottom sheet, switches, pickers). JS `Tabs` (native tabs are alpha).
  Deferred Grain features open `recording.url` in `expo-web-browser`.
- Add kit components with `npx @react-native-reusables/cli@latest add <name>`
  from `apps/mobile`; `components.json` already points it at
  `src/components/ui`. Start Metro from `apps/mobile`, never the repo root.
- No server in v1. Grain has webhooks; a relay that turns them into push
  notifications is a later package, designed for but not built.

## Process

- Design canvas is the spec: https://claude.ai/code/artifact/6bd37fb5-2af1-4673-af72-da4c88502b8e
  (source in `design/`, regenerate with `python3 design/build.py`).
- GitHub Issues hold tasks, one per screen, milestone `v1`. Each names its
  artboard, PARITY rows, and acceptance checks. PARITY.md stays the feature
  status record.
- Three sequential foundation PRs, then screens in parallel via subagents in
  git worktrees, integrated from the main session.
- Every PR: CI green, Maestro flow on the simulator for the issue's
  acceptance checks, a simulator screenshot beside the artboard with
  deviations noted in the PR body. Asaf approves every PR for now. Squash
  merges only.
- Fixtures are recorded from the real workspace with `GRAIN_PAT` from
  `.env.local` and anonymized (names, emails, companies) before commit.
- Sentry and EAS Update arrive with the first team build, not before.

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

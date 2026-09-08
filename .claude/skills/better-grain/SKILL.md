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
use `@/test/render` which wraps SafeAreaProvider; database and sync tests use
`testDb()` from `@/test/db`, an in-memory `better-sqlite3` with the same Drizzle
schema and migrations as the device). Coverage is enforced per file: every
module under `apps/mobile/src/lib` and `packages/grain-api/src` must reach 80%
statements/functions/lines and 60% branches or `npm test` fails (thresholds in
`jest.config.js` and `vitest.config.ts`). A new `lib` module ships with its
`.test.ts` sibling; screens and components are verified with RNTL where they
carry logic and with Maestro flows otherwise. GitHub Actions on Ubuntu (lint, typecheck,
test). Maestro end-to-end flows run on the local iOS simulator, not in CI.
The repo-level `.npmrc` pins `registry.npmjs.org`, so a machine whose global npm config points at a private proxy still writes public URLs into `package-lock.json`.
Use the Node binary at `~/.nvm/versions/node/v22*/bin` directly in
non-interactive shells; the `nvm` shell function hangs there.

## Architecture decisions

- SQLite (`expo-sqlite`, FTS5) is the source of truth, accessed through
  Drizzle ORM (`drizzle-orm/expo-sqlite`, sync mode). The schema in
  `apps/mobile/src/lib/db/schema.ts` is the single source of truth for row
  types (`RecordingRow`, `RecordingDetail`, …). Migrations are generated with
  `npx drizzle-kit generate` from `apps/mobile` into `apps/mobile/drizzle/`
  (bundled via `babel-plugin-inline-import`; FTS5 virtual tables live in a
  `--custom` migration because Drizzle does not model them) and applied at
  module load in `lib/db/open.ts`. Queries are plain functions in
  `lib/db/*.ts` taking a `Db`. Search goes through `searchRecordings` /
  `searchTranscripts` (FTS5 prefix queries, snippets with segment start times).
- Data access (`lib/data/`): `Db` never leaves `src/lib`. Screens and
  components import only from `@/lib/data`, which exports typed hooks per
  domain (`useRecordings(filter)`, `useRecording(id)`, `useTranscript(id)`,
  `useClips(filter)`, `useTeams()`, `useSearch(q, segment)`,
  `useRecentSearches()`, `useWorkspace()`, `useIndexStats()`,
  `useStorageStats()`, `useRecordingCount(filter)`, option hooks) plus
  write facades (`recordings.refresh`, `recentSearches.add/clear`,
  `transcriptIndex.clear`) that resolve the db themselves and bump the
  library version. Row types are re-exported from there too. Internally
  `useLive(make, deps)` wraps `useLiveQuery` + `useLibraryVersion`, and
  `useSnapshot(read, deps)` memoizes a synchronous read on the version.
  An oxlint `no-restricted-imports` override rejects `@/lib/db`,
  `drizzle-orm`, `@/lib/workspace`, `@/lib/storage`, `@/lib/sync`,
  `@/lib/recent-searches` and `useDb` from `src/screens`, `src/components`
  and `src/app`. To add data access: write the query in `lib/db/*.ts`, wrap
  it in a hook (or facade) in `lib/data/<domain>.ts`, export from
  `lib/data/index.ts`, cover it in `lib/data/data.test.tsx`.
  SQLite stays the store: screens only ever read the database, so a
  request cache is not a data layer here. TanStack DB was evaluated and
  rejected: in-memory collections and no FTS.
- Network layer (`lib/query.ts`): one module-level `QueryClient` (so
  non-React code can call `queryClient.fetchQuery`), mounted as
  `QueryClientProvider` in the root layout. Defaults: retry twice with
  capped exponential backoff, never on a 401/403, `refetchOnWindowFocus`
  off (foreground refresh is explicit). `focusManager` is fed by AppState
  and `onlineManager` by `expo-network`. Every network call in `src/lib`
  goes through it: `library.refresh` (`["library", token]`, staleTime 60s
  — the sync scheduler: dedupe, retry and the stale window come from the
  client, `force` invalidates then fetches, and a `focusManager`
  subscription refreshes on foreground), `mediaUrl(id, token)` in
  `lib/media-url.ts` (`["media-url", token, id]`, staleTime 45 min under
  the ~1h signed-URL expiry, `gcTime` 1h, `invalidateMediaUrl(id)` for
  error recovery), `resolveMe` (`["me", token]`, staleTime `Infinity`,
  dropped by `resetMe`), `syncWorkspace` (`["workspace", token]`,
  in-flight dedupe only), and `recordings.refresh` as a `MutationObserver`
  mutation. To add an API call: read → `queryClient.fetchQuery` (or
  `useQuery` in a screen) keyed `[domain, token, …id]` with the staleTime
  next to the query, since the token is part of the key sign-out just
  removes the queries; write → a mutation so retry is inherited. Query
  state, not zustand, holds sync status: `useSyncStatus`/`useSyncError`
  derive from the library query, while `libraryStore` keeps only `db` and
  `version` (the change signal for SQLite readers).
- Sync (`lib/sync.ts`, pure functions over `Db` + the recordings API):
  `after_datetime` incremental with a 2-day overlap on every foreground,
  full reconcile of the 90-day window every 7 days (deletes local rows the
  API no longer returns, prunes rows older than 90 days). `library.refresh()`
  in `lib/library.ts` orchestrates it, debounced to once a minute unless forced.
  Sign-out wipes the database.
- Transcripts for the last 90 days are prefetched on Wi-Fi (`expo-network`)
  with concurrency 2 after each sync and indexed for on-device search.
- Playback: one module-level `expo-video` player in `lib/player.ts`
  (`staysActiveInBackground`, `showNowPlayingNotification`; app.json plugin
  enables background audio + PiP). Screens call the `playback` facade
  (`load`, `toggle`, `seekBy`, `setRate`, `stop`) and read atomic hooks
  (`useNowPlaying`, `usePlaybackPosition`, …).
  Media URLs are resolved per play via `recordings.resolveMediaUrl` (signed
  CloudFront URL); `<PlayerView>` renders the shared `VideoView`. There is no
  expanded Now Playing screen: the meeting screen is the full player, and the
  mini player navigates to it.
- Media streams from the download endpoint; downloads happen only on an
  explicit "Download for offline" tap. Caps: 2 GB media, 30-day downloads,
  90-day index. All three are Settings rows.
- Single account per install (one PAT). OAuth2 PKCE later.
- App state lives in zustand stores under `apps/mobile/src/lib`, one per domain (auth, library, filters, player, settings, thumbnails). Every store follows the same shape (see the `zustand` skill for the rules behind it):
  - `export const fooStore = create<FooState>(() => initial)` holds **state only**, no functions. It is imported only inside `src/lib` and in tests; an oxlint `no-restricted-imports` override rejects `*Store` imports from `src/screens`, `src/components` and `src/app`.
  - **React Compiler is on** (`experiments.reactCompiler` in app.json). It only
    treats `use*`-named calls as hooks, so a hook body must never call the bound
    store directly (`fooStore((s) => s.x)` gets memoized as a pure call and
    zustand's internal hooks vanish on re-render, crashing with a hooks-order
    error). Always read through `useStore(fooStore, selector)` from `zustand`.
    Jest does not run the compiler, so this class of bug only shows on device:
    run the app after any change to hooks.
  - Reads go through exported atomic hooks, one value each: `useNowPlaying()`, `usePlaybackPosition()`, `useSyncStatus()`, `useSetting("playbackRate")`. Never `fooStore()` with no selector. The one whole-snapshot hook is `useFilters()`, because every field feeds the same query.
  - Writes go through a plain-object facade (`auth`, `library`, `filters`, `playback`, `settings`, `thumbnails`) usable outside React. Batch related fields in one `setState`; `library` bumps `version` in the same call as the status change.
  - Derived values are not mirrored: playback rate lives in settings and the player subscribes to it.
  - Components that show high-frequency values (player position) are split so only the leaf subscribes: `Progress` in the player card, `Clock`/`ProgressFill` in the mini player, `LiveScrubber` in the fullscreen screen.
  Stores hydrate themselves at module load and expose a readiness promise; the root layout suspends on it with React `use()` rather than triggering loads from effects.
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
  deviations noted in the PR body. Screenshots attached to PRs must never
  show real workspace data (meeting titles, names, summaries): capture them
  from sign-in, empty states, or the demo account, never from the real
  account. Demo account: in dev builds the sign-in screen has a "Use demo
  data" button (`testID demo-sign-in`) that signs in with the token `demo`;
  `lib/library.ts` then seeds `lib/demo.ts` fixtures (24 anonymized
  recordings with transcripts, spread over 90 days) instead of syncing, and
  the player streams Apple's public sample HLS instead of Grain media. Maestro
  flows that need data should use it (`.maestro/demo.yaml`) so they run
  without `GRAIN_PAT`. Asaf approves every PR for now. Squash merges only.
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

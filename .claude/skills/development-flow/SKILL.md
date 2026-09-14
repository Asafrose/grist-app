---
name: development-flow
description: How work moves through this repo - issue, implementer subagent in a worktree, adversarial review, local CI, device verification, risk evaluation, squash merge. Load at the start of any task in this repo, before spawning implementers or merging anything.
---

# Development flow

Written for the orchestrating session: the one checkout with Metro, the
simulator and the emulator attached. Implementers and reviewers are subagents
and never touch that checkout.

## 1. One issue per unit of work

Before any code, file a GitHub issue. Body has three sections:

- **Problem** - what is wrong or missing today, with the file or screen.
- **Expected** - the behaviour after the change.
- **Acceptance** - checkable statements: the assertions a test or a Maestro flow will make, and the screens to verify.

Keep an issue to something one agent can finish in one pass. Split anything that
touches two screens plus the data layer.

## 2. Implementer subagents

One agent per issue, in its own worktree, so parallel work cannot collide:

```
Agent({
  name: "impl-<issue>",
  subagent_type: "general-purpose",
  model: "opus",
  isolation: "worktree",
  description: "Implement #<n>",
  prompt: <implementer skeleton below>,
})
```

The agent branches from `origin/main`, runs every check **from its own worktree
root** (not the main checkout), and opens the PR itself.

### Implementer prompt skeleton

```
Implement GitHub issue #<n> in this worktree.

Read first: .claude/skills/better-grain/SKILL.md, .claude/skills/development-flow/SKILL.md,
and whichever of video-playback / zustand / expo-* apply to the files you touch.

Start from origin/main: git fetch origin && git checkout -B <branch> origin/main.

Scope: only what the issue asks. No drive-by refactors, no new dependencies
without saying why in the PR body.

Conventions (non-negotiable, see the Conventions section of development-flow):
no code comments unless a constraint genuinely cannot be carried by a name, a
type or a test; no lint exemptions - fix the code or rename; zustand stores hold
state only and are read through useStore(store, selector); no import cycles;
apps/mobile/src/app is routes-only; Maestro flows use explicit swipes, regex
ids, and platform splits for hideKeyboard/back.

Before pushing, from THIS worktree root:
  npm ci  (only if node_modules is missing)
  npm run lint
  npm run typecheck
  npm test
All three must exit 0. Coverage gates are part of npm test.

Then push and open a PR with gh pr create. Body sections: Summary, Changes,
Tests, and a final line "Closes #<n>".

Report: branch name, PR number, what you changed, anything you could not do.
```

## 3. Adversarial review

Every PR gets an independent reviewer that did not write the code:

```
Agent({
  name: "review-<pr>",
  subagent_type: "reviewer",   // resolves .claude/agents/reviewer.md
  model: "opus",
  description: "Review PR #<n>",
  prompt: <reviewer skeleton below>,
})
```

The reviewer follows `.claude/agents/reviewer.md`: it works from a fresh clone
under a temp directory, verifies each claim in the PR body against the diff and
the sources, tries to break the change, posts exactly one
`gh pr review <n> --comment`, and reports a verdict.

### Reviewer prompt skeleton

```
Adversarially review PR #<n> in Asafrose/grist-app, following
.claude/agents/reviewer.md exactly.

Work only in a fresh clone under a temp directory. Never edit, check out, or
run anything in the shared checkout.

Verify the PR body's claims against the diff and the code it touches, run
lint / typecheck / test in your clone on the PR head, and actively look for
ways the change breaks: error and empty states, Android vs iOS, offline,
sign-out, re-render loops, import cycles, missing tests for new lib modules.

Post one review comment with gh pr review <n> --comment, then report:
  Verdict: merge-safe | changes-required
  Blocking: numbered, each with file:line and why it is wrong
  Non-blocking: numbered
```

## 4. Review-fix loop

The orchestrator relays blocking items to the implementer with `SendMessage`
(the implementer's worktree and context are still alive), waits for the push,
then sends the reviewer the delta to re-review - not the whole PR again. Repeat
until the verdict is merge-safe. If reviewer and implementer disagree twice on
the same point, decide it yourself and record the decision in the PR thread.

## 5. Local CI

GitHub Actions runs lint, typecheck and test on Ubuntu (`ci`), and the Maestro
suites natively (`e2e`): `e2e-ios` on `macos-26` and `e2e-android` on Ubuntu.
`ci` is the only required check today; `e2e-ios` reports on every PR and
becomes required after five consecutive green runs on main across at least
three PRs; `e2e-android` stays advisory until the emulator is stable. Both
build the debug app, start Metro, warm the bundle and run
`scripts/maestro-suite.sh`; on failure they upload `~/.maestro/tests` and the
Metro log.

Before merging, run the same three locally on the PR head rebased over current
main, so a stale branch cannot break main:

```
git fetch origin
git checkout <branch> && git rebase origin/main
npm run lint && npm run typecheck && npm test
```

`npm test` enforces per-file coverage in `apps/mobile/src/lib` and
`packages/grain-api/src`. A new `lib` module without its `.test.ts` fails here.

## 6. Device verification (orchestrator only)

Only the orchestrating session has Metro, the simulator and the emulator. Never
ask a subagent to run Maestro.

1. Check the PR head out in the main checkout.
2. Restart Metro (`npx expo start --port 8081 -c` from `apps/mobile`) and relaunch both apps. Rebuild with `expo run:*` if native config changed.
3. iOS: `MAESTRO_DEVICE=<udid> ./scripts/maestro-suite.sh` from `apps/mobile` - one flow at a time, each retried once on failure.
4. Android: `./scripts/maestro-android.sh` from `apps/mobile` - the same suite against `emulator-5554`, restarting adb and re-running `adb reverse` before each retry.
5. Do not touch the working tree while a suite runs.
6. Rerun any failing flow on its own before calling it a real failure; flakes are common in list recycling and sheet dismissal.

Record in the PR: which flows passed on which platform, and any screenshot.
Screenshots come from demo fixtures only - never real workspace data.

## 7. Risk evaluation

An independent agent reads the PR, the review thread and the verification
evidence, and answers `merge-now` or `needs-human` with reasons:

```
Agent({
  name: "risk-<pr>",
  subagent_type: "risk-evaluator",   // resolves .claude/agents/risk-evaluator.md
  model: "opus",
  description: "Risk for #<n>",
  prompt: <risk skeleton below>,
})
```

### Risk evaluator prompt skeleton

```
Evaluate merge risk for PR #<n> in Asafrose/grist-app, following
.claude/agents/risk-evaluator.md.

Inputs: the PR diff and body, the reviewer's posted review and final verdict,
the local CI result, and the device verification notes below.
<paste verification notes>

Answer merge-now or needs-human, with reasons tied to specific files. Apply the
needs-human rules in the agent definition.
```

Always `needs-human`: product or UX decisions, database migrations, native
config (app.json, plugins, entitlements, Gradle/Podfile), auth and token
handling, anything touching credentials or the lockfile registry.

## 8. Merge

Merge only when all four hold: reviewer says merge-safe, local CI is green on
the rebased head, both device suites pass, and the risk evaluator says
merge-now.

```
gh pr merge <n> --squash --delete-branch
```

Then: return the main checkout to `main`, pull, relaunch both apps, remove the
implementer's worktree and branch (`git worktree remove`, `git branch -D`), and
confirm the issue closed.

## Conventions

- No code comments by default. A name, a type or a test carries it. When one is genuinely needed, one line naming the specific thing.
- No lint exemptions. No `eslint-disable`, no `oxlint-disable`, no `any`, no widening an ignore list. Fix the code or rename the symbol.
- Zustand stores hold state only, no functions. Read with `useStore(store, selector)`; write through the domain facade. React Compiler makes a direct bound-store call in a hook body crash at runtime, not in Jest.
- `import/no-cycle` is an error. `lib/library.ts` must not import `lib/player.ts` or `lib/data/*`.
- `apps/mobile/src/app` is routes-only: no tests, no helpers - expo-router registers every file there.
- Maestro: explicit swipes rather than `scroll` where position matters, regex ids for generated rows, `runFlow` + `when: platform:` for `hideKeyboard` and back navigation, and no edits to the tree during a run.
- Screenshots come from demo fixtures (`demo-sign-in`, `.maestro/demo.yaml`) only.
- Never commit a lockfile whose URLs point at a private registry mirror.
- Nothing company-specific in the repo: no internal hostnames, proxy URLs, employer names, customer or meeting names, personal emails.

## Related skills

`dev-env` for machine setup and the verify commands; `better-grain` for product
and architecture; `video-playback` for playback; `zustand` for stores;
`expo-overview` and the other `expo-*` skills for framework questions.

# Vendored skills

Copied verbatim from upstream on 2025-09-05. To update, re-copy the directory
from the upstream path at a newer commit and bump the row.

| Directory | Upstream | Path in upstream | Commit |
|-----------|----------|------------------|--------|
| expo-overview, expo-project-structure, expo-router, expo-animation, expo-native-ui, expo-design-system, expo-ui, expo-data-fetching, expo-dev-client, expo-upgrade, eas-app-stores, eas-simulator | github.com/expo/skills | `plugins/expo/skills/<name>` | d0075ff |
| react-native-skills | github.com/vercel-labs/agent-skills | `skills/react-native-skills` | 063bee9 |
| ui-ux-pro-max | github.com/nextlevelbuilder/ui-ux-pro-max-skill | `.claude/skills/ui-ux-pro-max` | f3ac195 |
| mobile-ios-design, mobile-android-design | github.com/wshobson/agents | `plugins/ui-design/skills/<name>` | a30778f |

Deliberately not vendored from expo/skills: expo-dom, expo-web-to-native,
expo-module, expo-brownfield, expo-app-clip, expo-examples,
expo-skill-feedback (telemetry), eas-hosting, eas-workflows, eas-observe,
eas-update, eas-update-insights. Add them if the need appears.

First-party, not vendored: `better-grain`, `dev-env`, `development-flow`, and
the agent definitions in `.claude/agents/` (`reviewer`, `risk-evaluator`).

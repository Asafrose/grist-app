# Grist

An open-source mobile client for [Grain](https://grain.com) meeting recordings.
Listen to recordings, read AI notes and action items, follow transcripts, and
search across meetings from your phone. Built with React Native and Expo on
Grain's public API.

Grist is not affiliated with Grain. It is a client you bring your own Grain
account to.

## Layout

```
apps/mobile         Expo app (iOS and Android)
packages/grain-api  Typed client and schemas for the Grain public API
design/             Design canvas source (see design/build.py)
.claude/skills/     Project context and vendored agent skills
```

## Develop

```
npm install
npm run typecheck
npm run lint
cd apps/mobile && npx expo start
```

Sign in with a Grain personal access token from
Account settings → Integrations → Personal API.

## License

MIT

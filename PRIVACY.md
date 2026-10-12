# Grist privacy policy

Effective date: October 12, 2026

Grist is an open-source, unofficial mobile client for [Grain](https://grain.com). It is not affiliated with Grain. This policy describes what the app does with your data. The source code is public at https://github.com/Asafrose/grist-app, so every statement here can be checked against it.

## What the developer collects

Nothing. The developer runs no servers and receives no data from the app. Grist contains no analytics, crash reporting, advertising or tracking SDKs, and it does not track you across apps or websites.

## Who the app talks to

- **Grain.** The app calls Grain's API at `api.grain.com` to load your meetings, transcripts, summaries, highlights and action items, and to make changes you ask for (renaming a meeting or changing its tags). Recordings and thumbnail images are loaded from the addresses Grain's API returns.
- **Apple's sample video server.** Only in demo mode, the app plays a public sample video from `devstreaming-cdn.apple.com`. Demo mode sends no account data.
- **Links you open.** Tapping a link such as "Open Grain settings", "Source code" or "Privacy policy" opens that page in the in-app browser.

The app does not share your data with anyone else.

## Your Grain access token

You sign in with a Grain personal access token. The token is stored on your device in the iOS Keychain or the Android Keystore (through `expo-secure-store`). On iOS it is stored as device-only, so it is not included in backups restored to another device. The token is sent only to Grain's API at `api.grain.com`.

## Data stored on your device

- **Meeting cache.** Meeting details, participants, transcripts, summaries, highlights, action items, playback positions, recently opened meetings, recent searches and the transcript search index are kept in an SQLite database on the device so the app works quickly and offline.
- **Downloads.** Recordings you download are saved in the app's own storage on the device.
- **Thumbnails.** Preview images are cached in the app's cache folder.
- **Preferences.** Your app settings (such as playback speed and download limits) are kept in the same database.

None of this leaves your device except as requests to Grain described above.

## Signing out and deleting your data

Signing out (Settings → Sign out):

- deletes the access token from the Keychain or Keystore;
- deletes the cached meetings, transcripts, summaries, playback positions, recent searches and search index from the database;
- deletes downloaded recordings and generated thumbnails.

Your app preferences are kept so they apply the next time you sign in. Images cached by the system image loader may remain until the operating system clears them.

To remove everything, delete the app. This removes all data the app stored on your device.

To stop the app from accessing your Grain account, revoke the personal access token in your Grain settings.

## Data held by Grain

Your recordings and meeting data live in your Grain account. Grain's own privacy policy governs how Grain handles that data.

## Children

Grist is a tool for people who already have a Grain account. It is not directed at children and does not knowingly collect data from anyone.

## Changes to this policy

Changes are published in this file in the public repository, with a new effective date. The file's history on GitHub shows every change.

## Contact

Questions or concerns: open an issue at https://github.com/Asafrose/grist-app/issues.

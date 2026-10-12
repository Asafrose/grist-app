# Grist privacy policy

Effective date: October 12, 2026

Grist is an open-source, unofficial mobile client for [Grain](https://grain.com). It is not affiliated with Grain. This policy describes what the app does with your data. The source code is public at https://github.com/Asafrose/grist-app, so every statement here can be checked against it.

## What the developer collects

Nothing. The developer runs no servers and receives no data from the app. Grist contains no analytics, crash reporting, advertising or tracking SDKs, and it does not track you across apps or websites.

## Who the app talks to

- **Grain.** The app calls Grain's API at `api.grain.com` to load your profile, your workspace (members, teams and meeting types) and your meetings, transcripts, summaries, highlights and action items, and to make changes you ask for (renaming a meeting or changing its tags). Recordings and thumbnail images are loaded from the addresses Grain's API returns.
- **Apple's sample video server.** Only in demo mode, the app plays a public sample video from `devstreaming-cdn.apple.com`. Demo mode sends no account data.
- **Links you open.** Tapping a link such as "Open Grain settings", "Source code" or "Privacy policy" opens that page in the in-app browser.

The app does not share your data with anyone else, except where you choose to share it yourself, for example through the share sheet or by copying text.

## Your Grain access token

You sign in with a Grain personal access token, stored on your device through `expo-secure-store`. On iOS it is kept in the Keychain as device-only, so it cannot be restored to another device. On Android it is encrypted with a key held in the Android Keystore, which does not leave the device. The token is sent only to Grain.

## Data stored on your device

- **Account and workspace.** Your own name and email, and your Grain workspace directory: members' names and emails, teams and meeting types.
- **Meeting cache.** Meeting details, participants, transcripts, summaries, highlights, action items, playback positions, recently opened meetings, recent searches and the transcript search index.
- **Downloads.** Recordings you download, saved in the app's own storage.
- **Images.** Generated preview frames, and thumbnails from Grain kept in the app's image cache.
- **Preferences.** Your app settings, such as playback speed and download limits.

The account, workspace, meeting cache and preferences are kept in an SQLite database on the device so the app works quickly and offline. The operating system's network cache may also hold recent responses from Grain.

If device backups are turned on, the database and downloads may be included in your iCloud or Google backups, under Apple's or Google's terms. Apart from that and the requests to Grain described above, this data stays on your device.

## Signing out and deleting your data

Signing out (Settings → Sign out) deletes:

- the access token;
- your cached profile, the workspace directory, meetings, transcripts, summaries, playback positions, recent searches and search index;
- downloaded recordings and generated preview frames.

Deletion is best effort: a file that is in use at that moment may remain until the next clear. Your app preferences are kept so they apply the next time you sign in. Thumbnails in the app's image cache and responses in the system network cache may remain until they expire or the operating system clears them.

To remove everything, sign out first, then delete the app. On iOS, deleting the app without signing out can leave the token in the Keychain, and a reinstall signs back in with it.

To stop the app from accessing your Grain account at any time, revoke the personal access token in your Grain settings.

## Data held by Grain

Your recordings and meeting data live in your Grain account. Grain's own privacy policy governs how Grain handles that data.

## Children

Grist is a tool for people who already have a Grain account. It is not directed at children and does not knowingly collect data from anyone.

## Changes to this policy

Changes are published in this file in the public repository, with a new effective date. The file's history on GitHub shows every change.

## Contact

Questions or concerns: open an issue at https://github.com/Asafrose/grist-app/issues.

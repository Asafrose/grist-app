---
name: video-playback
description: Rules for media playback in this app with expo-video (streaming, downloads, preload, buffering, posters, errors, metrics). Load before touching lib/player.ts, the player card, fullscreen, downloads or anything that creates a VideoPlayer.
---

# Video playback

Distilled from the expo-video docs, Expo's launch post, Mux's React Native guide, and field reports on caching. Product decisions for this app are marked **(decision)**.

## Sources of media

- **(decision)** Play the local download when one exists, otherwise stream the resolved URL. No player-level cache, no pre-buffer runner. The cache was tried (#128/#132) and dropped: it cannot serve HLS on iOS at all, cache keys are signed URLs that rotate, stalled cached loads need a fallback, and the measured gain was seconds to about a second, not the sub-300 ms target.
- Pre-resolving signed media URLs after a sync (#126) is the cheap win that stays: it removes one round trip at play time and has no playback side effects.
- HLS (`.m3u8`) and MP4 both play through the same code path. Never branch on the container except to refuse features the platform lacks (HLS cannot be cached on iOS; DRM cannot be cached anywhere).

## One player, many surfaces

- Keep a single module-level `VideoPlayer` for the app's "now playing" recording. The card, fullscreen and the mini player attach `VideoView`s to it; the video keeps playing across navigation.
- iOS allows several `VideoView`s on one player; Android does not (expo/expo#35012). Only one surface may be mounted at a time on Android, so hand the surface over (unmount first, then mount) rather than overlapping.
- Anything created with `createVideoPlayer` must be `release()`d. Prefer `useVideoPlayer` for view-scoped players. Cache size and cache clearing calls only work while no player instance exists, another reason not to depend on them.

## Entering a meeting must never start playback

- Opening a screen preloads the current recording paused at its resume point (`load(rec, { at, autoplay: false })`) so the frame and position are visible before the first tap. The only things that call `play()` are explicit user actions: the play button, a seek chip, a clip card, a `?t=` deep link from search or clips, the mini player.
- Every asynchronous re-load path (re-resolve after an error, swapping to a finished download, restoring after `replaceAsync`) must carry the *intent* captured at load time, never derive autoplay from the store's `playing` flag mid-transition.
- Pin this with tests: preload, preload then error then re-resolve, preload then download completes — none may call `play()`.

## Position, seeking and the end of media

- Restore positions from the recording's saved position; treat a position within a margin of the end as finished and start over.
- Clamp seeks to the real source duration minus a small epsilon; a paused player parked exactly on its last frame never returns to `readyToPlay` on iOS.
- Metadata duration and media duration can differ. Trust `sourceLoad` for the media's duration and keep the metadata value only for display before load.

## Buffering

- Leave `bufferOptions` at platform defaults unless a measured stall says otherwise. iOS decides its forward buffer itself when `preferredForwardBufferDuration` is 0; Android defaults to 20 s with a 2 s `minBufferForPlayback`. Set the whole `BufferOptions` object at once, before the source loads.
- Do not build "pre-buffer the first minute" features on top of the player cache. If instant start becomes a requirement again, the supported pattern is a second `VideoPlayer` that loads the next source while the current one plays, then swapping views, and it should only run on Wi-Fi.
- Never autoplay or prefetch on cellular without the user asking.

## Poster and first frame

- Show the recording's thumbnail as the poster in every pre-frame state: not loaded, loading, paused at a resume point before a frame rendered. Fade it out on the view's `onFirstFrameRender`, not on `status === "ready"`, and keep it keyed by recording id.
- Use the same thumbnail source as the list row so the card and the list agree; fall back to neutral artwork when there is none.

## Errors and retries

- `statusChange` with `error` on a streamed source usually means an expired signed URL: invalidate the cached URL, re-resolve once with backoff, and cap attempts. Surface a retry affordance instead of looping.
- Classify messages for the user: network versus not available versus expired link. Do not swallow rejections; log them in dev.

## Fullscreen, background, PiP

- Fullscreen is a route presenting another `VideoView` on the same player. Release the fullscreen surface before the dismiss animation so the card reclaims it during the fade. Guard double taps, hardware back and deep links straight into the route.
- Background audio needs `staysActiveInBackground` plus the `supportsBackgroundPlayback` plugin option; PiP needs `allowsPictureInPicture` on the view and the plugin option, and only one player can be in PiP.

## Measure before optimising

- Keep the dev-only perf marks: time to first frame (`media-load` → first `timeUpdate`), fullscreen enter/exit surface marks. Read them from Metro. Numbers belong in the PR, and only paused playback gives usable UI-automation timings.
- Simulator and device differ for media; verify media changes on a device or at least with a real workspace, not only the demo fixtures (the demo stream is HLS, most real recordings are MP4).

## References

- expo-video API: https://docs.expo.dev/versions/latest/sdk/video/
- expo-video introduction and preload pattern: https://expo.dev/blog/expo-video-a-simple-powerful-way-to-play-videos-in-apps
- Mux, video playback in React Native: https://www.mux.com/docs/frameworks/react-native-video-playback
- iOS HLS caching field report: https://monisankarnath.dev/blog/expo-video-offline-caching/
- Mobile streaming efficiency: https://www.infoq.com/articles/building-efficient-mobile-streaming-apps

## Related skills

- `better-grain` - product and architecture context
- `dev-env` - machine setup, dev clients, simulators, Maestro
- `development-flow` - how a change gets reviewed, verified and merged
- `zustand` - store shape for the player facade and its atomic hooks

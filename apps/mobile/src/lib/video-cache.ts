import {
  clearVideoCacheAsync,
  setVideoCacheSizeAsync,
  type VideoMetadata,
  type VideoSource,
} from "expo-video";

export const VIDEO_CACHE_BYTES = 512 * 1024 ** 2;

const MANIFEST_EXTENSIONS = [".m3u8", ".m3u", ".mpd", ".ism"];

export function isStreamedUri(uri: string): boolean {
  return /^https?:/i.test(uri);
}

// The player cache cannot read HLS on iOS: a cached manifest source never leaves the loading
// state instead of falling back, so adaptive streams are always loaded uncached.
export function isCacheableUri(uri: string): boolean {
  if (!isStreamedUri(uri)) return false;
  const path = uri.split(/[?#]/)[0].toLowerCase();
  return !MANIFEST_EXTENSIONS.some((ext) => path.endsWith(ext));
}

export function cachedSource(uri: string, metadata?: VideoMetadata): VideoSource {
  return { uri, metadata, useCaching: isCacheableUri(uri) };
}

export function uncachedSource(uri: string, metadata?: VideoMetadata): VideoSource {
  return { uri, metadata, useCaching: false };
}

export function configureVideoCache(): Promise<void> {
  return setVideoCacheSizeAsync(VIDEO_CACHE_BYTES);
}

export function clearVideoCache(): Promise<void> {
  return clearVideoCacheAsync();
}

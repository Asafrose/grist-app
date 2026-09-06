import { create } from "zustand";
import { type Db, getMeta, setMeta } from "@/lib/db";

export const PLAYBACK_RATES = [1, 1.2, 1.5, 1.7, 2, 2.2, 2.5] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export function isPlaybackRate(value: unknown): value is PlaybackRate {
  return (PLAYBACK_RATES as readonly unknown[]).includes(value);
}

export const KEEP_DOWNLOADS_DAYS = [7, 30, 90] as const;
export type KeepDownloadsDays = (typeof KEEP_DOWNLOADS_DAYS)[number];

const GB = 1024 ** 3;
export const DOWNLOAD_CAPS_BYTES = [1 * GB, 2 * GB, 5 * GB] as const;
export type DownloadCapBytes = (typeof DOWNLOAD_CAPS_BYTES)[number];

export type Settings = {
  playbackRate: PlaybackRate;
  audioOnlyOnCellular: boolean;
  pictureInPicture: boolean;
  keepDownloadsDays: KeepDownloadsDays;
  downloadCapBytes: DownloadCapBytes;
};

export const DEFAULT_SETTINGS: Settings = {
  playbackRate: 1,
  audioOnlyOnCellular: false,
  pictureInPicture: true,
  keepDownloadsDays: 30,
  downloadCapBytes: 2 * GB,
};

export const SETTINGS_META_KEYS: Record<keyof Settings, string> = {
  playbackRate: "playback_rate",
  audioOnlyOnCellular: "audio_only_on_cellular",
  pictureInPicture: "picture_in_picture",
  keepDownloadsDays: "keep_downloads_days",
  downloadCapBytes: "download_cap_bytes",
};

const oneOf =
  <T>(allowed: readonly T[]) =>
  (v: unknown): v is T =>
    allowed.includes(v as T);

const validators: { [K in keyof Settings]: (v: unknown) => v is Settings[K] } = {
  playbackRate: oneOf(PLAYBACK_RATES),
  audioOnlyOnCellular: (v): v is boolean => typeof v === "boolean",
  pictureInPicture: (v): v is boolean => typeof v === "boolean",
  keepDownloadsDays: oneOf(KEEP_DOWNLOADS_DAYS),
  downloadCapBytes: oneOf(DOWNLOAD_CAPS_BYTES),
};

const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export function readSettings(db: Db): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const key of keys) {
    const raw = getMeta(db, SETTINGS_META_KEYS[key]);
    if (raw === null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (validators[key](parsed)) (out as Record<keyof Settings, unknown>)[key] = parsed;
  }
  return out;
}

export function writeSettings(db: Db, s: Settings): void {
  for (const key of keys) setMeta(db, SETTINGS_META_KEYS[key], JSON.stringify(s[key]));
}

export const useSettings = create<Settings>(() => DEFAULT_SETTINGS);

let store: Db | null = null;

export function hydrateSettings(db: Db): void {
  store = db;
  useSettings.setState(readSettings(db));
}

export function persistSettings(): void {
  if (store) writeSettings(store, useSettings.getState());
}

function set<K extends keyof Settings>(key: K, value: Settings[K]): void {
  useSettings.setState({ [key]: value } as Pick<Settings, K>);
  if (store) setMeta(store, SETTINGS_META_KEYS[key], JSON.stringify(value));
}

export const settings = {
  set,
  get: () => useSettings.getState(),
  hydrate: hydrateSettings,
  persist: persistSettings,
};

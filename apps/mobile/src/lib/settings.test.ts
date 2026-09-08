import { getMeta, setMeta } from "@/lib/db";
import {
  DEFAULT_SETTINGS,
  hydrateSettings,
  persistSettings,
  readSettings,
  SETTINGS_META_KEYS,
  settings,
  settingsStore,
  writeSettings,
} from "@/lib/settings";
import { testDb } from "@/test/db";

beforeEach(() => {
  settingsStore.setState(DEFAULT_SETTINGS);
});

describe("settings store", () => {
  it("starts with defaults and reads defaults from an empty database", () => {
    expect(settingsStore.getState()).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(testDb())).toEqual(DEFAULT_SETTINGS);
  });

  it("hydrates persisted values and ignores invalid or corrupt ones", () => {
    const db = testDb();
    setMeta(db, SETTINGS_META_KEYS.playbackRate, "1.5");
    setMeta(db, SETTINGS_META_KEYS.keepDownloadsDays, "45");
    setMeta(db, SETTINGS_META_KEYS.downloadCapBytes, "not json");
    hydrateSettings(db);
    expect(settingsStore.getState()).toEqual({ ...DEFAULT_SETTINGS, playbackRate: 1.5 });
  });

  it("ignores a setting key that is no longer supported", () => {
    const db = testDb();
    setMeta(db, "audio_only_on_cellular", "true");
    hydrateSettings(db);
    expect(settingsStore.getState()).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it("writes through to meta on set and exposes the current value", () => {
    const db = testDb();
    hydrateSettings(db);
    settings.set("playbackRate", 2);
    settings.set("pictureInPicture", false);
    settings.set("downloadCapBytes", 1024 ** 3);
    expect(settings.get()).toMatchObject({
      playbackRate: 2,
      pictureInPicture: false,
      downloadCapBytes: 1024 ** 3,
    });
    expect(getMeta(db, SETTINGS_META_KEYS.playbackRate)).toBe("2");
    expect(getMeta(db, SETTINGS_META_KEYS.pictureInPicture)).toBe("false");
    expect(readSettings(db)).toEqual(settings.get());
  });

  it("persist rewrites every key so preferences survive a database wipe", () => {
    const db = testDb();
    hydrateSettings(db);
    settings.set("keepDownloadsDays", 90);
    db.run("DELETE FROM meta");
    expect(readSettings(db)).toEqual(DEFAULT_SETTINGS);
    persistSettings();
    expect(readSettings(db)).toEqual({ ...DEFAULT_SETTINGS, keepDownloadsDays: 90 });
  });

  it("writeSettings round-trips a full settings object", () => {
    const db = testDb();
    const custom = {
      ...DEFAULT_SETTINGS,
      playbackRate: 1.2 as const,
      keepDownloadsDays: 7 as const,
    };
    writeSettings(db, custom);
    expect(readSettings(db)).toEqual(custom);
  });

  it("notifies subscribers when a value changes", () => {
    const seen: number[] = [];
    const unsub = settingsStore.subscribe((s, prev) => {
      if (s.playbackRate !== prev.playbackRate) seen.push(s.playbackRate);
    });
    settings.set("playbackRate", 1.7);
    settings.set("playbackRate", 1.7);
    settings.set("pictureInPicture", false);
    unsub();
    expect(seen).toEqual([1.7]);
  });
});

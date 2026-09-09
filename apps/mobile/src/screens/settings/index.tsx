import { GRAIN_TOKEN_SETTINGS_URL } from "@grist/grain-api";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { auth, useAuthToken, useTokenRejected } from "@/lib/auth";
import { formatBytes } from "@/lib/format";
import { downloads, transcriptIndex, useStorageStats, useWorkspace } from "@/lib/data";
import { viewOptions } from "@/lib/filters";
import {
  DOWNLOAD_CAPS_BYTES,
  defaultViewKey,
  KEEP_DOWNLOADS_DAYS,
  parseDefaultView,
  PLAYBACK_RATES,
  PREBUFFER_DAYS,
  settings,
  useSetting,
} from "@/lib/settings";
import { ProfileCard } from "./profile-card";
import { ReplaceToken } from "./replace-token";
import { PickerRow, Row, Section, ToggleRow } from "./rows";

export const REPO_URL = "https://github.com/Asafrose/better-grain";

export function maskToken(token: string): string {
  return `${token.slice(0, 6)}••••`;
}

export function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useAuthToken() ?? "";
  const rejected = useTokenRejected();
  const [override, setOverride] = useState<boolean | null>(null);
  const replacing = override ?? rejected !== null;
  const stats = useStorageStats();
  const appVersion = Constants.expoConfig?.version ?? "dev";

  const views = viewOptions(useWorkspace().teams);

  const clearTranscriptIndex = transcriptIndex.clear;

  return (
    <ScrollView
      testID="settings-screen"
      className="bg-background"
      contentContainerClassName="gap-5 px-5 pb-10"
      contentContainerStyle={{ paddingTop: insets.top }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="h-[52px] justify-center">
        <Text
          role="heading"
          className="font-jakarta-extrabold text-[28px] leading-8 tracking-tight"
        >
          Settings
        </Text>
      </View>

      <ProfileCard />

      <Section title="Meetings">
        <PickerRow
          icon="people"
          label="Default view"
          options={views.map((v) => v.key)}
          value={defaultViewKey(useSetting("defaultView"))}
          format={(key) => views.find((v) => v.key === key)?.label ?? "Mine"}
          onSelect={(key) => settings.set("defaultView", parseDefaultView(key) ?? { kind: "mine" })}
          testID="setting-default-view"
        />
      </Section>

      <Section title="Playback">
        <PickerRow
          icon="speed"
          label="Default speed"
          options={PLAYBACK_RATES}
          value={useSetting("playbackRate")}
          format={(r) => `${r}×`}
          onSelect={(r) => settings.set("playbackRate", r)}
          testID="setting-rate"
        />
        <PickerRow
          icon="clock"
          label="Pre-buffer recent"
          options={PREBUFFER_DAYS}
          value={useSetting("prebufferDays")}
          format={(d) => (d === 0 ? "Off" : d === 1 ? "1 day" : `${d} days`)}
          onSelect={(d) => settings.set("prebufferDays", d)}
          testID="setting-prebuffer"
        />
        <ToggleRow
          icon="pip"
          label="Picture in picture"
          checked={useSetting("pictureInPicture")}
          onChange={(v) => settings.set("pictureInPicture", v)}
          testID="setting-pip"
        />
      </Section>

      <Section title="Storage">
        <Row
          icon="download"
          label="Downloads"
          value={`${stats.downloads.count} meetings · ${formatBytes(stats.downloads.bytes)}`}
          valueTestID="downloads-size"
          onPress={() => router.push("/downloads")}
          testID="open-downloads"
        />
        <Row
          icon="text"
          label="Transcript search index"
          value={`${stats.index.meetings} meetings · ${formatBytes(stats.index.bytes)}`}
          valueTestID="index-size"
        />
        <PickerRow
          icon="clock"
          label="Keep downloads for"
          options={KEEP_DOWNLOADS_DAYS}
          value={useSetting("keepDownloadsDays")}
          format={(d) => `${d} days`}
          onSelect={(d) => settings.set("keepDownloadsDays", d)}
          testID="setting-keep"
        />
        <PickerRow
          icon="drive"
          label="Download cap"
          options={DOWNLOAD_CAPS_BYTES}
          value={useSetting("downloadCapBytes")}
          format={(b) => `${Math.round(b / 1024 ** 3)} GB`}
          onSelect={(b) => settings.set("downloadCapBytes", b)}
          testID="setting-cap"
        />
        <Row
          icon="trash"
          label="Clear index"
          onPress={clearTranscriptIndex}
          testID="clear-index"
          chevron={null}
          destructive
          disabled={stats.index.meetings === 0}
        />
        <Row
          icon="trash"
          label="Clear downloads"
          onPress={downloads.clear}
          testID="clear-downloads"
          chevron={null}
          destructive
          disabled={stats.downloads.count === 0}
        />
      </Section>

      <Section title="Account">
        <View>
          <Row
            icon="key"
            label="Personal access token"
            value={replacing ? undefined : maskToken(token)}
            valueTestID="token-masked"
            onPress={() => setOverride(!replacing)}
            testID="token-row"
            chevron={replacing ? "chevronDown" : "chevronRight"}
            destructive={rejected !== null}
          />
          {rejected !== null ? (
            <Text testID="token-rejected" className="px-4 pb-2 text-[13px] text-destructive">
              {rejected}
            </Text>
          ) : null}
          {replacing ? <ReplaceToken onDone={() => setOverride(false)} /> : null}
        </View>
        <Row
          icon="external"
          label="Open Grain settings"
          onPress={() => WebBrowser.openBrowserAsync(GRAIN_TOKEN_SETTINGS_URL)}
          testID="open-grain-settings"
        />
        <Row
          icon="close"
          label="Sign out"
          onPress={auth.signOut}
          testID="sign-out"
          chevron={null}
          destructive
        />
      </Section>

      <Section title="About">
        <Row icon="info" label="Version" value={`Grist ${appVersion}`} valueTestID="app-version" />
        <Row
          icon="external"
          label="Source code"
          value="github.com/Asafrose/better-grain"
          onPress={() => WebBrowser.openBrowserAsync(REPO_URL)}
          testID="open-source"
        />
      </Section>

      <Text className="pt-1 text-center text-xs text-muted-foreground">
        Open source · Not affiliated with Grain
      </Text>
    </ScrollView>
  );
}

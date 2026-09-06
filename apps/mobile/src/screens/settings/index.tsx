import { GRAIN_TOKEN_SETTINGS_URL } from "@grist/grain-api";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Children, isValidElement, type ReactNode, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { auth, useAuthToken } from "@/lib/auth";
import { formatBytes } from "@/lib/format";
import { transcriptIndex, useStorageStats, useWorkspace } from "@/lib/data";
import { makeClient, tokenErrorMessage } from "@/lib/grain";
import { me as identity, useMe, useMeStatus } from "@/lib/me";
import { initials } from "@/lib/meeting";
import {
  DOWNLOAD_CAPS_BYTES,
  KEEP_DOWNLOADS_DAYS,
  PLAYBACK_RATES,
  settings,
  useSetting,
} from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

export const REPO_URL = "https://github.com/Asafrose/better-grain";

export function maskToken(token: string): string {
  return `${token.slice(0, 6)}••••`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-2">
      <Text className="font-jakarta-semibold text-xs uppercase tracking-wider text-subtle-foreground">
        {title}
      </Text>
      <View className="overflow-hidden rounded-lg border border-border bg-card">
        {rows.map((row, i) => (
          <View key={isValidElement(row) && row.key !== null ? row.key : String(i)}>
            {i > 0 ? <View className="ml-[46px] h-px bg-border" /> : null}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  valueTestID,
  onPress,
  testID,
  right,
  destructive,
  disabled,
  chevron = "chevronRight",
}: {
  icon?: IconName;
  label: string;
  value?: string;
  valueTestID?: string;
  onPress?: () => void;
  testID?: string;
  right?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  chevron?: IconName | null;
}) {
  const colors = useColors();
  const tint = destructive ? colors.danger : colors.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress || disabled}
      className={cn(
        "min-h-[50px] flex-row items-center gap-3 px-3.5",
        onPress && "active:bg-secondary",
        disabled && "opacity-50",
      )}
    >
      {icon ? <Icon name={icon} size={20} color={tint} /> : <View className="w-5" />}
      <Text
        className={cn(
          "flex-1 font-jakarta-semibold text-[15px]",
          destructive && "text-destructive",
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
      {value ? (
        <Text testID={valueTestID} className="text-[13px] text-muted-foreground" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right ?? (onPress && chevron ? <Icon name={chevron} size={20} color={colors.ink3} /> : null)}
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  onChange,
  testID,
}: {
  icon: IconName;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testID: string;
}) {
  return (
    <Row
      icon={icon}
      label={label}
      value={checked ? "On" : "Off"}
      valueTestID={`${testID}-value`}
      onPress={() => onChange(!checked)}
      testID={testID}
      right={
        <Switch
          testID={`${testID}-switch`}
          checked={checked}
          onCheckedChange={onChange}
          accessibilityLabel={label}
        />
      }
    />
  );
}

function PickerRow<T extends string | number>({
  icon,
  label,
  options,
  value,
  format,
  onSelect,
  testID,
}: {
  icon: IconName;
  label: string;
  options: readonly T[];
  value: T;
  format: (v: T) => string;
  onSelect: (v: T) => void;
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Row
        icon={icon}
        label={label}
        value={format(value)}
        valueTestID={`${testID}-value`}
        onPress={() => setOpen((o) => !o)}
        testID={testID}
        chevron={open ? "chevronDown" : "chevronRight"}
      />
      {open ? (
        <View className="mx-3.5 mb-3 flex-row gap-1 rounded-md bg-secondary p-1">
          {options.map((option) => {
            const selected = option === value;
            return (
              <Pressable
                key={String(option)}
                testID={`${testID}-option-${option}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                className={cn(
                  "h-[34px] flex-1 items-center justify-center rounded-[9px]",
                  selected && "bg-card shadow-sm shadow-black/10",
                )}
              >
                <Text
                  className={cn(
                    "font-jakarta-semibold text-[13px]",
                    selected ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {format(option)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function ProfileCard() {
  const colors = useColors();
  const me = useMe();
  const status = useMeStatus();
  const users = useWorkspace().users;
  const [picking, setPicking] = useState(false);

  const name =
    me?.name ?? (status === "loading" || status === "idle" ? "Finding you…" : "Who are you?");
  const detail = me
    ? [me.email, users.length ? `${users.length} people` : null].filter(Boolean).join(" · ")
    : status === "loading" || status === "idle"
      ? " "
      : "Tap to pick yourself from the workspace";

  return (
    <View className="gap-2">
      <Pressable
        testID="profile-card"
        accessibilityRole="button"
        onPress={() => setPicking((p) => !p)}
        className="flex-row items-center gap-3.5 rounded-lg border border-border bg-card p-3.5 active:opacity-80"
      >
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.speakers[3] }}
        >
          <Text className="font-jakarta-bold text-base text-white">
            {me ? initials(me.name) : "·"}
          </Text>
        </View>
        <View className="flex-1">
          <Text testID="profile-name" className="font-jakarta-bold text-base" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-[13px] text-muted-foreground" numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <Icon name={picking ? "chevronDown" : "chevronRight"} size={16} color={colors.ink3} />
      </Pressable>
      {picking ? (
        <View className="rounded-lg border border-border bg-card">
          <Text className="px-3.5 pt-3 pb-1 font-jakarta-semibold text-[12px] uppercase tracking-[0.5px] text-subtle-foreground">
            This is me
          </Text>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 280 }}>
            {users.map((u) => (
              <Pressable
                key={u.id}
                testID={`me-option-${u.id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: me?.email === u.email }}
                onPress={() => {
                  identity.choose(u);
                  setPicking(false);
                }}
                className="flex-row items-center justify-between px-3.5 py-2.5 active:bg-secondary"
              >
                <View className="flex-1">
                  <Text className="text-[15px]">{u.name}</Text>
                  <Text className="text-[12px] text-muted-foreground">{u.email}</Text>
                </View>
                {me?.email === u.email ? (
                  <Icon name="check" size={16} color={colors.accent} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function ReplaceToken({ onDone }: { onDone: () => void }) {
  const colors = useColors();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = token.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await makeClient(value).recordings.list();
      await auth.signIn(value);
      onDone();
    } catch (e) {
      setError(tokenErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-2 px-3.5 pt-1 pb-3.5">
      <View
        className={cn(
          "h-[46px] flex-row items-center gap-2.5 rounded-md border-[1.5px] bg-background px-3",
          error ? "border-destructive" : "border-primary",
        )}
      >
        <Icon name="key" color={colors.ink3} />
        <TextInput
          testID="replace-token-input"
          accessibilityLabel="New personal access token"
          value={token}
          onChangeText={(t) => {
            setToken(t);
            setError(null);
          }}
          onSubmitEditing={submit}
          placeholder="grain_pat_…"
          placeholderTextColor={colors.ink3}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          returnKeyType="go"
          className="flex-1 py-0 font-mono text-[15px] text-foreground"
        />
      </View>
      <Text
        className={cn("text-xs leading-4", error ? "text-destructive" : "text-muted-foreground")}
      >
        {error ??
          "Validated with Grain before it replaces the current token. Your library resyncs."}
      </Text>
      <View className="flex-row gap-2 pt-1">
        <Button
          testID="replace-token-cancel"
          variant="outline"
          className="flex-1"
          onPress={onDone}
          disabled={busy}
        >
          <Text>Cancel</Text>
        </Button>
        <Button
          testID="replace-token-save"
          className="flex-1"
          onPress={submit}
          disabled={!token.trim() || busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text className="font-jakarta-semibold">Save token</Text>
          )}
        </Button>
      </View>
    </View>
  );
}

export function Settings() {
  const insets = useSafeAreaInsets();
  const token = useAuthToken() ?? "";
  const [replacing, setReplacing] = useState(false);
  const stats = useStorageStats();
  const appVersion = Constants.expoConfig?.version ?? "dev";

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
        <ToggleRow
          icon="wifi"
          label="Audio only on cellular"
          checked={useSetting("audioOnlyOnCellular")}
          onChange={(v) => settings.set("audioOnlyOnCellular", v)}
          testID="setting-audio-only"
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
          onPress={() => {}}
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
            onPress={() => setReplacing((r) => !r)}
            testID="token-row"
            chevron={replacing ? "chevronDown" : "chevronRight"}
          />
          {replacing ? <ReplaceToken onDone={() => setReplacing(false)} /> : null}
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

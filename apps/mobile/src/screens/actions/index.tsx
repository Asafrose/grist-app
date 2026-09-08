import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  downloads,
  type RecordingDetail,
  recordings,
  useDownload,
  useRecording,
  useTranscript,
} from "@/lib/data";
import { useIsDemo } from "@/lib/demo";
import { formatBytes, formatDuration, formatShortDate } from "@/lib/format";
import { useGrainClient } from "@/lib/grain";
import { shareLink } from "@/lib/share";
import { useColors } from "@/theme";

const GRAIN_ROWS: { key: string; icon: IconName; label: string }[] = [
  { key: "comments", icon: "text", label: "Comments & clips" },
  { key: "playlist", icon: "list", label: "Add to playlist" },
  { key: "viewers", icon: "people", label: "Change who can view" },
  { key: "integrations", icon: "external", label: "Send to Slack, HubSpot, Salesforce" },
];

function Row({
  testID,
  icon,
  label,
  sub,
  trailing = "chevronRight",
  onPress,
  children,
}: {
  testID: string;
  icon: IconName;
  label: string;
  sub?: string | null;
  trailing?: IconName | null;
  onPress: () => void;
  children?: ReactNode;
}) {
  const colors = useColors();
  return (
    <View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        className="min-h-[52px] flex-row items-center gap-3.5 py-2 active:opacity-60"
      >
        <Icon name={icon} color={colors.ink} />
        <View className="flex-1 gap-0.5">
          <Text className="font-jakarta-semibold text-[15px]">{label}</Text>
          {sub ? (
            <Text testID={`${testID}-sub`} className="text-[12px] text-muted-foreground">
              {sub}
            </Text>
          ) : null}
        </View>
        {trailing ? <Icon name={trailing} color={colors.ink3} /> : null}
      </Pressable>
      {children}
    </View>
  );
}

function Header({ rec }: { rec: RecordingDetail }) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-3 pb-3">
      <View className="h-12 w-[72px] items-center justify-center overflow-hidden rounded-[8px] bg-foreground">
        {rec.thumbnailUrl ? (
          <Image source={{ uri: rec.thumbnailUrl }} style={{ width: 72, height: 48 }} />
        ) : (
          <Icon name={rec.mediaType === "video" ? "video" : "mic"} color={colors.bg} />
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={2} className="font-jakarta-bold text-[15px] leading-5">
          {rec.title}
        </Text>
        <Text className="text-[12px] text-muted-foreground">
          {formatShortDate(rec.startDatetime)} · {formatDuration(rec.durationMs)}
        </Text>
      </View>
    </View>
  );
}

function DownloadRow({ rec }: { rec: RecordingDetail }) {
  const entry = useDownload(rec.id);
  const kind = rec.mediaType === "audio" ? "Audio" : "Video";
  const sub =
    entry.status === "downloading"
      ? `Downloading · ${Math.round(entry.progress * 100)}%`
      : entry.status === "done"
        ? `Downloaded${entry.bytes ? ` · ${formatBytes(entry.bytes)}` : ""} · tap to remove`
        : entry.status === "error"
          ? (entry.error ?? "Download failed · tap to retry")
          : `${kind} · plays without a connection`;
  const press = () => {
    if (entry.status === "downloading") downloads.cancel(rec.id);
    else if (entry.status === "done") downloads.remove(rec.id);
    else void downloads.start(rec.id, rec.mediaType);
  };
  return (
    <Row
      testID="action-download"
      icon={entry.status === "done" ? "check" : "download"}
      label={entry.status === "downloading" ? "Downloading…" : "Download for offline"}
      sub={sub}
      trailing={entry.status === "downloading" ? "close" : "chevronRight"}
      onPress={press}
    >
      {entry.status === "downloading" ? (
        <View className="mb-2 ml-[34px] h-1 overflow-hidden rounded-full bg-secondary">
          <View
            testID="download-progress"
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(entry.progress * 100) }}
            className="h-1 rounded-full bg-primary"
            style={{ width: `${Math.round(entry.progress * 100)}%` }}
          />
        </View>
      ) : null}
    </Row>
  );
}

type CopyState = "idle" | "copying" | "copied" | "error";

export function transcriptToText(segments: { speaker: string; text: string }[]): string {
  return segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");
}

export function Actions({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const rec = useRecording(id);
  const client = useGrainClient();
  const demo = useIsDemo();
  const localTranscript = useTranscript(id);
  const [copy, setCopy] = useState<CopyState>("idle");
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!rec) {
    return (
      <View className="flex-1 items-center justify-center bg-card p-8" collapsable={false}>
        <Text className="text-center text-muted-foreground">
          This recording is not in your library.
        </Text>
      </View>
    );
  }

  const share = () => shareLink(rec.url, rec.title);

  const copyTranscript = async () => {
    if (copy === "copying") return;
    setCopy("copying");
    try {
      const text =
        demo || !client
          ? transcriptToText(localTranscript)
          : await client.recordings.transcriptText(rec.id, "txt");
      await Clipboard.setStringAsync(text);
      setCopy("copied");
    } catch {
      setCopy("error");
    }
  };

  const openRename = () => {
    setDraft(rec.title);
    setRenameError(null);
    setRenaming((r) => !r);
  };

  const title = draft.trim();
  const saveRename = async () => {
    if (!title || saving) return;
    setSaving(true);
    try {
      await recordings.rename(rec.id, title, demo ? null : (client?.recordings ?? null));
      setRenaming(false);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Couldn't rename this meeting");
    } finally {
      setSaving(false);
    }
  };

  const openInGrain = () => void WebBrowser.openBrowserAsync(rec.url).catch(() => undefined);

  const copySub =
    copy === "copied"
      ? "Copied"
      : copy === "copying"
        ? "Fetching…"
        : copy === "error"
          ? "Couldn't fetch the transcript · tap to retry"
          : "Plain text, for pasting into an AI chat";

  return (
    <View className="flex-1 bg-card" collapsable={false}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-5 pt-3"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 12 }}
      >
        <Header rec={rec} />
        <View className="h-px bg-border" />

        <Row
          testID="action-share"
          icon="share"
          label="Share link"
          sub="Anyone in the workspace can open it"
          onPress={share}
        />
        {rec.mediaType === "transcript" ? null : <DownloadRow rec={rec} />}
        <Row
          testID="action-tags"
          icon="tag"
          label="Tags"
          sub={rec.tags.length ? rec.tags.join(", ") : "None yet"}
          onPress={() =>
            router.dismissTo({ pathname: "/meeting/[id]", params: { id: rec.id, tab: "timeline" } })
          }
        />
        <Row
          testID="action-copy-transcript"
          icon="copy"
          label="Copy transcript"
          sub={copySub}
          trailing={copy === "copied" ? "check" : "chevronRight"}
          onPress={() => void copyTranscript()}
        />
        <Row
          testID="action-rename"
          icon="text"
          label="Rename"
          trailing={renaming ? "chevronDown" : "chevronRight"}
          onPress={openRename}
        >
          {renaming ? (
            <View className="mb-3 ml-[34px] gap-2">
              <Input
                testID="rename-input"
                selectTextOnFocus
                value={draft}
                onChangeText={setDraft}
                returnKeyType="done"
                onSubmitEditing={() => void saveRename()}
                placeholder="Meeting title"
              />
              {renameError ? (
                <Text className="text-[12px] text-destructive">{renameError}</Text>
              ) : null}
              <View className="flex-row justify-end gap-2">
                <Button variant="ghost" size="sm" onPress={() => setRenaming(false)}>
                  <Text>Cancel</Text>
                </Button>
                <Button
                  testID="rename-save"
                  size="sm"
                  disabled={!title || saving}
                  onPress={() => void saveRename()}
                >
                  <Text>Save</Text>
                </Button>
              </View>
            </View>
          ) : null}
        </Row>

        <Text className="pt-3.5 font-jakarta-semibold text-[12px] uppercase tracking-[0.5px] text-subtle-foreground">
          In Grain
        </Text>
        <Text className="pb-1.5 pt-1 text-[13px] text-muted-foreground">
          These open the Grain web app at this meeting.
        </Text>
        {GRAIN_ROWS.map((row) => (
          <Row
            key={row.key}
            testID={`action-grain-${row.key}`}
            icon={row.icon}
            label={row.label}
            trailing="external"
            onPress={openInGrain}
          />
        ))}
      </ScrollView>
    </View>
  );
}

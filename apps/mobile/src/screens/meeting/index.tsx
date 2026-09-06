import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Icon, type IconName } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { getRecording, type RecordingDetail } from "@/lib/db";
import { useIsDemo } from "@/lib/demo";
import { formatShortDate } from "@/lib/format";
import { useGrainClient } from "@/lib/grain";
import { useDb, useLibraryVersion } from "@/lib/library";
import {
  isRecordingStale,
  MEETING_TABS,
  type MeetingTab,
  parseMeetingTab,
  parseSeekParam,
} from "@/lib/meeting";
import { playback } from "@/lib/player";
import { refreshRecording } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";
import { ClipsTab } from "./clips-tab";
import { PlayerCard, toNowPlaying } from "./player-card";
import { SummaryTab } from "./summary-tab";
import { TimelineTab } from "./timeline-tab";
import { TranscriptTab } from "./transcript-tab";

const TAB_LABELS: Record<MeetingTab, string> = {
  summary: "Summary",
  transcript: "Transcript",
  timeline: "Timeline",
  clips: "Clips",
};

function HeaderActions() {
  return (
    <Pressable
      testID="actions"
      accessibilityRole="button"
      accessibilityLabel="Actions"
      hitSlop={8}
      onPress={() => {}}
      className="h-11 w-11 items-center justify-center active:opacity-60"
    >
      <Icon name="more" size={24} />
    </Pressable>
  );
}

function MetaTag({
  icon,
  label,
  tone = "plain",
}: {
  icon?: IconName;
  label: string;
  tone?: "plain" | "external" | "internal";
}) {
  const colors = useColors();
  const iconColor =
    tone === "external" ? colors.ext : tone === "internal" ? colors.accent : colors.ink2;
  return (
    <View
      className={cn(
        "h-[22px] flex-row items-center gap-1 rounded-[6px] px-2",
        tone === "external"
          ? "bg-external-soft"
          : tone === "internal"
            ? "bg-accent"
            : "bg-secondary",
      )}
    >
      {icon ? <Icon name={icon} size={14} color={iconColor} /> : null}
      <Text
        className={cn(
          "font-jakarta-semibold text-[12px]",
          tone === "external"
            ? "text-external"
            : tone === "internal"
              ? "text-accent-foreground"
              : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </View>
  );
}

function MetaChips({ rec }: { rec: RecordingDetail }) {
  const people = rec.participants;
  const lead = people.find((p) => p.confirmedAttendee)?.name ?? people[0]?.name;
  return (
    <View className="flex-row flex-wrap gap-1.5">
      <MetaTag icon="calendar" label={formatShortDate(rec.startDatetime)} />
      {rec.meetingType?.name ? <MetaTag label={rec.meetingType.name} /> : null}
      {rec.externalCount > 0 ? (
        <MetaTag label="External" tone="external" />
      ) : (
        <MetaTag label="Internal" tone="internal" />
      )}
      {lead ? (
        <MetaTag icon="people" label={people.length > 1 ? `${lead} +${people.length - 1}` : lead} />
      ) : null}
    </View>
  );
}

function TabStrip({
  tab,
  onChange,
  clipCount,
}: {
  tab: MeetingTab;
  onChange: (tab: MeetingTab) => void;
  clipCount: number;
}) {
  return (
    <View testID="meeting-tabs" className="flex-row gap-[22px] border-b border-border px-5">
      {MEETING_TABS.map((t) => {
        const on = t === tab;
        return (
          <Pressable
            key={t}
            testID={`meeting-tab-${t}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t)}
            className={cn(
              "-mb-px h-11 flex-row items-center gap-1.5 border-b-2",
              on ? "border-foreground" : "border-transparent",
            )}
          >
            <Text
              className={cn(
                "font-jakarta-bold text-[14px]",
                on ? "text-foreground" : "text-subtle-foreground",
              )}
            >
              {TAB_LABELS[t]}
            </Text>
            {t === "clips" && clipCount > 0 ? (
              <View className="h-[18px] justify-center rounded-[6px] bg-secondary px-1.5">
                <Text className="font-jakarta-semibold text-[12px] text-muted-foreground">
                  {clipCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Meeting({ id }: { id: string }) {
  const db = useDb();
  const client = useGrainClient();
  const demo = useIsDemo();
  useLibraryVersion();
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [, setRefreshedAt] = useState(0);
  const params = useLocalSearchParams<{ tab?: string; t?: string }>();
  const tab = parseMeetingTab(params.tab);

  const rec = getRecording(db, id);
  const wantsRefresh = !!rec && !!client && !demo && isRecordingStale(rec.syncedAt);
  const refreshing = wantsRefresh && !refreshFailed;

  useEffect(() => {
    if (!wantsRefresh || !client) return;
    let cancelled = false;
    refreshRecording(db, client.recordings, id).then(
      () => !cancelled && setRefreshedAt(Date.now()),
      () => !cancelled && setRefreshFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [client, db, id, wantsRefresh]);

  const seek = (ms: number) => {
    if (!rec || rec.mediaType === "transcript") return;
    void playback.load(toNowPlaying(rec), { at: ms / 1000 });
  };

  const seekParam = parseSeekParam(params.t);
  useEffect(() => {
    if (seekParam === null) return;
    const row = getRecording(db, id);
    if (row && row.mediaType !== "transcript") {
      void playback.load(toNowPlaying(row), { at: seekParam });
    }
  }, [db, id, seekParam]);

  if (!rec) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        <Stack.Screen options={{ title: "" }} />
        <Text className="text-center text-muted-foreground">
          This recording is not in your library yet. Pull to refresh on Meetings.
        </Text>
      </View>
    );
  }

  const tabProps = { rec, onSeek: seek };
  const body =
    tab === "transcript" ? (
      <TranscriptTab {...tabProps} />
    ) : tab === "timeline" ? (
      <TimelineTab {...tabProps} />
    ) : tab === "clips" ? (
      <ClipsTab {...tabProps} />
    ) : (
      <SummaryTab {...tabProps} refreshing={refreshing} />
    );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: "", headerRight: HeaderActions }} />
      <View className="px-5 pt-1">
        <PlayerCard rec={rec} />
      </View>
      <View className="gap-2.5 px-5 pt-3.5">
        <Text
          role="heading"
          numberOfLines={2}
          className="font-jakarta-bold text-[20px] leading-[25px] tracking-tight"
        >
          {rec.title}
        </Text>
        <MetaChips rec={rec} />
      </View>
      <View className="pt-2.5">
        <TabStrip
          tab={tab}
          clipCount={rec.highlights.length}
          onChange={(next) => router.setParams({ tab: next })}
        />
      </View>
      <View className="flex-1">{body}</View>
    </View>
  );
}

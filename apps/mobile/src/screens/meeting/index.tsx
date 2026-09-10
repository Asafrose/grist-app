import { router, Stack, useLocalSearchParams, useRoute } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { Pressable, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Icon, type IconName } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { type RecordingDetail, recordingOpens, recordings, useRecording } from "@/lib/data";
import { deepLinks, seekKey } from "@/lib/deep-links";
import { useIsDemo } from "@/lib/demo";
import { formatShortDate } from "@/lib/format";
import { useGrainClient } from "@/lib/grain";
import {
  beginDrag,
  type CollapseState,
  initialCollapse,
  meetingLayout,
  reduceScroll,
  type ScrollFrame,
  useIsCardCollapsed,
} from "@/lib/meeting-layout";
import {
  isRecordingStale,
  MEETING_TABS,
  type MeetingTab,
  parseMeetingTab,
  parseSeekParam,
} from "@/lib/meeting";
import { playback, useIsCurrent, useIsPlaying } from "@/lib/player";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";
import { ClipsTab } from "./clips-tab";
import { PlayerCard, toNowPlaying } from "./player-card";
import { SummaryTab } from "./summary-tab";
import { TimelineTab } from "./timeline-tab";
import { TranscriptTab } from "./transcript-tab";
import type { ScrollListeners } from "./types";

const TAB_LABELS: Record<MeetingTab, string> = {
  summary: "Summary",
  transcript: "Transcript",
  timeline: "Timeline",
  clips: "Clips",
};

function HeaderActions({ id }: { id: string }) {
  return (
    <Pressable
      testID="actions"
      accessibilityRole="button"
      accessibilityLabel="Actions"
      hitSlop={8}
      onPress={() => router.push({ pathname: "/actions", params: { id } })}
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
  const client = useGrainClient();
  const demo = useIsDemo();
  const [refreshFailed, setRefreshFailed] = useState(false);
  const params = useLocalSearchParams<{ tab?: string; t?: string }>();
  const routeKey = useRoute().key;
  const tab = parseMeetingTab(params.tab);

  const rec = useRecording(id);

  const cached = !!rec;
  useEffect(() => {
    if (cached) recordingOpens.markOpened(id);
  }, [cached, id]);
  const collapsed = useIsCardCollapsed(id);
  const [cardHeight, setCardHeight] = useState(0);

  const progress = useSharedValue(0);
  const scrollState = useSharedValue<CollapseState>(initialCollapse);
  const dragging = useSharedValue(false);
  const momentum = useSharedValue(false);
  const programmatic = useSharedValue(false);

  // The store is the one source of truth for the card, and this is the only writer of
  // `progress`, so an interrupted collapse always settles on 0 or 1 rather than mid-fade.
  useEffect(() => {
    scrollState.set({ ...scrollState.get(), collapsed });
    cancelAnimation(progress);
    progress.set(
      collapsed
        ? withTiming(1, { duration: 180 })
        : withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }),
    );
  }, [collapsed, progress, scrollState]);

  const expand = useCallback(() => {
    scrollState.set(initialCollapse);
    dragging.set(false);
    momentum.set(false);
    meetingLayout.clear(id);
  }, [dragging, id, momentum, scrollState]);

  useEffect(() => expand(), [tab, expand]);
  useEffect(() => () => meetingLayout.clear(id), [id]);

  // Playback starting on this recording brings the card back so the reader sees what they
  // started. `load` publishes `current` first and `playing` a beat later, so a start is
  // latched when the recording becomes current while the card is collapsed and paused, then
  // honoured when playback actually begins. The player card claiming the recording on mount
  // to preload a resume frame never latches, because the card is showing at that point, so
  // pausing and resuming from the mini player leaves a collapsed card alone.
  const isCurrent = useIsCurrent(id);
  const playing = useIsPlaying();
  const wasCurrent = useRef(isCurrent);
  const pendingStart = useRef(false);
  useEffect(() => {
    const became = isCurrent && !wasCurrent.current;
    wasCurrent.current = isCurrent;
    if (!isCurrent) {
      pendingStart.current = false;
      return;
    }
    if (became && collapsed) pendingStart.current = true;
    if (playing && pendingStart.current) {
      pendingStart.current = false;
      expand();
    }
  }, [collapsed, expand, isCurrent, playing]);

  const settle = useCallback(
    (frame: ScrollFrame) => {
      const was = scrollState.get();
      const next = reduceScroll(was, frame);
      scrollState.set(next);
      if (next.collapsed !== was.collapsed) meetingLayout.setCollapsed(id, next.collapsed);
    },
    [id, scrollState],
  );

  // Every tab drives the reducer through these plain scroll props. FlashList calls
  // `onScroll` itself instead of handing it to its scroll component, and an
  // `Animated.ScrollView` carrying a worklet handler would not scroll reliably.
  const frameOf = (e: NativeSyntheticEvent<NativeScrollEvent>, live: boolean): ScrollFrame => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    return {
      offset: contentOffset.y,
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
      dragging: live && dragging.get(),
      momentum: live && momentum.get(),
    };
  };

  const scrollListeners: ScrollListeners = {
    onScroll: (e) => settle(frameOf(e, !programmatic.get())),
    onScrollBeginDrag: (e) => {
      programmatic.set(false);
      momentum.set(false);
      dragging.set(true);
      scrollState.set(beginDrag(scrollState.get(), e.nativeEvent.contentOffset.y));
    },
    onScrollEndDrag: (e) => {
      const frame = frameOf(e, !programmatic.get());
      dragging.set(false);
      settle(frame);
    },
    onMomentumScrollBegin: () => {
      dragging.set(false);
      momentum.set(!programmatic.get());
    },
    // The last `onScroll` of a fling can arrive before the list settles on 0, so the frame
    // that lands at the top is often this one.
    onMomentumScrollEnd: (e) => {
      settle(frameOf(e, !programmatic.get()));
      dragging.set(false);
      momentum.set(false);
      programmatic.set(false);
    },
  };

  const onProgrammaticScroll = useCallback(() => {
    programmatic.set(true);
    dragging.set(false);
    momentum.set(false);
  }, [dragging, momentum, programmatic]);

  const cardStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      height: cardHeight ? cardHeight * (1 - p) : undefined,
      opacity: 1 - p,
      transform: [{ translateY: -p * cardHeight }],
    };
  });

  const wantsRefresh = !!rec && !!client && !demo && isRecordingStale(rec.syncedAt);
  const refreshing = wantsRefresh && !refreshFailed;

  useEffect(() => {
    if (!wantsRefresh || !client) return;
    let cancelled = false;
    recordings.refresh(id, client.recordings).catch(() => !cancelled && setRefreshFailed(true));
    return () => {
      cancelled = true;
    };
  }, [client, id, wantsRefresh]);

  const seek = (ms: number) => {
    if (!rec || rec.mediaType === "transcript") return;
    expand();
    void playback.load(toNowPlaying(rec), { at: ms / 1000 });
  };

  const seekParam = parseSeekParam(params.t);
  useEffect(() => {
    if (seekParam === null) return;
    if (!rec || rec.mediaType === "transcript") return;
    if (!deepLinks.consume(seekKey(routeKey, seekParam))) return;
    void playback.load(toNowPlaying(rec), { at: seekParam });
    // `rec` identity changes on every live refresh; only its presence matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, seekParam, rec?.id]);

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

  // Collapsing the card hands its height to the list. Without giving that height back as
  // padding, a short tab loses scrollable range, the offset clamps to the top and the card
  // springs open again — the list would never move.
  const tabProps = {
    rec,
    onSeek: seek,
    onPlay: expand,
    scrollListeners,
    onProgrammaticScroll,
    contentInsetBottom: collapsed ? cardHeight : 0,
  };
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
      <Stack.Screen options={{ title: "", headerRight: () => <HeaderActions id={id} /> }} />
      <Animated.View
        testID="player-card"
        className="overflow-hidden"
        style={cardStyle}
        pointerEvents={collapsed ? "none" : "auto"}
        accessibilityElementsHidden={collapsed}
        importantForAccessibility={collapsed ? "no-hide-descendants" : "auto"}
      >
        <View className="px-5 pt-1" onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}>
          <PlayerCard rec={rec} />
        </View>
      </Animated.View>
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

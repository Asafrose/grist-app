import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/icon";
import { PlayerView } from "@/components/player-view";
import { Scrubber } from "@/components/scrubber";
import { Text } from "@/components/ui/text";
import { recordingQuery, transcriptQuery } from "@/lib/db";
import { formatDuration, formatMeetingDate } from "@/lib/format";
import { useDb, useLibrary } from "@/lib/library";
import { PLAYBACK_RATES, playback, usePlayer } from "@/lib/player";
import { initials, segmentAt, speakers } from "@/lib/transcript";
import { palette } from "@/theme";

const d = palette.dark;
const BARS: [number, number][] = [
  [20, 0.5],
  [44, 0.7],
  [66, 0.95],
  [38, 0.7],
  [54, 0.85],
  [26, 0.55],
  [48, 0.8],
  [70, 1],
  [34, 0.6],
  [22, 0.5],
];

function Transport({
  icon,
  label,
  testID,
  onPress,
  primary,
}: {
  icon: IconName;
  label: string;
  testID: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      className="items-center justify-center rounded-full active:opacity-70"
      style={{
        height: primary ? 72 : 44,
        width: primary ? 72 : 44,
        backgroundColor: primary ? d.ink : undefined,
      }}
    >
      <Icon name={icon} size={primary ? 28 : 24} color={primary ? d.bg : d.ink} />
    </Pressable>
  );
}

function Artwork({ thumbnailUrl, audio }: { thumbnailUrl: string | null; audio: boolean }) {
  return (
    <View
      testID="np-artwork"
      className="items-center justify-center overflow-hidden"
      style={{ width: 280, height: 280, borderRadius: 28, backgroundColor: "#2B3036" }}
    >
      {!audio && thumbnailUrl ? (
        <Image source={thumbnailUrl} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      ) : (
        <View className="flex-row items-end" style={{ gap: 5, height: 70 }}>
          {BARS.map(([h, alpha]) => (
            <View
              key={`${h}-${alpha}`}
              style={{
                width: 6,
                height: h,
                borderRadius: 3,
                backgroundColor: `rgba(255,255,255,${alpha})`,
              }}
            />
          ))}
        </View>
      )}
      {audio ? (
        <View
          className="absolute flex-row items-center gap-1 rounded-[6px] px-2"
          style={{ left: 14, top: 14, height: 22, backgroundColor: "rgba(255,255,255,0.14)" }}
        >
          <Icon name="mic" size={14} color="#FFFFFF" />
          <Text className="font-jakarta-semibold text-[12px]" style={{ color: "#FFFFFF" }}>
            Audio only
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function NowPlaying() {
  const db = useDb();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const version = useLibrary((s) => s.version);
  const state = usePlayer();
  const current = state.current;
  const [showVideo, setShowVideo] = useState(false);
  const [pickingRate, setPickingRate] = useState(false);

  const id = current?.id ?? "";
  const { data: rec } = useLiveQuery(recordingQuery(db, id), [db, id, version]);
  const { data: segments } = useLiveQuery(transcriptQuery(db, id), [db, id, version]);

  const names = speakers(segments);
  const line = segmentAt(segments, state.position * 1000);
  const speakerColor = line ? d.speakers[names.indexOf(line.speaker) % d.speakers.length] : d.ink;

  if (!current) {
    return (
      <View
        testID="now-playing"
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: d.bg }}
      >
        <StatusBar style="light" />
        <Text className="text-center" style={{ color: d.ink2 }}>
          Nothing is playing.
        </Text>
      </View>
    );
  }

  const isVideo = current.mediaType === "video";
  const duration = state.duration || current.durationMs / 1000;

  return (
    <View
      testID="now-playing"
      className="flex-1"
      style={{ backgroundColor: d.bg, paddingTop: insets.top }}
    >
      <StatusBar style="light" />
      <View className="h-12 flex-row items-center px-5">
        <Pressable
          testID="np-close"
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          onPress={() => router.back()}
          className="-ml-3 h-11 w-11 items-center justify-center rounded-[12px] active:opacity-60"
        >
          <Icon name="chevronDown" size={24} color={d.ink} />
        </Pressable>
        <Text
          className="flex-1 text-center font-jakarta-semibold text-[12px] uppercase tracking-[0.5px]"
          style={{ color: d.ink3 }}
        >
          Now playing
        </Text>
        <Pressable
          testID="np-open-meeting"
          accessibilityRole="link"
          accessibilityLabel="Open meeting"
          hitSlop={8}
          onPress={() => router.replace({ pathname: "/meeting/[id]", params: { id: current.id } })}
          className="-mr-3 h-11 items-center justify-center rounded-[12px] px-3 active:opacity-60"
        >
          <Text className="font-jakarta-semibold text-[13px]" style={{ color: d.accent }}>
            Open meeting
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerClassName="items-center px-5 pt-7"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {showVideo && isVideo ? (
          <PlayerView className="w-full rounded-[28px]" />
        ) : (
          <Artwork thumbnailUrl={current.thumbnailUrl} audio={!isVideo} />
        )}

        <Text
          numberOfLines={2}
          className="mt-[30px] text-center font-jakarta-bold text-[20px] leading-[25px] tracking-tight"
          style={{ color: d.ink }}
        >
          {current.title}
        </Text>
        <Text className="mt-1.5 text-[13px]" style={{ color: d.ink2 }}>
          {rec
            ? `${formatMeetingDate(rec.startDatetime)} · ${formatDuration(rec.durationMs)}`
            : formatDuration(current.durationMs)}
        </Text>

        <View className="mt-[30px] w-full">
          <Scrubber
            testID="np-scrubber"
            position={state.position}
            duration={duration}
            onSeek={playback.seekTo}
            trackColor={d.line}
            fillColor={d.accent}
            labelColor={d.ink2}
          />
        </View>

        <View className="mt-4 flex-row items-center" style={{ gap: 30 }}>
          <Pressable
            testID="np-rate"
            accessibilityRole="button"
            accessibilityLabel={`Speed ${state.rate}×`}
            hitSlop={8}
            onPress={() => setPickingRate((v) => !v)}
            className="h-11 w-11 items-center justify-center rounded-[12px] active:opacity-60"
          >
            <Text
              className="font-mono-medium text-[13px]"
              style={{ color: pickingRate ? d.accent : d.ink }}
            >
              {state.rate}×
            </Text>
          </Pressable>
          <Transport
            testID="np-seek-back"
            icon="back10"
            label="Back 10 seconds"
            onPress={() => playback.seekBy(-10)}
          />
          {state.status === "loading" ? (
            <View
              className="items-center justify-center rounded-full"
              style={{ height: 72, width: 72, backgroundColor: d.ink }}
            >
              <ActivityIndicator color={d.bg} />
            </View>
          ) : (
            <Transport
              testID="np-play-pause"
              icon={state.playing ? "pause" : "play"}
              label={state.playing ? "Pause" : "Play"}
              primary
              onPress={() => playback.toggle()}
            />
          )}
          <Transport
            testID="np-seek-forward"
            icon="fwd10"
            label="Forward 10 seconds"
            onPress={() => playback.seekBy(10)}
          />
          {isVideo ? (
            <Pressable
              testID="np-video"
              accessibilityRole="button"
              accessibilityLabel={showVideo ? "Show artwork" : "Show video"}
              accessibilityState={{ selected: showVideo }}
              hitSlop={8}
              onPress={() => setShowVideo((v) => !v)}
              className="h-11 w-11 items-center justify-center rounded-[12px] active:opacity-60"
            >
              <Icon name="video" size={24} color={showVideo ? d.accent : d.ink} />
            </Pressable>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        {pickingRate ? (
          <View testID="np-rates" className="mt-5 flex-row flex-wrap justify-center gap-2">
            {PLAYBACK_RATES.map((rate) => {
              const on = state.rate === rate;
              return (
                <Pressable
                  key={rate}
                  testID={`np-rate-${rate}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    playback.setRate(rate);
                    setPickingRate(false);
                  }}
                  className="h-8 items-center justify-center rounded-full border px-3"
                  style={{
                    backgroundColor: on ? d.ink : d.surface,
                    borderColor: on ? d.ink : d.line,
                  }}
                >
                  <Text
                    className="font-mono-medium text-[13px]"
                    style={{ color: on ? d.bg : d.ink2 }}
                  >
                    {rate}×
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {state.status === "error" ? (
          <Text className="mt-4 text-center text-[13px]" style={{ color: d.danger }}>
            {state.error}
          </Text>
        ) : null}

        {line ? (
          <View
            testID="np-transcript"
            className="mt-8 w-full flex-row items-center gap-3 rounded-[16px] px-3.5 py-3"
            style={{ backgroundColor: d.accentSoft }}
          >
            <View
              className="h-7 w-7 items-center justify-center rounded-full"
              style={{ backgroundColor: speakerColor }}
            >
              <Text className="font-jakarta-bold text-[11px]" style={{ color: "#FFFFFF" }}>
                {initials(line.speaker)}
              </Text>
            </View>
            <Text className="flex-1 text-[14px] leading-5" style={{ color: d.ink }}>
              <Text className="font-jakarta-bold text-[14px]" style={{ color: speakerColor }}>
                {line.speaker}
              </Text>
              {" · "}
              {line.text}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

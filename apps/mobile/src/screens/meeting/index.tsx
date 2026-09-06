import { Stack } from "expo-router";
import { isPictureInPictureSupported } from "expo-video";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Icon, type IconName } from "@/components/icon";
import { PlayerView } from "@/components/player-view";
import { Text } from "@/components/ui/text";
import { getRecording } from "@/lib/db";
import { formatClock, formatDuration, formatMeetingDate } from "@/lib/format";
import { useDb } from "@/lib/library";
import { PLAYBACK_RATES, playback, usePlayer } from "@/lib/player";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

function Transport({
  icon,
  label,
  onPress,
  testID,
  primary,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID: string;
  primary?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      className={cn(
        "items-center justify-center rounded-full active:opacity-70",
        primary ? "h-16 w-16 bg-primary" : "h-12 w-12 bg-card",
      )}
    >
      <Icon name={icon} size={primary ? 30 : 24} color={primary ? colors.onAccent : colors.ink} />
    </Pressable>
  );
}

export function Meeting({ id }: { id: string }) {
  const db = useDb();
  const rec = getRecording(db, id);
  const state = usePlayer();
  const isCurrent = state.current?.id === id;

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

  const nowPlaying = {
    id: rec.id,
    title: rec.title,
    mediaType: rec.mediaType,
    thumbnailUrl: rec.thumbnailUrl,
    durationMs: rec.durationMs,
  };
  const position = isCurrent ? state.position : 0;
  const duration = isCurrent && state.duration ? state.duration : rec.durationMs / 1000;
  const playing = isCurrent && state.playing;
  const loading = isCurrent && state.status === "loading";

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="bg-background"
      contentContainerClassName="gap-5 px-5 pt-3 pb-10"
    >
      <Stack.Screen options={{ title: "" }} />
      <View className="gap-1">
        <Text
          role="heading"
          className="font-jakarta-extrabold text-[22px] leading-7 tracking-tight"
        >
          {rec.title}
        </Text>
        <Text className="text-[13px] text-muted-foreground">
          {formatMeetingDate(rec.startDatetime)} · {formatDuration(rec.durationMs)} ·{" "}
          {rec.participantCount} people
        </Text>
      </View>

      {isCurrent ? (
        <PlayerView />
      ) : (
        <Pressable
          testID="player-start"
          accessibilityRole="button"
          accessibilityLabel="Play"
          onPress={() => playback.load(nowPlaying)}
          className="aspect-video items-center justify-center rounded-lg bg-foreground active:opacity-90"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-primary">
            <Icon name="play" size={30} color="#FFFFFF" />
          </View>
        </Pressable>
      )}

      <View className="gap-3">
        <View className="h-1.5 overflow-hidden rounded-full bg-card">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${duration ? Math.min(100, (position / duration) * 100) : 0}%` }}
          />
        </View>
        <View className="flex-row justify-between">
          <Text className="font-mono text-[12px] text-muted-foreground">
            {formatClock(position)}
          </Text>
          <Text className="font-mono text-[12px] text-muted-foreground">
            {formatClock(duration)}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-center gap-6">
        <Transport
          testID="seek-back"
          icon="back10"
          label="Back 10 seconds"
          onPress={() => (isCurrent ? playback.seekBy(-10) : playback.load(nowPlaying, { at: 0 }))}
        />
        {loading ? (
          <View className="h-16 w-16 items-center justify-center rounded-full bg-primary">
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : (
          <Transport
            testID="play-pause"
            icon={playing ? "pause" : "play"}
            label={playing ? "Pause" : "Play"}
            primary
            onPress={() => (isCurrent ? playback.toggle() : playback.load(nowPlaying))}
          />
        )}
        <Transport
          testID="seek-forward"
          icon="fwd10"
          label="Forward 10 seconds"
          onPress={() => (isCurrent ? playback.seekBy(10) : playback.load(nowPlaying, { at: 10 }))}
        />
      </View>

      <View className="flex-row items-center justify-center gap-2">
        {isCurrent && rec.mediaType === "video" && isPictureInPictureSupported() ? (
          <Pressable
            testID="pip"
            accessibilityRole="button"
            accessibilityLabel="Picture in picture"
            onPress={() => playback.startPictureInPicture()}
            className="h-8 w-8 items-center justify-center rounded-full border border-border bg-card"
          >
            <Icon name="pip" size={16} />
          </Pressable>
        ) : null}
        {PLAYBACK_RATES.map((rate) => (
          <Pressable
            key={rate}
            testID={`rate-${rate}`}
            accessibilityRole="button"
            onPress={() => playback.setRate(rate)}
            className={cn(
              "rounded-full border px-3 py-1.5",
              state.rate === rate ? "border-primary bg-primary" : "border-border bg-card",
            )}
          >
            <Text
              className={cn(
                "font-jakarta-semibold text-[12px]",
                state.rate === rate ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {rate}×
            </Text>
          </Pressable>
        ))}
      </View>

      {isCurrent && state.status === "error" ? (
        <Text className="text-center text-[13px] text-destructive">{state.error}</Text>
      ) : null}

      {rec.sections.length ? (
        <View className="gap-4 pt-2">
          {rec.sections.map((s) => (
            <View key={s.position} className="gap-1">
              <Text className="font-jakarta-bold text-[15px]">{s.title}</Text>
              <Text className="text-[14px] leading-5 text-foreground">{s.markdown}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

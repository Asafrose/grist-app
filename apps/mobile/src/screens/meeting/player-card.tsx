import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { isPictureInPictureSupported } from "expo-video";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Icon, type IconName } from "@/components/icon";
import { PLAYER_ON_SURFACE, PLAYER_SURFACE, PlayerView } from "@/components/player-view";
import { Scrubber } from "@/components/scrubber";
import { Text } from "@/components/ui/text";
import type { RecordingDetail } from "@/lib/data";
import { formatClock } from "@/lib/format";
import {
  type NowPlaying,
  PLAYBACK_RATES,
  playback,
  useIsCurrent,
  useIsPlaying,
  usePlaybackDuration,
  usePlaybackError,
  usePlaybackPosition,
  usePlaybackRate,
  usePlaybackStatus,
} from "@/lib/player";
import { cn } from "@/lib/utils";

const TAG_BG = "rgba(255,255,255,0.14)";
const TRACK_BG = "rgba(255,255,255,0.25)";

export function toNowPlaying(rec: RecordingDetail): NowPlaying {
  return {
    id: rec.id,
    title: rec.title,
    mediaType: rec.mediaType,
    thumbnailUrl: rec.thumbnailUrl,
    durationMs: rec.durationMs,
  };
}

function SurfaceTag({ icon, label }: { icon?: IconName; label: string }) {
  return (
    <View
      className="h-[22px] flex-row items-center gap-1 rounded-[6px] px-2"
      style={{ backgroundColor: TAG_BG }}
    >
      {icon ? <Icon name={icon} size={14} color={PLAYER_ON_SURFACE} /> : null}
      <Text className="font-jakarta-semibold text-[12px]" style={{ color: PLAYER_ON_SURFACE }}>
        {label}
      </Text>
    </View>
  );
}

function Artwork({ rec }: { rec: RecordingDetail }) {
  const icon: IconName =
    rec.mediaType === "video" ? "video" : rec.mediaType === "audio" ? "mic" : "text";
  return (
    <View className="flex-1 items-center justify-center">
      {rec.thumbnailUrl ? (
        <>
          <Image
            source={rec.thumbnailUrl}
            style={{ position: "absolute", inset: 0 }}
            contentFit="cover"
          />
          <View className="absolute inset-0" style={{ backgroundColor: "rgba(20,22,24,0.45)" }} />
        </>
      ) : (
        <Icon name={icon} size={44} color="rgba(255,255,255,0.35)" />
      )}
    </View>
  );
}

function Transport({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={12}
      className="h-11 w-11 items-center justify-center active:opacity-60"
    >
      <Icon name={icon} size={26} color={PLAYER_ON_SURFACE} />
    </Pressable>
  );
}

function Progress({
  isCurrent,
  fallbackDuration,
  onSeek,
}: {
  isCurrent: boolean;
  fallbackDuration: number;
  onSeek: (seconds: number) => void;
}) {
  const livePosition = usePlaybackPosition();
  const liveDuration = usePlaybackDuration();
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const position = isCurrent ? livePosition : 0;
  const duration = isCurrent && liveDuration ? liveDuration : fallbackDuration;
  return (
    <View className="absolute bottom-3.5 left-3.5 right-3.5">
      <Scrubber
        testID="scrubber"
        position={position}
        duration={duration}
        onSeek={onSeek}
        onScrub={setScrubbing}
        trackColor={TRACK_BG}
        fillColor={PLAYER_ON_SURFACE}
        labelColor={PLAYER_ON_SURFACE}
        labels={false}
      />
      <View className="flex-row justify-between">
        <Text
          testID="position"
          className="font-mono text-[11px]"
          style={{ color: PLAYER_ON_SURFACE, opacity: 0.85 }}
        >
          {formatClock(scrubbing ?? position)}
        </Text>
        <Text
          testID="duration"
          className="font-mono text-[11px]"
          style={{ color: PLAYER_ON_SURFACE, opacity: 0.85 }}
        >
          {formatClock(duration)}
        </Text>
      </View>
    </View>
  );
}

export function PlayerCard({ rec }: { rec: RecordingDetail }) {
  const router = useRouter();
  const isCurrent = useIsCurrent(rec.id);
  const playing = useIsPlaying() && isCurrent;
  const status = usePlaybackStatus();
  const error = usePlaybackError();
  const loading = status === "loading" && isCurrent;
  const rate = usePlaybackRate();
  const [ratesOpen, setRatesOpen] = useState(false);
  const hasMedia = rec.mediaType !== "transcript";
  const nowPlaying = toNowPlaying(rec);

  const seekTo = (seconds: number) =>
    isCurrent ? playback.seekTo(seconds) : void playback.load(nowPlaying, { at: seconds });

  return (
    <View
      className="aspect-video overflow-hidden rounded-lg"
      style={{ backgroundColor: PLAYER_SURFACE }}
    >
      <View className="absolute inset-0">
        {isCurrent ? <PlayerView className="h-full w-full rounded-none" /> : <Artwork rec={rec} />}
      </View>

      {hasMedia ? (
        <>
          <View
            className="absolute top-3 left-3.5 right-3.5 flex-row items-center justify-between"
            pointerEvents="box-none"
          >
            <View className="flex-row items-center gap-1.5">
              <Pressable
                testID="rate"
                accessibilityRole="button"
                accessibilityLabel="Playback speed"
                hitSlop={8}
                onPress={() => setRatesOpen((v) => !v)}
                className="h-[22px] justify-center rounded-[6px] px-2 active:opacity-70"
                style={{ backgroundColor: ratesOpen ? PLAYER_ON_SURFACE : TAG_BG }}
              >
                <Text
                  className="font-jakarta-semibold text-[12px]"
                  style={{ color: ratesOpen ? PLAYER_SURFACE : PLAYER_ON_SURFACE }}
                >
                  {rate}×
                </Text>
              </Pressable>
              {ratesOpen
                ? PLAYBACK_RATES.filter((r) => r !== rate).map((r) => (
                    <Pressable
                      key={r}
                      testID={`rate-${r}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${r} times speed`}
                      onPress={() => {
                        playback.setRate(r);
                        setRatesOpen(false);
                      }}
                      className="h-[22px] justify-center rounded-[6px] px-2 active:opacity-70"
                      style={{ backgroundColor: TAG_BG }}
                    >
                      <Text
                        className="font-jakarta-semibold text-[12px]"
                        style={{ color: PLAYER_ON_SURFACE }}
                      >
                        {r}×
                      </Text>
                    </Pressable>
                  ))
                : null}
            </View>
            {rec.mediaType === "video" ? (
              isCurrent ? (
                <View className="flex-row items-center">
                  {isPictureInPictureSupported() ? (
                    <Pressable
                      testID="pip"
                      accessibilityRole="button"
                      accessibilityLabel="Picture in picture"
                      hitSlop={8}
                      onPress={() => playback.startPictureInPicture()}
                      className="h-9 w-9 items-center justify-center active:opacity-60"
                    >
                      <Icon name="pip" size={20} color={PLAYER_ON_SURFACE} />
                    </Pressable>
                  ) : null}
                  <Pressable
                    testID="player-fullscreen"
                    accessibilityRole="button"
                    accessibilityLabel="Fullscreen"
                    hitSlop={8}
                    onPress={() => router.push("/fullscreen")}
                    className="h-9 w-9 items-center justify-center active:opacity-60"
                  >
                    <Icon name="fullscreen" size={20} color={PLAYER_ON_SURFACE} />
                  </Pressable>
                </View>
              ) : null
            ) : (
              <SurfaceTag icon="mic" label="Audio only" />
            )}
          </View>

          <View
            className="absolute inset-0 flex-row items-center justify-center gap-7"
            pointerEvents="box-none"
          >
            <Transport
              testID="seek-back"
              icon="back10"
              label="Back 10 seconds"
              onPress={() => (isCurrent ? playback.seekBy(-10) : seekTo(0))}
            />
            {loading ? (
              <View
                className="h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
              >
                <ActivityIndicator color={PLAYER_SURFACE} />
              </View>
            ) : (
              <Pressable
                testID={isCurrent ? "play-pause" : "player-start"}
                accessibilityRole="button"
                accessibilityLabel={playing ? "Pause" : "Play"}
                onPress={() => (isCurrent ? playback.toggle() : void playback.load(nowPlaying))}
                className="h-14 w-14 items-center justify-center rounded-full active:opacity-80"
                style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
              >
                <Icon name={playing ? "pause" : "play"} size={26} color={PLAYER_SURFACE} />
              </Pressable>
            )}
            <Transport
              testID="seek-forward"
              icon="fwd10"
              label="Forward 10 seconds"
              onPress={() => (isCurrent ? playback.seekBy(10) : seekTo(10))}
            />
          </View>

          <Progress
            isCurrent={isCurrent}
            fallbackDuration={rec.durationMs / 1000}
            onSeek={seekTo}
          />
        </>
      ) : (
        <View className="absolute bottom-3.5 left-3.5">
          <SurfaceTag icon="text" label="Transcript only" />
        </View>
      )}

      {isCurrent && status === "error" ? (
        <View
          className={cn("absolute right-3.5 left-3.5 bottom-12 rounded-md px-3 py-2")}
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <Text className="text-center text-[12px]" style={{ color: PLAYER_ON_SURFACE }}>
            {error ?? "Playback failed"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

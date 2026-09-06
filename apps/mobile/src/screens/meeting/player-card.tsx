import { Image } from "expo-image";
import { isPictureInPictureSupported } from "expo-video";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Icon, type IconName } from "@/components/icon";
import { PLAYER_ON_SURFACE, PLAYER_SURFACE, PlayerView } from "@/components/player-view";
import { Text } from "@/components/ui/text";
import type { RecordingDetail } from "@/lib/db";
import { formatClock } from "@/lib/format";
import { type NowPlaying, PLAYBACK_RATES, playback, usePlayer } from "@/lib/player";
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

function Scrubber({ progress, onSeek }: { progress: number; onSeek: (fraction: number) => void }) {
  const [width, setWidth] = useState(0);
  const pct = `${Math.max(0, Math.min(1, progress)) * 100}%` as const;
  return (
    <Pressable
      testID="scrubber"
      accessibilityRole="adjustable"
      accessibilityLabel="Playback position"
      hitSlop={{ top: 14, bottom: 14 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={(e) => width && onSeek(e.nativeEvent.locationX / width)}
      className="h-1 rounded-full"
      style={{ backgroundColor: TRACK_BG }}
    >
      <View
        className="h-full rounded-full"
        style={{ width: pct, backgroundColor: PLAYER_ON_SURFACE }}
      />
      <View
        className="absolute -top-[5px] h-3.5 w-3.5 rounded-full"
        style={{ left: pct, marginLeft: -7, backgroundColor: PLAYER_ON_SURFACE }}
      />
    </Pressable>
  );
}

export function PlayerCard({ rec }: { rec: RecordingDetail }) {
  const state = usePlayer();
  const [ratesOpen, setRatesOpen] = useState(false);
  const isCurrent = state.current?.id === rec.id;
  const hasMedia = rec.mediaType !== "transcript";
  const nowPlaying = toNowPlaying(rec);

  const position = isCurrent ? state.position : 0;
  const duration = isCurrent && state.duration ? state.duration : rec.durationMs / 1000;
  const playing = isCurrent && state.playing;
  const loading = isCurrent && state.status === "loading";
  const progress = duration ? position / duration : 0;

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
                  {state.rate}×
                </Text>
              </Pressable>
              {ratesOpen
                ? PLAYBACK_RATES.filter((r) => r !== state.rate).map((rate) => (
                    <Pressable
                      key={rate}
                      testID={`rate-${rate}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${rate} times speed`}
                      onPress={() => {
                        playback.setRate(rate);
                        setRatesOpen(false);
                      }}
                      className="h-[22px] justify-center rounded-[6px] px-2 active:opacity-70"
                      style={{ backgroundColor: TAG_BG }}
                    >
                      <Text
                        className="font-jakarta-semibold text-[12px]"
                        style={{ color: PLAYER_ON_SURFACE }}
                      >
                        {rate}×
                      </Text>
                    </Pressable>
                  ))
                : null}
            </View>
            {rec.mediaType === "video" ? (
              isCurrent && isPictureInPictureSupported() ? (
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

          <View className="absolute bottom-3.5 left-3.5 right-3.5 gap-2">
            <Scrubber progress={progress} onSeek={(f) => seekTo(f * duration)} />
            <View className="flex-row justify-between">
              <Text
                testID="position"
                className="font-mono text-[11px]"
                style={{ color: PLAYER_ON_SURFACE, opacity: 0.85 }}
              >
                {formatClock(position)}
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
        </>
      ) : (
        <View className="absolute bottom-3.5 left-3.5">
          <SurfaceTag icon="text" label="Transcript only" />
        </View>
      )}

      {isCurrent && state.status === "error" ? (
        <View
          className={cn("absolute right-3.5 left-3.5 bottom-12 rounded-md px-3 py-2")}
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <Text className="text-center text-[12px]" style={{ color: PLAYER_ON_SURFACE }}>
            {state.error ?? "Playback failed"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

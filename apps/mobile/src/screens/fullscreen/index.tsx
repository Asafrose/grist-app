import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { isPictureInPictureSupported } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Icon, type IconName } from "@/components/icon";
import { PLAYER_ON_SURFACE, PLAYER_SURFACE, PlayerView } from "@/components/player-view";
import { Scrubber } from "@/components/scrubber";
import { Text } from "@/components/ui/text";
import {
  PLAYBACK_RATES,
  playback,
  useIsPlaying,
  useNowPlaying,
  usePlaybackDuration,
  usePlaybackPosition,
  usePlaybackRate,
} from "@/lib/player";

export const CONTROLS_HIDE_MS = 3000;

const CHROME_BG = "rgba(0,0,0,0.45)";
const TRACK_BG = "rgba(255,255,255,0.28)";

function Control({
  icon,
  label,
  testID,
  onPress,
  size = 44,
}: {
  icon: IconName;
  label: string;
  testID: string;
  onPress: () => void;
  size?: number;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      className="items-center justify-center rounded-full active:opacity-60"
      style={{ height: size, width: size, backgroundColor: CHROME_BG }}
    >
      <Icon name={icon} size={size >= 64 ? 30 : 22} color={PLAYER_ON_SURFACE} />
    </Pressable>
  );
}

function LiveScrubber({
  fallbackDuration,
  onSeek,
}: {
  fallbackDuration: number;
  onSeek: (seconds: number) => void;
}) {
  const position = usePlaybackPosition();
  const duration = usePlaybackDuration() || fallbackDuration;
  return (
    <Scrubber
      testID="fs-scrubber"
      position={position}
      duration={duration}
      onSeek={onSeek}
      trackColor={TRACK_BG}
      fillColor={PLAYER_ON_SURFACE}
      labelColor={PLAYER_ON_SURFACE}
    />
  );
}

export function Fullscreen() {
  const router = useRouter();
  const current = useNowPlaying();
  const playing = useIsPlaying();
  const rate = usePlaybackRate();
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideLater = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!playing) return;
    timer.current = setTimeout(() => setVisible(false), CONTROLS_HIDE_MS);
  }, [playing]);

  const show = useCallback(() => {
    setVisible(true);
    hideLater();
  }, [hideLater]);

  useEffect(() => {
    hideLater();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [hideLater]);

  const controlsShown = visible || !playing;

  const act = (fn: () => void) => () => {
    fn();
    show();
  };

  const nextRate = () => {
    const i = PLAYBACK_RATES.indexOf(rate);
    return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length]!;
  };

  if (!current) {
    return (
      <View
        testID="fullscreen"
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: PLAYER_SURFACE }}
      >
        <StatusBar style="light" hidden />
        <Control
          icon="close"
          label="Close fullscreen"
          testID="fs-close"
          onPress={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View testID="fullscreen" className="flex-1" style={{ backgroundColor: PLAYER_SURFACE }}>
      <StatusBar style="light" hidden />
      <PlayerView fill className="flex-1 rounded-none" />
      <Pressable
        testID="fs-surface"
        accessibilityRole="button"
        accessibilityLabel={controlsShown ? "Hide controls" : "Show controls"}
        onPress={() => (controlsShown ? setVisible(false) : show())}
        className="absolute inset-0"
      />

      {controlsShown ? (
        <View testID="fs-controls" className="absolute inset-0" pointerEvents="box-none">
          <View
            className="absolute top-4 right-4 left-4 flex-row items-center justify-between"
            pointerEvents="box-none"
          >
            <Control
              icon="close"
              label="Close fullscreen"
              testID="fs-close"
              onPress={act(() => router.back())}
            />
            <View className="flex-row items-center gap-3">
              <Pressable
                testID="fs-rate"
                accessibilityRole="button"
                accessibilityLabel={`Speed ${rate}×`}
                hitSlop={10}
                onPress={act(() => playback.setRate(nextRate()))}
                className="h-11 items-center justify-center rounded-full px-3 active:opacity-60"
                style={{ backgroundColor: CHROME_BG }}
              >
                <Text className="font-mono-medium text-[13px]" style={{ color: PLAYER_ON_SURFACE }}>
                  {rate}×
                </Text>
              </Pressable>
              {isPictureInPictureSupported() ? (
                <Control
                  icon="pip"
                  label="Picture in picture"
                  testID="fs-pip"
                  onPress={act(() => void playback.startPictureInPicture())}
                />
              ) : null}
            </View>
          </View>

          <View
            className="absolute inset-0 flex-row items-center justify-center gap-10"
            pointerEvents="box-none"
          >
            <Control
              icon="back10"
              label="Back 10 seconds"
              testID="fs-seek-back"
              onPress={act(() => playback.seekBy(-10))}
            />
            <Control
              icon={playing ? "pause" : "play"}
              label={playing ? "Pause" : "Play"}
              testID="fs-play-pause"
              size={72}
              onPress={act(() => playback.toggle())}
            />
            <Control
              icon="fwd10"
              label="Forward 10 seconds"
              testID="fs-seek-forward"
              onPress={act(() => playback.seekBy(10))}
            />
          </View>

          <View className="absolute right-5 bottom-6 left-5" pointerEvents="box-none">
            <LiveScrubber
              fallbackDuration={current.durationMs / 1000}
              onSeek={(s) => act(() => playback.seekTo(s))()}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

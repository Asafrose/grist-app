import { Image } from "expo-image";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { formatClock } from "@/lib/format";
import {
  playback,
  useIsPlaying,
  useNowPlaying,
  usePlaybackDuration,
  usePlaybackPosition,
  usePlaybackStatus,
} from "@/lib/player";
import { useColors } from "@/theme";

export const MINI_PLAYER_HEIGHT = 60;
export const MINI_PLAYER_GAP = 12;
const TAB_BAR_HEIGHT = 49;
const TAB_PATHS = new Set(["/", "/search", "/clips", "/settings"]);
const DISMISS_DISTANCE = 40;
const DISMISS_VELOCITY = 800;
const EXIT_TRANSLATE = MINI_PLAYER_HEIGHT + 160;

export function useMiniPlayerVisible(): boolean {
  const current = useNowPlaying();
  const pathname = usePathname();
  if (!current) return false;
  return decodeURIComponent(pathname) !== `/meeting/${current.id}`;
}

function Clock({ color }: { color: string }) {
  const position = usePlaybackPosition();
  const duration = usePlaybackDuration();
  return (
    <Text className="font-mono text-[12px] leading-4" style={{ color, opacity: 0.7 }}>
      {formatClock(position)} · {formatClock(duration)}
    </Text>
  );
}

function ProgressFill({ color }: { color: string }) {
  const position = usePlaybackPosition();
  const duration = usePlaybackDuration();
  const progress = duration ? Math.min(1, position / duration) : 0;
  return <View className="h-0.5" style={{ width: `${progress * 100}%`, backgroundColor: color }} />;
}

export function useMiniPlayerInset(): number {
  return useMiniPlayerVisible() ? MINI_PLAYER_HEIGHT + MINI_PLAYER_GAP : 0;
}

function Control({
  icon,
  label,
  testID,
  onPress,
}: {
  icon: IconName;
  label: string;
  testID: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      className="h-10 w-9 items-center justify-center rounded-[12px] active:opacity-60"
    >
      <Icon name={icon} size={24} color={colors.bg} />
    </Pressable>
  );
}

export function MiniPlayer() {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const visible = useMiniPlayerVisible();
  const current = useNowPlaying();
  const playing = useIsPlaying();
  const status = usePlaybackStatus();

  const translateY = useSharedValue(0);

  const dismiss = useCallback(() => {
    playback.stop();
    translateY.set(0);
  }, [translateY]);

  const swipeDown = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(12)
        .failOffsetY(-12)
        .onUpdate((e) => {
          translateY.set(Math.max(0, e.translationY));
        })
        .onEnd((e) => {
          if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
            translateY.set(
              withTiming(EXIT_TRANSLATE, { duration: 180 }, (finished) => {
                if (finished) runOnJS(dismiss)();
              }),
            );
          } else {
            translateY.set(withSpring(0));
          }
        }),
    [dismiss, translateY],
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
    opacity: 1 - Math.min(1, translateY.get() / EXIT_TRANSLATE),
  }));

  if (!visible || !current) return null;

  const onTab = TAB_PATHS.has(pathname);
  const bottom = insets.bottom + (onTab ? TAB_BAR_HEIGHT : 0) + MINI_PLAYER_GAP;

  return (
    <View pointerEvents="box-none" className="absolute right-3 left-3" style={{ bottom }}>
      <GestureDetector gesture={swipeDown}>
        <Animated.View style={cardStyle}>
          <Pressable
            testID="mini-player"
            accessibilityRole="button"
            accessibilityLabel={`Now playing: ${current.title}`}
            onPress={() =>
              router.navigate({ pathname: "/meeting/[id]", params: { id: current.id } })
            }
            className="flex-row items-center gap-2 overflow-hidden rounded-[14px] pr-1 pl-2.5 active:opacity-90"
            style={{
              height: MINI_PLAYER_HEIGHT,
              backgroundColor: colors.ink,
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            <View
              className="h-11 w-11 items-center justify-center overflow-hidden rounded-[10px]"
              style={{ backgroundColor: "#3C444C" }}
            >
              {current.thumbnailUrl ? (
                <Image
                  source={current.thumbnailUrl}
                  style={{ flex: 1, width: "100%" }}
                  contentFit="cover"
                />
              ) : (
                <Icon name="mic" size={20} color="#FFFFFF" />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="font-jakarta-bold text-[14px] leading-[18px]"
                style={{ color: colors.bg }}
              >
                {current.title}
              </Text>
              <Clock color={colors.bg} />
            </View>
            <Control
              testID="mini-seek-back"
              icon="back10"
              label="Back 10 seconds"
              onPress={() => playback.seekBy(-10)}
            />
            {status === "loading" ? (
              <View className="h-10 w-10 items-center justify-center">
                <ActivityIndicator color={colors.bg} />
              </View>
            ) : (
              <Control
                testID="mini-play-pause"
                icon={playing ? "pause" : "play"}
                label={playing ? "Pause" : "Play"}
                onPress={() => playback.toggle()}
              />
            )}
            <Control
              testID="mini-seek-forward"
              icon="fwd10"
              label="Forward 10 seconds"
              onPress={() => playback.seekBy(10)}
            />
            <Control
              testID="mini-close"
              icon="close"
              label="Close player"
              onPress={() => playback.stop()}
            />
            <View
              className="absolute right-3.5 bottom-0 left-3.5 h-0.5"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
            >
              <ProgressFill color={colors.accent} />
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

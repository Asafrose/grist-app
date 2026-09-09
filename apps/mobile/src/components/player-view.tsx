import { Image } from "expo-image";
import { VideoView } from "expo-video";
import { useCallback, useEffect, useState } from "react";
import { Animated, useAnimatedValue, View } from "react-native";
import { Icon } from "@/components/icon";
import { attachVideoView, player, useNowPlaying, usePlaybackStatus } from "@/lib/player";
import { useSetting } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const PLAYER_SURFACE = "#23282D";
export const PLAYER_ON_SURFACE = "#FFFFFF";
export const POSTER_FADE_MS = 220;

function Poster({ uri, ready }: { uri: string | null; ready: boolean }) {
  const opacity = useAnimatedValue(1);
  const [faded, setFaded] = useState(ready);

  useEffect(() => {
    if (!ready || faded) return;
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: POSTER_FADE_MS,
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished) setFaded(true);
    });
    return () => fade.stop();
  }, [ready, faded, opacity]);

  if (faded) return null;
  return (
    <Animated.View
      testID="player-poster"
      pointerEvents="none"
      style={{ position: "absolute", inset: 0, opacity, backgroundColor: PLAYER_SURFACE }}
    >
      {uri ? (
        <Image testID="poster-image" source={uri} style={{ flex: 1 }} contentFit="cover" />
      ) : null}
    </Animated.View>
  );
}

export function PlayerView({ className, fill }: { className?: string; fill?: boolean }) {
  const current = useNowPlaying();
  const status = usePlaybackStatus();
  const pip = useSetting("pictureInPicture");
  const isVideo = current?.mediaType === "video";

  const attach = useCallback(
    (view: VideoView | null) => (view ? attachVideoView(view) : undefined),
    [],
  );

  return (
    <View
      className={cn(fill ? "flex-1" : "aspect-video rounded-lg", "overflow-hidden", className)}
      style={{ backgroundColor: PLAYER_SURFACE }}
    >
      {isVideo ? (
        <>
          <VideoView
            ref={attach}
            player={player}
            style={{ flex: 1 }}
            contentFit="contain"
            nativeControls={false}
            allowsPictureInPicture={pip}
            startsPictureInPictureAutomatically={pip}
          />
          <Poster key={current.id} uri={current.thumbnailUrl} ready={status === "ready"} />
        </>
      ) : (
        <View className="flex-1 items-center justify-center">
          {current?.thumbnailUrl ? (
            <Image
              source={current.thumbnailUrl}
              style={{ flex: 1, width: "100%" }}
              contentFit="cover"
            />
          ) : (
            <Icon name="mic" size={40} color="rgba(255,255,255,0.55)" />
          )}
        </View>
      )}
    </View>
  );
}

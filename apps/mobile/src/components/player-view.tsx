import { Image } from "expo-image";
import { VideoView } from "expo-video";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Icon } from "@/components/icon";
import { attachVideoView, player, useNowPlaying } from "@/lib/player";
import { cn } from "@/lib/utils";

export const PLAYER_SURFACE = "#23282D";
export const PLAYER_ON_SURFACE = "#FFFFFF";

export function PlayerView({ className }: { className?: string }) {
  const current = useNowPlaying();
  const isVideo = current?.mediaType === "video";
  const ref = useRef<VideoView>(null);

  useEffect(() => {
    if (!isVideo || !ref.current) return;
    return attachVideoView(ref.current);
  }, [isVideo]);

  return (
    <View
      className={cn("aspect-video overflow-hidden rounded-lg", className)}
      style={{ backgroundColor: PLAYER_SURFACE }}
    >
      {isVideo ? (
        <VideoView
          ref={ref}
          player={player}
          style={{ flex: 1 }}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically
        />
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

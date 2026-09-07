import { Image } from "expo-image";
import { VideoView } from "expo-video";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Icon } from "@/components/icon";
import { attachVideoView, player, useNowPlaying } from "@/lib/player";
import { useSetting } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const PLAYER_SURFACE = "#23282D";
export const PLAYER_ON_SURFACE = "#FFFFFF";

export function PlayerView({ className, fill }: { className?: string; fill?: boolean }) {
  const current = useNowPlaying();
  const pip = useSetting("pictureInPicture");
  const isVideo = current?.mediaType === "video";
  const ref = useRef<VideoView>(null);

  useEffect(() => {
    if (!isVideo || !ref.current) return;
    return attachVideoView(ref.current);
  }, [isVideo]);

  return (
    <View
      className={cn(fill ? "flex-1" : "aspect-video rounded-lg", "overflow-hidden", className)}
      style={{ backgroundColor: PLAYER_SURFACE }}
    >
      {isVideo ? (
        <VideoView
          ref={ref}
          player={player}
          style={{ flex: 1 }}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture={pip}
          startsPictureInPictureAutomatically={pip}
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

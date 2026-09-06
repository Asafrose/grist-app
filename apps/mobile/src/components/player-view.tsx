import { Image } from "expo-image";
import { VideoView } from "expo-video";
import { View } from "react-native";
import { Icon } from "@/components/icon";
import { player, setVideoView, usePlayer } from "@/lib/player";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

export function PlayerView({ className }: { className?: string }) {
  const colors = useColors();
  const current = usePlayer((s) => s.current);
  const isVideo = current?.mediaType === "video";

  return (
    <View className={cn("aspect-video overflow-hidden rounded-lg bg-foreground", className)}>
      {isVideo ? (
        <VideoView
          ref={setVideoView}
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
            <Icon name="mic" size={40} color={colors.bg} />
          )}
        </View>
      )}
    </View>
  );
}

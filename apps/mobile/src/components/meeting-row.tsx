import { Image } from "expo-image";
import { Link } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Icon } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { meetingCompany } from "@/lib/company";
import { type RecordingListRow, useDownload } from "@/lib/data";
import { formatDurationCompact, formatTime } from "@/lib/format";
import { useThumbnail } from "@/lib/thumbnails";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

function Thumbnail({ item }: { item: RecordingListRow }) {
  const colors = useColors();
  const server = item.thumbnailUrl ?? item.highlightThumbnailUrl;
  const generated = useThumbnail({ ...item, thumbnailUrl: server });
  const uri = generated ?? server;
  return (
    <View className="h-12 w-[72px] overflow-hidden rounded-[8px] bg-foreground">
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: 72, height: 48 }}
          contentFit="cover"
          transition={150}
        />
      ) : generated === undefined && item.mediaType === "video" ? (
        <View testID={`thumb-loading-${item.id}`} className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={colors.ink3} />
        </View>
      ) : (
        <View className="flex-1 items-center justify-center">
          <Icon name={item.mediaType === "video" ? "video" : "mic"} size={20} color={colors.bg} />
        </View>
      )}
      <View
        className="absolute bottom-1 left-1 rounded px-[4px] py-px"
        style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      >
        <Text className="font-mono text-[10px] leading-[14px] text-white">
          {formatDurationCompact(item.durationMs)}
        </Text>
      </View>
    </View>
  );
}

export function MeetingRow({ item, last }: { item: RecordingListRow; last: boolean }) {
  const colors = useColors();
  const downloaded = useDownload(item.id).status === "done";
  const external = item.externalCount > 0;
  const company = meetingCompany(item);
  const recorder = item.recorders[0]?.name;
  return (
    <View className="bg-background">
      <Link href={{ pathname: "/meeting/[id]", params: { id: item.id } }} asChild>
        <Pressable
          testID={`meeting-${item.id}`}
          accessibilityRole="button"
          className="flex-row items-center gap-3.5 px-5 py-3 active:bg-card"
        >
          <Thumbnail item={item} />
          <View className="flex-1 gap-1">
            <Text numberOfLines={1} className="font-jakarta-bold text-[15px] leading-5">
              {item.title}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="font-mono text-[12px] text-muted-foreground">
                {formatTime(item.startDatetime)}
              </Text>
              {downloaded ? (
                <View testID={`downloaded-${item.id}`} accessibilityLabel="Downloaded">
                  <Icon name="download" size={14} color={colors.accent} />
                </View>
              ) : null}
              <View
                className={cn(
                  "h-[22px] justify-center rounded-[6px] px-2",
                  external ? "bg-external-soft" : "bg-accent",
                )}
              >
                <Text
                  className={cn(
                    "font-jakarta-semibold text-[12px]",
                    external ? "text-external" : "text-accent-foreground",
                  )}
                >
                  {external ? "External" : "Internal"}
                </Text>
              </View>
            </View>
            {recorder ? (
              <Text numberOfLines={1} className="text-[12px] text-subtle-foreground">
                {recorder}
              </Text>
            ) : null}
          </View>
          <View className="items-end gap-1.5">
            {company ? (
              <View className="h-[22px] justify-center rounded-[6px] bg-secondary px-2">
                <Text
                  numberOfLines={1}
                  className="font-jakarta-semibold text-[12px] text-muted-foreground"
                >
                  {company}
                </Text>
              </View>
            ) : null}
            <View className="flex-row items-center gap-1">
              <Icon name="people" size={16} color={colors.ink2} />
              <Text className="text-[12px] text-muted-foreground">{item.participantCount}</Text>
            </View>
          </View>
        </Pressable>
      </Link>
      {last ? null : <View className="ml-[106px] h-px bg-border" />}
    </View>
  );
}

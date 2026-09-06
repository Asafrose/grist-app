import { FlashList } from "@shopify/flash-list";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { Link } from "expo-router";
import { Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { type RecordingRow, recordingsQuery } from "@/lib/db";
import { formatDuration, formatMeetingDate } from "@/lib/format";
import { library, useDb, useLibrary } from "@/lib/library";
import { useColors } from "@/theme";

function Row({ item }: { item: RecordingRow }) {
  const colors = useColors();
  return (
    <Link href={{ pathname: "/meeting/[id]", params: { id: item.id } }} asChild>
      <Pressable
        testID={`meeting-${item.id}`}
        className="flex-row items-center gap-3 border-border border-b bg-background px-5 py-3.5 active:bg-card"
      >
        <View className="h-10 w-10 items-center justify-center rounded-[10px] bg-card">
          <Icon name={item.mediaType === "video" ? "video" : "mic"} size={20} color={colors.ink2} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={1} className="font-jakarta-semibold text-[15px] leading-5">
            {item.title}
          </Text>
          <Text className="text-[13px] text-muted-foreground">
            {formatMeetingDate(item.startDatetime)} · {formatDuration(item.durationMs)}
            {item.externalCount > 0 ? " · External" : ""}
          </Text>
        </View>
        <Icon name="chevronRight" color={colors.ink3} />
      </Pressable>
    </Link>
  );
}

export function Meetings() {
  const db = useDb();
  const insets = useSafeAreaInsets();
  const version = useLibrary((s) => s.version);
  const { data } = useLiveQuery(recordingsQuery(db), [version]);
  const sync = useLibrary((s) => s.sync);
  const error = useLibrary((s) => s.error);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-end justify-between px-5 pt-3 pb-3">
        <Text
          role="heading"
          className="font-jakarta-extrabold text-[28px] leading-8 tracking-tight"
        >
          Meetings
        </Text>
        {sync === "error" ? (
          <Text className="text-[12px] text-destructive" numberOfLines={1}>
            {error ?? "Sync failed"}
          </Text>
        ) : null}
      </View>
      <FlashList
        testID="meetings-list"
        data={data}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <Row item={item} />}
        refreshControl={
          <RefreshControl refreshing={sync === "syncing"} onRefresh={() => library.refresh(true)} />
        }
        ListEmptyComponent={
          <View className="items-center gap-2 px-8 py-20">
            <Text className="font-jakarta-semibold text-base">
              {sync === "syncing" ? "Syncing your meetings…" : "No meetings in the last 90 days"}
            </Text>
            <Text className="text-center text-[13px] text-muted-foreground">
              Recordings from your Grain workspace appear here as soon as they sync.
            </Text>
          </View>
        }
      />
    </View>
  );
}

import { FlashList } from "@shopify/flash-list";
import { useMemo } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DayHeader } from "@/components/day-header";
import { MeetingRow } from "@/components/meeting-row";
import { Text } from "@/components/ui/text";
import { type RecordingListRow, useDownloadedRecordings } from "@/lib/data";
import { type DayItem, groupByDay } from "@/lib/sections";

export function Downloads() {
  const insets = useSafeAreaInsets();
  const rows = useDownloadedRecordings();
  const items = useMemo(() => groupByDay(rows ?? []), [rows]);

  return (
    <View testID="downloads-screen" className="flex-1 bg-background">
      <FlashList
        testID="downloads-list"
        data={items}
        keyExtractor={(it: DayItem<RecordingListRow>) => it.key}
        getItemType={(it: DayItem<RecordingListRow>) => it.kind}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        renderItem={({ item }: { item: DayItem<RecordingListRow> }) =>
          item.kind === "header" ? (
            <DayHeader label={item.label} />
          ) : (
            <MeetingRow item={item.item} last={item.last} />
          )
        }
        ListEmptyComponent={
          <View className="items-center gap-2 px-8 py-20">
            <Text className="font-jakarta-semibold text-base">Nothing downloaded yet</Text>
            <Text className="text-center text-[13px] text-muted-foreground">
              Open a meeting, tap Download for offline, and it shows up here — reachable without a
              network.
            </Text>
          </View>
        }
      />
    </View>
  );
}

import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/icon";
import { Markdown, type SeekHandler, TimeTag } from "@/components/markdown";
import { Text } from "@/components/ui/text";
import type { ActionItemRow, RecordingDetail } from "@/lib/db";
import { formatClock } from "@/lib/format";
import { type AssigneeGroup, groupActionItems, initials } from "@/lib/meeting";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

export type { SeekHandler };

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="font-jakarta-semibold text-[12px] uppercase tracking-[0.5px] text-subtle-foreground">
      {children}
    </Text>
  );
}

function AssigneeHeader({ group }: { group: AssigneeGroup }) {
  const colors = useColors();
  const color = colors.speakers[group.colorIndex % colors.speakers.length];
  return (
    <View className="flex-row items-center gap-2">
      <View
        className="h-6 w-6 items-center justify-center rounded-full"
        style={{ backgroundColor: color }}
      >
        <Text className="font-jakarta-bold text-[10px] text-white">{initials(group.name)}</Text>
      </View>
      <Text className="font-jakarta-semibold text-[13px]">{group.name}</Text>
      {group.company ? (
        <Text className="text-[13px] text-muted-foreground">· {group.company}</Text>
      ) : null}
    </View>
  );
}

function ActionItem({ item, onSeek }: { item: ActionItemRow; onSeek: SeekHandler }) {
  const colors = useColors();
  const done = item.status === "completed";
  return (
    <Pressable
      testID={`action-${item.position}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={item.text}
      onPress={() => onSeek(item.timestamp)}
      className="flex-row items-start gap-2.5 active:opacity-70"
    >
      <View
        className={cn(
          "mt-px h-[22px] w-[22px] items-center justify-center rounded-[7px] border-[1.75px]",
          done ? "border-primary bg-primary" : "border-subtle-foreground",
        )}
      >
        {done ? <Icon name="check" size={14} color={colors.onAccent} /> : null}
      </View>
      <Text className={cn("flex-1 text-[15px] leading-[22px]", done && "text-muted-foreground")}>
        {item.text}
      </Text>
      <TimeTag label={formatClock(item.timestamp / 1000)} />
    </Pressable>
  );
}

function Empty({ refreshing }: { refreshing: boolean }) {
  return (
    <View className="items-center gap-2 px-6 py-12">
      <Text className="font-jakarta-semibold text-base">
        {refreshing ? "Checking Grain for the summary…" : "No summary yet"}
      </Text>
      <Text className="text-center text-[13px] text-muted-foreground">
        Grain writes the summary and action items a few minutes after a meeting ends.
      </Text>
    </View>
  );
}

export function SummaryTab({
  rec,
  onSeek,
  refreshing = false,
}: {
  rec: RecordingDetail;
  onSeek: SeekHandler;
  refreshing?: boolean;
}) {
  const groups = groupActionItems(rec.actionItems, rec.participants);
  const empty = !groups.length && !rec.sections.length;

  return (
    <ScrollView
      testID="summary-tab"
      className="flex-1"
      contentContainerClassName="gap-[18px] px-5 pt-4 pb-10"
      contentInsetAdjustmentBehavior="automatic"
    >
      {groups.length ? (
        <View className="gap-2.5">
          <SectionTitle>Action items</SectionTitle>
          {groups.map((group) => (
            <View key={group.key} className="gap-2.5">
              <AssigneeHeader group={group} />
              {group.items.map((item) => (
                <ActionItem key={item.position} item={item} onSeek={onSeek} />
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {rec.sections.map((section) => (
        <View key={section.position} className="gap-2.5">
          <SectionTitle>{section.title}</SectionTitle>
          <Markdown value={section.markdown} onSeek={onSeek} />
        </View>
      ))}

      {empty ? <Empty refreshing={refreshing} /> : null}
    </ScrollView>
  );
}

import { FlashList } from "@shopify/flash-list";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { type ClipRow, highlightsQuery, teamsQuery } from "@/lib/db";
import { formatClock, formatShortDate } from "@/lib/format";
import { library, useDb, useLibrary } from "@/lib/library";
import { type Me, useMe } from "@/lib/me";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

export const CLIPS_PAGE = 50;

export type ClipsFilter = { kind: "workspace" } | { kind: "mine" } | { kind: "team"; id: string };

export function clipHref(clip: ClipRow) {
  return {
    pathname: "/meeting/[id]" as const,
    params: { id: clip.highlight.recordingId, tab: "clips", clip: clip.highlight.id },
  };
}

function Chip({
  label,
  on,
  onPress,
  testID,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      className={cn(
        "h-8 justify-center rounded-full border px-3",
        on ? "border-foreground bg-foreground" : "border-border bg-card",
      )}
    >
      <Text
        className={cn(
          "font-jakarta-semibold text-[13px]",
          on ? "text-background" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ClipCard({ item }: { item: ClipRow }) {
  const colors = useColors();
  const h = item.highlight;
  const creator = item.recorders[0]?.name;
  return (
    <Pressable
      testID={`clip-${h.id}`}
      accessibilityRole="button"
      onPress={() => router.push(clipHref(item))}
      className="flex-row items-start gap-3 bg-background px-5 py-3 active:bg-card"
    >
      <View className="h-16 w-24 overflow-hidden rounded-[10px] bg-foreground">
        {h.thumbnailUrl ? (
          <Image source={h.thumbnailUrl} style={{ flex: 1 }} contentFit="cover" transition={150} />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Icon name="clips" size={22} color={colors.ink3} />
          </View>
        )}
        <View
          className="absolute bottom-1.5 left-1.5 rounded px-[5px] py-px"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <Text className="font-mono text-[11px] leading-4 text-white">
            {formatClock(h.duration / 1000)}
          </Text>
        </View>
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-jakarta-bold text-[14px] leading-[19px]">{h.text}</Text>
        <Text className="text-[12px] leading-4 text-muted-foreground">
          {formatShortDate(h.createdDatetime)}
          {creator ? ` · ${creator}` : ""}
        </Text>
        <View className="flex-row items-center gap-1">
          <Icon name="video" size={14} color={colors.ink2} />
          <Text numberOfLines={1} className="flex-1 text-[12px] leading-4 text-muted-foreground">
            {item.recordingTitle}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function Empty({ filter, me, syncing }: { filter: ClipsFilter; me: Me; syncing: boolean }) {
  const title = syncing
    ? "Syncing your clips…"
    : filter.kind !== "mine"
      ? "No clips yet"
      : me.status === "loading"
        ? "Finding your meetings…"
        : me.id
          ? "No clips from your meetings yet"
          : "Couldn't tell which meetings are yours";
  return (
    <View className="items-center gap-2 px-8 py-20">
      <Text className="font-jakarta-semibold text-base">{title}</Text>
      <Text className="text-center text-[13px] text-muted-foreground">
        Clips your team creates in Grain appear here as soon as they sync.
      </Text>
    </View>
  );
}

export function Clips() {
  const db = useDb();
  const insets = useSafeAreaInsets();
  const version = useLibrary((s) => s.version);
  const sync = useLibrary((s) => s.sync);
  const error = useLibrary((s) => s.error);
  const me = useMe();
  const [filter, setFilter] = useState<ClipsFilter>({ kind: "workspace" });
  const [limit, setLimit] = useState(CLIPS_PAGE);

  const { data: teams } = useLiveQuery(teamsQuery(db), [version]);
  const recorderId = filter.kind === "mine" ? (me.id ?? "none") : undefined;
  const teamId = filter.kind === "team" ? filter.id : undefined;
  const { data } = useLiveQuery(highlightsQuery(db, { limit, teamId, recorderId }), [
    version,
    limit,
    teamId,
    recorderId,
  ]);

  const select = (next: ClipsFilter) => {
    setFilter(next);
    setLimit(CLIPS_PAGE);
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-end justify-between px-5 pt-3 pb-1.5">
        <Text
          role="heading"
          className="font-jakarta-extrabold text-[28px] leading-8 tracking-tight"
        >
          Clips
        </Text>
        {sync === "error" ? (
          <Text className="text-[12px] text-destructive" numberOfLines={1}>
            {error ?? "Sync failed"}
          </Text>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-5 pt-1.5 pb-2"
        className="grow-0"
      >
        <Chip
          testID="chip-workspace"
          label="Workspace"
          on={filter.kind === "workspace"}
          onPress={() => select({ kind: "workspace" })}
        />
        <Chip
          testID="chip-mine"
          label="Mine"
          on={filter.kind === "mine"}
          onPress={() => select({ kind: "mine" })}
        />
        {teams.map((t) => (
          <Chip
            key={t.id}
            testID={`chip-team-${t.id}`}
            label={t.name}
            on={filter.kind === "team" && filter.id === t.id}
            onPress={() => select({ kind: "team", id: t.id })}
          />
        ))}
      </ScrollView>
      <FlashList
        testID="clips-list"
        data={data}
        keyExtractor={(c) => c.highlight.id}
        renderItem={({ item }) => <ClipCard item={item} />}
        ItemSeparatorComponent={() => <View className="ml-32 h-px bg-border" />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (data.length >= limit) setLimit(limit + CLIPS_PAGE);
        }}
        refreshControl={
          <RefreshControl refreshing={sync === "syncing"} onRefresh={() => library.refresh(true)} />
        }
        ListEmptyComponent={<Empty filter={filter} me={me} syncing={sync === "syncing"} />}
      />
    </View>
  );
}

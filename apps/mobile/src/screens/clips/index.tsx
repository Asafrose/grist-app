import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip } from "@/components/chip";
import { Icon } from "@/components/icon";
import { OfflineHint } from "@/components/offline-hint";
import { Text } from "@/components/ui/text";
import { type ClipRow, useClips, useTeams } from "@/lib/data";
import { formatClock, formatShortDate } from "@/lib/format";
import { library, useSyncError, useSyncStatus } from "@/lib/library";
import { useMe, useMeStatus } from "@/lib/me";
import { shareLink } from "@/lib/share";
import { useColors } from "@/theme";

export const CLIPS_PAGE = 50;

export type ClipsFilter = { kind: "workspace" } | { kind: "mine" } | { kind: "team"; id: string };

export function clipHref(clip: ClipRow) {
  return {
    pathname: "/meeting/[id]" as const,
    params: { id: clip.highlight.recordingId, tab: "clips", clip: clip.highlight.id },
  };
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
      <Pressable
        testID={`share-clip-${h.id}`}
        accessibilityRole="button"
        accessibilityLabel="Share clip"
        hitSlop={8}
        onPress={() => shareLink(h.url, h.text)}
        className="p-1 active:opacity-60"
      >
        <Icon name="share" size={18} color={colors.ink2} />
      </Pressable>
    </Pressable>
  );
}

function Empty({ filter, syncing }: { filter: ClipsFilter; syncing: boolean }) {
  const me = useMe();
  const status = useMeStatus();
  const title = syncing
    ? "Syncing your clips…"
    : filter.kind !== "mine"
      ? "No clips yet"
      : status === "loading" || status === "idle"
        ? "Finding your meetings…"
        : me
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
  const insets = useSafeAreaInsets();
  const sync = useSyncStatus();
  const error = useSyncError();
  const me = useMe();
  const [filter, setFilter] = useState<ClipsFilter>({ kind: "workspace" });
  const [limit, setLimit] = useState(CLIPS_PAGE);

  const teams = useTeams();
  const participantEmail = filter.kind === "mine" ? (me?.email ?? "nobody@") : undefined;
  const teamId = filter.kind === "team" ? filter.id : undefined;
  const data = useClips({ limit, teamId, participantEmail });

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
        <View className="flex-row items-center gap-2">
          {sync === "error" ? (
            <Text className="max-w-[180px] text-[12px] text-destructive" numberOfLines={1}>
              {error ?? "Sync failed"}
            </Text>
          ) : null}
          <OfflineHint noun="clips" />
        </View>
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
          selected={filter.kind === "workspace"}
          onPress={() => select({ kind: "workspace" })}
        />
        <Chip
          testID="chip-mine"
          label="Mine"
          selected={filter.kind === "mine"}
          onPress={() => select({ kind: "mine" })}
        />
        {teams.map((t) => (
          <Chip
            key={t.id}
            testID={`chip-team-${t.id}`}
            label={t.name}
            selected={filter.kind === "team" && filter.id === t.id}
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
        ListEmptyComponent={<Empty filter={filter} syncing={sync === "syncing"} />}
      />
    </View>
  );
}

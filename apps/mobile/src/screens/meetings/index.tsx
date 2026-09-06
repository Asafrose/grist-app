import { FlashList } from "@shopify/flash-list";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip } from "@/components/chip";
import { Icon } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { meetingCompany } from "@/lib/company";
import { type RecordingListRow, recordingsQuery } from "@/lib/db";
import { activeChips, filters, toQuery, useFilters, type View as FilterView } from "@/lib/filters";
import { formatDurationCompact, formatTime } from "@/lib/format";
import { library, useDb, useLibrary } from "@/lib/library";
import { type DayItem, groupByDay } from "@/lib/sections";
import { cn } from "@/lib/utils";
import { getWorkspace } from "@/lib/workspace";
import { useColors } from "@/theme";

function Thumbnail({ item }: { item: RecordingListRow }) {
  const colors = useColors();
  return (
    <View className="h-12 w-[72px] overflow-hidden rounded-[8px] bg-foreground">
      {item.thumbnailUrl ? (
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={{ width: 72, height: 48 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <Icon name={item.mediaType === "video" ? "video" : "mic"} size={20} color={colors.bg} />
        </View>
      )}
    </View>
  );
}

function Row({ item, last }: { item: RecordingListRow; last: boolean }) {
  const colors = useColors();
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
                {formatTime(item.startDatetime)} · {formatDurationCompact(item.durationMs)}
              </Text>
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

function DayHeader({ label }: { label: string }) {
  return (
    <View className="bg-background px-5 pt-[18px] pb-1">
      <Text className="font-jakarta-semibold text-[12px] tracking-[0.5px] text-subtle-foreground">
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const sameView = (a: FilterView, b: FilterView) =>
  a.kind === b.kind && (a.kind !== "team" || b.kind !== "team" || a.id === b.id);

export function Meetings() {
  const db = useDb();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const version = useLibrary((s) => s.version);
  const sync = useLibrary((s) => s.sync);
  const error = useLibrary((s) => s.error);
  const state = useFilters();

  const workspace = useMemo(() => getWorkspace(db), [db, version]);
  const filter = useMemo(() => toQuery(state, { meId: workspace.meId }), [state, workspace.meId]);
  const { data, updatedAt } = useLiveQuery(recordingsQuery(db, filter), [version, filter]);
  const items = useMemo(() => groupByDay(data ?? []), [data]);
  const [pulling, setPulling] = useState(false);
  const pull = async () => {
    setPulling(true);
    try {
      await library.refresh(true);
    } finally {
      setPulling(false);
    }
  };

  const chips = activeChips(state, {
    meetingType: workspace.meetingTypes.find((m) => m.id === state.meetingTypeId)?.name,
    recorder: workspace.users.find((u) => u.id === state.recorderId)?.name,
  });
  const views: { view: FilterView; label: string; testID: string }[] = [
    { view: { kind: "mine" }, label: "Mine", testID: "view-mine" },
    { view: { kind: "workspace" }, label: "Workspace", testID: "view-workspace" },
    ...workspace.teams.map((t) => ({
      view: { kind: "team", id: t.id } as FilterView,
      label: t.name,
      testID: `view-team-${t.id}`,
    })),
  ];
  const filtered = chips.length > 0 || state.title.trim().length > 0;
  const openFilters = () => router.push("/filters");

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="h-[52px] flex-row items-center justify-between pr-2.5 pl-5">
        <Text
          role="heading"
          className="font-jakarta-extrabold text-[28px] leading-8 tracking-tight"
        >
          Meetings
        </Text>
        <View className="flex-row items-center gap-2">
          {sync === "error" ? (
            <Text className="max-w-[160px] text-[12px] text-destructive" numberOfLines={1}>
              {error ?? "Sync failed"}
            </Text>
          ) : null}
          <Pressable
            testID="open-filters"
            accessibilityRole="button"
            accessibilityLabel="Filters"
            onPress={openFilters}
            hitSlop={6}
            className="h-11 w-11 items-center justify-center rounded-md active:bg-card"
          >
            <Icon name="sliders" size={24} />
            {chips.length ? (
              <View className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
            ) : null}
          </Pressable>
        </View>
      </View>

      <View className="px-5 pt-1.5">
        <View className="h-11 flex-row items-center gap-2.5 rounded-md bg-secondary px-3.5">
          <Icon name="search" color={colors.ink3} />
          <TextInput
            testID="title-filter"
            accessibilityLabel="Filter by title"
            value={state.title}
            onChangeText={filters.setTitle}
            placeholder="Filter by title"
            placeholderTextColor={colors.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="never"
            className="flex-1 py-0 font-jakarta text-[15px] text-foreground"
          />
          {state.title ? (
            <Pressable
              testID="title-filter-clear"
              accessibilityRole="button"
              accessibilityLabel="Clear title filter"
              onPress={() => filters.setTitle("")}
              hitSlop={8}
            >
              <Icon name="close" size={16} color={colors.ink3} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        className="grow-0"
        contentContainerClassName="flex-row gap-2 px-5 pt-3 pb-1"
      >
        {views.map((v) => (
          <Chip
            key={v.testID}
            testID={v.testID}
            label={v.label}
            selected={sameView(state.view, v.view)}
            onPress={() => filters.setView(v.view)}
          />
        ))}
      </ScrollView>

      {chips.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="grow-0"
          contentContainerClassName="flex-row gap-2 px-5 pt-2 pb-1.5"
        >
          {chips.map((c) => (
            <Chip
              key={c.key}
              testID={`active-${c.key}`}
              size="sm"
              label={c.label}
              tone={c.key === "scope" ? "accent" : "default"}
              leading={c.key === "scope" ? "check" : undefined}
              trailing={c.key === "scope" ? undefined : "chevronDown"}
              onPress={openFilters}
            />
          ))}
        </ScrollView>
      ) : null}

      <FlashList
        testID="meetings-list"
        data={items}
        keyExtractor={(it: DayItem<RecordingListRow>) => it.key}
        getItemType={(it: DayItem<RecordingListRow>) => it.kind}
        maintainVisibleContentPosition={{ disabled: true }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        renderItem={({ item }: { item: DayItem<RecordingListRow> }) =>
          item.kind === "header" ? (
            <DayHeader label={item.label} />
          ) : (
            <Row item={item.item} last={item.last} />
          )
        }
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={pull} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          !updatedAt ? null : (
            <View className="items-center gap-2 px-8 py-20">
              <Text className="font-jakarta-semibold text-base">
                {sync === "syncing"
                  ? "Syncing your meetings…"
                  : filtered
                    ? "No meetings match"
                    : "No meetings in the last 90 days"}
              </Text>
              <Text className="text-center text-[13px] text-muted-foreground">
                {filtered
                  ? "Try a different title or clear some filters."
                  : "Recordings from your Grain workspace appear here as soon as they sync."}
              </Text>
              {filtered ? (
                <Pressable
                  testID="reset-filters"
                  accessibilityRole="button"
                  onPress={filters.reset}
                  className="mt-2 rounded-full border border-border px-3.5 py-1.5 active:opacity-70"
                >
                  <Text className="font-jakarta-semibold text-[13px] text-accent-foreground">
                    Reset filters
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
      />
    </View>
  );
}

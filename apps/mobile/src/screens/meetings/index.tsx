import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip } from "@/components/chip";
import { DayHeader } from "@/components/day-header";
import { Icon } from "@/components/icon";
import { MeetingRow } from "@/components/meeting-row";
import { Text } from "@/components/ui/text";
import {
  type RecordingListRow,
  type RecordingsFilter,
  useRecordings,
  useWorkspace,
} from "@/lib/data";
import { activeChips, filters, toQuery, useFilters, type View as FilterView } from "@/lib/filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTokenRejected } from "@/lib/auth";
import { library, useSyncError, useSyncStatus } from "@/lib/library";
import { useMe } from "@/lib/me";
import { type DayItem, groupByDay } from "@/lib/sections";
import { useColors } from "@/theme";
import { TokenBanner } from "./token-banner";

const sameView = (a: FilterView, b: FilterView) =>
  a.kind === b.kind && (a.kind !== "team" || b.kind !== "team" || a.id === b.id);

function MeetingList({
  filter,
  filtered,
  sync,
  pulling,
  onRefresh,
  bottom,
}: {
  filter: RecordingsFilter;
  filtered: boolean;
  sync: ReturnType<typeof useSyncStatus>;
  pulling: boolean;
  onRefresh: () => void;
  bottom: number;
}) {
  const colors = useColors();
  const { data, updatedAt } = useRecordings(filter);
  const items = useMemo(() => groupByDay(data ?? []), [data]);
  return (
    <FlashList
      testID="meetings-list"
      data={items}
      keyExtractor={(it: DayItem<RecordingListRow>) => it.key}
      getItemType={(it: DayItem<RecordingListRow>) => it.kind}
      maintainVisibleContentPosition={{ disabled: true }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: bottom + 16 }}
      renderItem={({ item }: { item: DayItem<RecordingListRow> }) =>
        item.kind === "header" ? (
          <DayHeader label={item.label} />
        ) : (
          <MeetingRow item={item.item} last={item.last} />
        )
      }
      refreshControl={
        <RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={colors.accent} />
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
  );
}

export function Meetings() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sync = useSyncStatus();
  const error = useSyncError();
  const rejected = useTokenRejected();
  const state = useFilters();

  const workspace = useWorkspace();
  const meEmail = useMe()?.email ?? null;
  const [typed, setTyped] = useState(state.title);
  const [storeTitle, setStoreTitle] = useState(state.title);
  if (state.title !== storeTitle) {
    setStoreTitle(state.title);
    if (state.title !== typed) setTyped(state.title);
  }
  const title = useDebouncedValue(typed);
  const filter = useMemo(() => toQuery({ ...state, title }, { meEmail }), [state, title, meEmail]);
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
          {sync === "error" && !rejected ? (
            <Text className="max-w-[160px] text-[12px] text-destructive" numberOfLines={1}>
              {error ?? "Sync failed"}
            </Text>
          ) : null}
          {sync === "syncing" && !pulling ? (
            <View testID="syncing" className="flex-row items-center gap-1.5">
              <ActivityIndicator size="small" color={colors.ink3} />
              <Text className="text-[12px] text-muted-foreground">Syncing…</Text>
            </View>
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

      <TokenBanner />

      <View className="px-5 pt-1.5">
        <View className="h-11 flex-row items-center gap-2.5 rounded-md bg-secondary px-3.5">
          <Icon name="search" color={colors.ink3} />
          <TextInput
            testID="title-filter"
            accessibilityLabel="Filter by title"
            value={typed}
            onChangeText={(text) => {
              setTyped(text);
              filters.setTitle(text);
            }}
            placeholder="Filter by title"
            placeholderTextColor={colors.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="never"
            className="flex-1 py-0 font-jakarta text-[15px] text-foreground"
          />
          {typed ? (
            <Pressable
              testID="title-filter-clear"
              accessibilityRole="button"
              accessibilityLabel="Clear title filter"
              onPress={() => {
                setTyped("");
                filters.setTitle("");
              }}
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

      <MeetingList
        filter={filter}
        filtered={filtered}
        sync={sync}
        pulling={pulling}
        onRefresh={pull}
        bottom={insets.bottom}
      />
    </View>
  );
}

import { useRouter } from "expo-router";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip } from "@/components/chip";
import { Icon, type IconName } from "@/components/icon";
import { NativeDatePicker } from "@/components/native-date-picker";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  type Option,
  useParticipantOptions,
  useRecorderOptions,
  useRecordingCount,
  useTagOptions,
  useWorkspace,
} from "@/lib/data";
import {
  type DatePreset,
  defaultFilters,
  filters,
  PRESET_DAYS,
  type Scope,
  type SheetFilters,
  sheetFilters,
  toQuery,
  useFilterTitle,
  type View as FilterView,
  withCustomDate,
} from "@/lib/filters";
import { useMe } from "@/lib/me";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "external", label: "External" },
  { value: "internal", label: "Internal" },
];
const PRESETS = Object.keys(PRESET_DAYS) as DatePreset[];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="font-jakarta-semibold text-xs uppercase tracking-wider text-subtle-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

function ChipRow({
  options,
  selected,
  onSelect,
  testPrefix,
}: {
  options: { id: string; name: string }[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  testPrefix: string;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => (
        <Chip
          key={o.id}
          testID={`${testPrefix}-${o.id}`}
          label={o.name}
          selected={selected === o.id}
          onPress={() => onSelect(selected === o.id ? null : o.id)}
        />
      ))}
    </View>
  );
}

function MoreRow({
  icon,
  label,
  value,
  open,
  onPress,
  first,
  testID,
}: {
  icon: IconName;
  label: string;
  value: string | null;
  open: boolean;
  onPress: () => void;
  first?: boolean;
  testID: string;
}) {
  const colors = useColors();
  return (
    <>
      {first ? null : <View className="ml-11 h-px bg-border" />}
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        className="h-12 flex-row items-center gap-3 px-3.5 active:bg-secondary"
      >
        <Icon name={icon} color={colors.ink2} />
        <Text className="flex-1 font-jakarta-semibold text-[15px]">{label}</Text>
        <Text
          numberOfLines={1}
          className={cn(
            "max-w-[150px] text-[13px]",
            value ? "text-accent-foreground" : "text-muted-foreground",
          )}
        >
          {value ?? "Any"}
        </Text>
        <Icon name={open ? "chevronDown" : "chevronRight"} color={colors.ink3} />
      </Pressable>
    </>
  );
}

function OptionList({
  options,
  selected,
  onSelect,
  testPrefix,
  empty,
}: {
  options: Option[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  testPrefix: string;
  empty: string;
}) {
  if (!options.length) {
    return <Text className="px-3.5 pb-3 text-[13px] text-muted-foreground">{empty}</Text>;
  }
  return (
    <View className="flex-row flex-wrap gap-2 px-3.5 pb-3">
      {options.map((o) => (
        <Chip
          key={o.id}
          testID={`${testPrefix}-${o.id}`}
          label={o.count > 1 ? `${o.name} · ${o.count}` : o.name}
          selected={selected === o.id}
          onPress={() => onSelect(selected === o.id ? null : o.id)}
        />
      ))}
    </View>
  );
}

type More = "participant" | "tag" | "recorderId" | null;

const nameOf = (list: { id: string; name: string }[], id: string | null) =>
  list.find((o) => o.id === id)?.name ?? null;

export function Filters() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const title = useFilterTitle();
  const [draft, setDraft] = useState<SheetFilters>(() => sheetFilters(filters.current()));
  const [more, setMore] = useState<More>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const [baseView] = useState<FilterView>(() => {
    const view = filters.current().view;
    return view.kind === "team" ? defaultFilters.view : view;
  });

  const workspace = useWorkspace();
  const people = useParticipantOptions(40);
  const tags = useTagOptions();
  const recorded = useRecorderOptions();
  const recorders = useMemo<Option[]>(
    () =>
      recorded.map((r) => ({
        ...r,
        name: workspace.users.find((u) => u.id === r.id)?.name ?? r.name,
      })),
    [recorded, workspace.users],
  );
  const meEmail = useMe()?.email ?? null;
  const count = useRecordingCount(
    useMemo(() => toQuery({ ...draft, title }, { meEmail }), [draft, title, meEmail]),
  );

  const patch = (p: Partial<SheetFilters>) => setDraft((d) => ({ ...d, ...p }));
  const custom = draft.date?.preset === "custom" ? draft.date : null;
  const teamId = draft.view.kind === "team" ? draft.view.id : null;

  const apply = () => {
    filters.apply(draft);
    router.back();
  };

  return (
    <View className="flex-1 bg-card" collapsable={false}>
      <ScrollView
        testID="filters-scroll"
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-[22px] px-5 pt-3"
        contentContainerStyle={{ paddingBottom: footerHeight + 24 }}
      >
        <View className="flex-row items-center">
          <Text role="heading" className="flex-1 font-jakarta-bold text-[20px] tracking-tight">
            Filters
          </Text>
          <Pressable
            testID="filters-reset"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              setDraft(sheetFilters(defaultFilters));
              setMore(null);
            }}
          >
            <Text className="font-jakarta-semibold text-[14px] text-accent-foreground">Reset</Text>
          </Pressable>
        </View>

        <Section title="Scope">
          <View className="flex-row gap-1 rounded-md bg-secondary p-1">
            {SCOPES.map((s) => {
              const on = draft.scope === s.value;
              return (
                <Pressable
                  key={s.value}
                  testID={`scope-${s.value}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => patch({ scope: s.value })}
                  className="h-[34px] flex-1 items-center justify-center rounded-[9px]"
                  style={
                    on
                      ? { backgroundColor: colors.surface, boxShadow: "0 1px 2px rgba(0,0,0,0.10)" }
                      : null
                  }
                >
                  <Text
                    className={cn(
                      "font-jakarta-semibold text-[13px]",
                      on ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="Date">
          <View className="flex-row flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Chip
                key={p}
                testID={`date-${p}`}
                label={`${PRESET_DAYS[p]} days`}
                selected={draft.date?.preset === p}
                onPress={() => patch({ date: draft.date?.preset === p ? null : { preset: p } })}
              />
            ))}
            <Chip
              testID="date-custom"
              label="Custom"
              leading="calendar"
              selected={!!custom}
              onPress={() =>
                patch({ date: custom ? null : { preset: "custom", from: null, to: null } })
              }
            />
          </View>
          {custom ? (
            <View className="flex-row items-center gap-3 pt-1">
              <View className="flex-1 gap-1">
                <Text className="text-[12px] text-muted-foreground">From</Text>
                <NativeDatePicker
                  testID="date-from"
                  value={custom.from ? new Date(custom.from) : null}
                  onChange={(d) => patch({ date: withCustomDate(custom, "from", d.toISOString()) })}
                />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-[12px] text-muted-foreground">To</Text>
                <NativeDatePicker
                  testID="date-to"
                  value={custom.to ? new Date(custom.to) : null}
                  onChange={(d) => patch({ date: withCustomDate(custom, "to", d.toISOString()) })}
                />
              </View>
            </View>
          ) : null}
        </Section>

        {workspace.meetingTypes.length ? (
          <Section title="Meeting type">
            <ChipRow
              testPrefix="type"
              options={workspace.meetingTypes}
              selected={draft.meetingTypeId}
              onSelect={(id) => patch({ meetingTypeId: id })}
            />
          </Section>
        ) : null}

        {workspace.teams.length ? (
          <Section title="Team">
            <ChipRow
              testPrefix="team"
              options={workspace.teams}
              selected={teamId}
              onSelect={(id) => patch({ view: id ? { kind: "team", id } : baseView })}
            />
          </Section>
        ) : null}

        <Section title="More">
          <View className="overflow-hidden rounded-lg border border-border bg-card">
            <MoreRow
              first
              testID="more-participant"
              icon="people"
              label="Participant"
              value={draft.participant}
              open={more === "participant"}
              onPress={() => setMore(more === "participant" ? null : "participant")}
            />
            {more === "participant" ? (
              <OptionList
                testPrefix="participant"
                options={people}
                selected={draft.participant}
                onSelect={(id) => patch({ participant: id })}
                empty="No participants yet"
              />
            ) : null}
            <MoreRow
              testID="more-tag"
              icon="tag"
              label="Tag"
              value={draft.tag}
              open={more === "tag"}
              onPress={() => setMore(more === "tag" ? null : "tag")}
            />
            {more === "tag" ? (
              <OptionList
                testPrefix="tag"
                options={tags}
                selected={draft.tag}
                onSelect={(id) => patch({ tag: id })}
                empty="No tags on your meetings yet"
              />
            ) : null}
            <MoreRow
              testID="more-recorder"
              icon="mic"
              label="Recorder"
              value={nameOf(recorders, draft.recorderId)}
              open={more === "recorderId"}
              onPress={() => setMore(more === "recorderId" ? null : "recorderId")}
            />
            {more === "recorderId" ? (
              <OptionList
                testPrefix="recorder"
                options={recorders}
                selected={draft.recorderId}
                onSelect={(id) => patch({ recorderId: id })}
                empty="No recorders yet"
              />
            ) : null}
          </View>
        </Section>
      </ScrollView>

      <View
        testID="filters-footer"
        className="px-5 pt-2"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
      >
        <Button
          testID="filters-apply"
          size="lg"
          className="h-[50px] rounded-lg"
          onPress={apply}
          accessibilityLabel={`Show ${count} meetings`}
        >
          <Text className="font-jakarta-bold text-base">
            {count === 1 ? "Show 1 meeting" : `Show ${count} meetings`}
          </Text>
        </Button>
        {count === 0 ? (
          <View className="flex-row items-center justify-center gap-1.5 pt-2">
            <Icon name="close" size={14} color={colors.ink3} />
            <Text className="text-[12px] text-muted-foreground">Nothing matches these filters</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

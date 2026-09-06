import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Pressable, type TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  type Db,
  type HighlightHit,
  indexStats,
  type RecordingRow,
  searchHighlights,
  searchRecordings,
  searchTranscriptsGrouped,
  type TranscriptHit,
} from "@/lib/db";
import { formatClock, formatDuration, formatMeetingDate } from "@/lib/format";
import { useDb, useLibrary } from "@/lib/library";
import { addRecentSearch, clearRecentSearches, getRecentSearches } from "@/lib/recent-searches";
import { type SnippetRun, snippetRuns } from "@/lib/snippet";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

type Segment = "titles" | "transcripts" | "clips";

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "titles", label: "Titles" },
  { key: "transcripts", label: "Transcripts" },
  { key: "clips", label: "Clips" },
];

type Item =
  | { kind: "recording"; key: string; rec: RecordingRow; header: boolean }
  | { kind: "hit"; key: string; rec: RecordingRow; hit: TranscriptHit; last: boolean }
  | { kind: "clip"; key: string; hit: HighlightHit };

function Thumb({ mediaType }: { mediaType: string }) {
  const colors = useColors();
  return (
    <View className="h-[38px] w-14 items-center justify-center rounded-lg bg-foreground">
      <Icon name={mediaType === "video" ? "video" : "mic"} size={18} color={colors.bg} />
    </View>
  );
}

function keyedRuns(runs: SnippetRun[]): (SnippetRun & { key: number })[] {
  let offset = 0;
  return runs.map((r) => {
    const key = offset;
    offset += r.text.length;
    return { ...r, key };
  });
}

function Runs({ runs }: { runs: SnippetRun[] }) {
  return (
    <>
      {keyedRuns(runs).map((r) =>
        r.match ? (
          <Text key={r.key} className="font-jakarta-bold text-[13px] leading-5 text-foreground">
            {r.text}
          </Text>
        ) : (
          <Text key={r.key} className="text-[13px] leading-5 text-muted-foreground">
            {r.text}
          </Text>
        ),
      )}
    </>
  );
}

type Results = { items: Item[]; matches: number };

function buildResults(db: Db, q: string, segment: Segment): Results {
  if (!q) return { items: [], matches: 0 };
  if (segment === "titles") {
    const recs = searchRecordings(db, q);
    return {
      items: recs.map<Item>((rec) => ({ kind: "recording", key: rec.id, rec, header: false })),
      matches: recs.length,
    };
  }
  if (segment === "transcripts") {
    const groups = searchTranscriptsGrouped(db, q);
    const items: Item[] = [];
    let matches = 0;
    for (const g of groups) {
      items.push({ kind: "recording", key: g.recording.id, rec: g.recording, header: true });
      g.hits.forEach((hit, i) => {
        items.push({
          kind: "hit",
          key: `${hit.recordingId}-${hit.idx}`,
          rec: g.recording,
          hit,
          last: i === g.hits.length - 1,
        });
      });
      matches += g.hits.length;
    }
    return { items, matches };
  }
  const hits = searchHighlights(db, q);
  return {
    items: hits.map<Item>((hit) => ({ kind: "clip", key: hit.highlight.id, hit })),
    matches: hits.length,
  };
}

function RecordingRowView({
  rec,
  header,
  onPress,
}: {
  rec: RecordingRow;
  header: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={`result-recording-${rec.id}`}
      accessibilityRole="button"
      onPress={onPress}
      className={cn(
        "flex-row items-center gap-3 px-5 pt-3 active:opacity-70",
        header ? "pb-2" : "border-border border-b pb-3",
      )}
    >
      <Thumb mediaType={rec.mediaType} />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="font-jakarta-bold text-[15px] leading-5">
          {rec.title}
        </Text>
        <Text numberOfLines={1} className="font-mono text-[12px] text-muted-foreground">
          {formatMeetingDate(rec.startDatetime)} · {formatDuration(rec.durationMs)}
          {rec.externalCount > 0 ? " · External" : ""}
        </Text>
      </View>
    </Pressable>
  );
}

function HitRow({
  hit,
  last,
  onPress,
}: {
  hit: TranscriptHit;
  last: boolean;
  onPress: () => void;
}) {
  const runs = useMemo(() => snippetRuns(hit.snippet), [hit.snippet]);
  return (
    <Pressable
      testID={`result-hit-${hit.recordingId}-${hit.idx}`}
      accessibilityRole="button"
      onPress={onPress}
      className={cn(
        "flex-row items-start gap-2.5 pr-5 pl-[68px] pb-3 active:opacity-70",
        last && "border-border border-b",
      )}
    >
      <View className="w-0.5 self-stretch rounded-full bg-border" />
      <Text className="flex-1 text-[13px] leading-5 text-muted-foreground">
        <Text className="font-jakarta-semibold text-[13px] leading-5 text-muted-foreground">
          {hit.speaker}:{" "}
        </Text>
        <Runs runs={runs} />
      </Text>
      <View className="h-6 justify-center rounded-md bg-secondary px-2">
        <Text className="font-mono text-[12px] text-muted-foreground">
          {formatClock(hit.start / 1000)}
        </Text>
      </View>
    </Pressable>
  );
}

function ClipRow({ hit, onPress }: { hit: HighlightHit; onPress: () => void }) {
  const runs = useMemo(() => snippetRuns(hit.snippet), [hit.snippet]);
  return (
    <Pressable
      testID={`result-clip-${hit.highlight.id}`}
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-start gap-3 border-border border-b px-5 py-3 active:opacity-70"
    >
      <Thumb mediaType={hit.recording.mediaType} />
      <View className="flex-1 gap-1">
        <Text numberOfLines={3} className="text-[13px] leading-5 text-muted-foreground">
          <Runs runs={runs} />
        </Text>
        <Text numberOfLines={1} className="font-mono text-[12px] text-muted-foreground">
          {hit.recording.title} · {formatClock(hit.highlight.timestamp / 1000)} ·{" "}
          {formatClock(hit.highlight.duration / 1000)}
        </Text>
      </View>
    </Pressable>
  );
}

export function Search() {
  const db = useDb();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const version = useLibrary((s) => s.version);
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [segment, setSegment] = useState<Segment>("titles");
  const [recent, setRecent] = useState(() => getRecentSearches(db));

  const typed = query.trim();
  const debounced = useDebouncedValue(typed);
  const q = typed ? debounced : "";

  const snapshot = useMemo(() => ({ db, version }), [db, version]);
  const stats = useMemo(() => indexStats(snapshot.db), [snapshot]);
  const { items, matches } = useMemo(
    () => buildResults(snapshot.db, q, segment),
    [snapshot, q, segment],
  );

  const remember = (text: string) => {
    if (text.trim()) setRecent(addRecentSearch(db, text));
  };

  const open = (item: Item) => {
    remember(q);
    if (item.kind === "recording") {
      router.push({ pathname: "/meeting/[id]", params: { id: item.rec.id } });
    } else if (item.kind === "hit") {
      router.push({
        pathname: "/meeting/[id]",
        params: { id: item.rec.id, tab: "transcript", t: String(item.hit.start) },
      });
    } else {
      router.push({
        pathname: "/meeting/[id]",
        params: { id: item.hit.recording.id, tab: "clips", clip: item.hit.highlight.id },
      });
    }
  };

  const cancel = () => {
    setQuery("");
    inputRef.current?.blur();
  };

  const segmentLabel = SEGMENTS.find((s) => s.key === segment)!.label.toLowerCase();
  const unindexed = stats.total - stats.indexed;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="h-[52px] flex-row items-center gap-2.5 px-5">
        <View
          className={cn(
            "h-11 flex-1 flex-row items-center gap-2.5 rounded-xl border-[1.5px] px-3.5",
            focused ? "border-primary bg-card" : "border-transparent bg-secondary",
          )}
        >
          <Icon name="search" size={20} color={focused ? colors.ink : colors.ink3} />
          <Input
            ref={inputRef}
            testID="search-input"
            accessibilityLabel="Search meetings"
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => remember(query)}
            placeholder="Search titles, transcripts, clips"
            placeholderTextColor={colors.ink3}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
            className="h-11 flex-1 border-0 bg-transparent px-0 text-[15px] shadow-none"
          />
          {query ? (
            <Pressable
              testID="search-clear"
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => setQuery("")}
            >
              <Icon name="close" size={20} color={colors.ink3} />
            </Pressable>
          ) : null}
        </View>
        {focused || query ? (
          <Pressable testID="search-cancel" accessibilityRole="button" onPress={cancel}>
            <Text className="font-jakarta-semibold text-[15px] text-primary">Cancel</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="px-5 pt-2.5">
        <View className="flex-row gap-1 rounded-xl bg-secondary p-1">
          {SEGMENTS.map((s) => {
            const on = s.key === segment;
            return (
              <Pressable
                key={s.key}
                testID={`segment-${s.key}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setSegment(s.key)}
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
      </View>

      <View className="flex-row items-center gap-1.5 px-5 pt-2.5 pb-1">
        <Icon name="wifi" size={16} color={colors.ink3} />
        <Text testID="index-stats" className="text-[12px] text-muted-foreground">
          {stats.indexed} of {stats.total} meetings indexed on this device
          {q ? ` · ${matches} ${matches === 1 ? "match" : "matches"}` : ""}
        </Text>
      </View>

      {q ? (
        <FlashList
          testID="search-results"
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.kind}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            item.kind === "recording" ? (
              <RecordingRowView rec={item.rec} header={item.header} onPress={() => open(item)} />
            ) : item.kind === "hit" ? (
              <HitRow hit={item.hit} last={item.last} onPress={() => open(item)} />
            ) : (
              <ClipRow hit={item.hit} onPress={() => open(item)} />
            )
          }
          ListEmptyComponent={
            <View testID="no-results" className="items-center gap-2 px-8 py-16">
              <Text className="font-jakarta-semibold text-base">
                No {segmentLabel} for “{q}”
              </Text>
              <Text className="text-center text-[13px] text-muted-foreground">
                {segment === "transcripts" && unindexed > 0
                  ? `${unindexed} ${unindexed === 1 ? "meeting isn't" : "meetings aren't"} indexed yet. Transcripts download on Wi-Fi.`
                  : "Try another word, or switch segment."}
              </Text>
            </View>
          }
        />
      ) : recent.length ? (
        <View testID="recent-searches" className="gap-1 px-5 pt-4">
          <View className="flex-row items-center justify-between pb-1">
            <Text className="font-jakarta-semibold text-[12px] uppercase tracking-wider text-subtle-foreground">
              Recent searches
            </Text>
            <Pressable
              testID="clear-recent"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                clearRecentSearches(db);
                setRecent([]);
              }}
            >
              <Text className="font-jakarta-semibold text-[13px] text-primary">Clear</Text>
            </Pressable>
          </View>
          {recent.map((term, i) => (
            <Pressable
              key={term}
              testID={`recent-${i}`}
              accessibilityRole="button"
              onPress={() => setQuery(term)}
              className="h-11 flex-row items-center gap-3 active:opacity-70"
            >
              <Icon name="clock" size={18} color={colors.ink3} />
              <Text numberOfLines={1} className="flex-1 text-[15px]">
                {term}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View testID="search-empty" className="items-center gap-2 px-8 pt-20">
          <Icon name="search" size={28} color={colors.ink3} />
          <Text className="pt-2 font-jakarta-semibold text-base">Search your meetings</Text>
          <Text className="text-center text-[13px] leading-5 text-muted-foreground">
            Titles, transcripts and clips from the last 90 days. Transcripts are searched on this
            device, so indexed meetings work offline.
          </Text>
        </View>
      )}
    </View>
  );
}

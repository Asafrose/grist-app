import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { memo, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, TextInput, View } from "react-native";
import { Chip } from "@/components/chip";
import { Icon } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { type TranscriptSegmentRow, useTranscript } from "@/lib/data";
import { formatClock } from "@/lib/format";
import { useIsCurrent, usePlaybackPosition } from "@/lib/player";
import { initials } from "@/lib/transcript";
import {
  highlightRuns,
  indexAt,
  matchingSegments,
  normalizeQuery,
  speakerColors,
  stepMatch,
} from "@/lib/transcript-reader";
import { cn } from "@/lib/utils";
import { type Colors, useColors } from "@/theme";
import type { TabProps } from "./coming-soon";

type ListRef = RefObject<FlashListRef<TranscriptSegmentRow> | null>;

const CENTER = { animated: true, viewPosition: 0.5 } as const;

const Line = memo(function Line({
  seg,
  idx,
  color,
  current,
  query,
  active,
  colors,
  onPress,
}: {
  seg: TranscriptSegmentRow;
  idx: number;
  color: string;
  current: boolean;
  query: string;
  active: boolean;
  colors: Colors;
  onPress: (ms: number) => void;
}) {
  const runs = highlightRuns(seg.text, query);
  return (
    <Pressable
      testID={`transcript-line-${idx}`}
      accessibilityRole="button"
      accessibilityLabel={`${seg.speaker}, ${formatClock(seg.start / 1000)}`}
      accessibilityState={{ selected: current }}
      onPress={() => onPress(seg.start)}
      className={cn(
        "flex-row items-start gap-3 px-5 py-2.5 active:opacity-70",
        current && "bg-accent",
      )}
    >
      <View
        className="mt-0.5 h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: color }}
      >
        <Text className="font-jakarta-bold text-[11px] text-white">{initials(seg.speaker)}</Text>
      </View>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="font-jakarta-bold text-[13px]" style={{ color }}>
            {seg.speaker}
          </Text>
          <Text className="font-mono text-[11px] text-muted-foreground">
            {formatClock(seg.start / 1000)}
          </Text>
        </View>
        <Text className="text-[15px] leading-[22px]">
          {runs.map((run) =>
            run.match ? (
              <Text
                key={run.at}
                className="font-jakarta-bold text-[15px] leading-[22px]"
                style={{
                  backgroundColor: active ? colors.accent : colors.accentSoft,
                  color: active ? colors.onAccent : colors.ink,
                }}
              >
                {run.text}
              </Text>
            ) : (
              run.text
            ),
          )}
        </Text>
      </View>
    </Pressable>
  );
});

function FollowDriver({
  segments,
  listRef,
  following,
  onIndex,
}: {
  segments: TranscriptSegmentRow[];
  listRef: ListRef;
  following: boolean;
  onIndex: (idx: number) => void;
}) {
  const position = usePlaybackPosition();
  const idx = indexAt(segments, position * 1000);
  useEffect(() => {
    onIndex(idx);
  }, [idx, onIndex]);
  useEffect(() => {
    if (following && idx >= 0) void listRef.current?.scrollToIndex({ index: idx, ...CENTER });
  }, [idx, following, listRef]);
  return null;
}

function IconButton({
  testID,
  label,
  icon,
  flip,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  icon: "chevronDown" | "close";
  flip?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      className="h-10 w-9 items-center justify-center rounded-[12px] active:opacity-60"
      style={flip ? { transform: [{ rotate: "180deg" }] } : undefined}
    >
      <Icon name={icon} size={20} color={disabled ? colors.ink3 : colors.ink} />
    </Pressable>
  );
}

function Empty() {
  return (
    <View testID="transcript-empty" className="items-center gap-2 px-6 py-12">
      <Text className="font-jakarta-semibold text-base">Transcript not downloaded yet</Text>
      <Text className="text-center text-[13px] text-muted-foreground">
        Transcripts download in the background on Wi-Fi. Pull to refresh on Meetings to try now.
      </Text>
    </View>
  );
}

export function TranscriptTab({ rec, onSeek }: TabProps) {
  const colors = useColors();
  const segments = useTranscript(rec.id);
  const playable = rec.mediaType !== "transcript";
  const missing = !rec.transcript || rec.transcript.segmentCount === 0;
  const isCurrent = useIsCurrent(rec.id) && playable;
  const listRef = useRef<FlashListRef<TranscriptSegmentRow>>(null);

  const [query, setQuery] = useState("");
  const [matchPos, setMatchPos] = useState(0);
  const [following, setFollowing] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(-1);

  const colorOf = useMemo(() => speakerColors(segments, colors.speakers), [segments, colors]);
  const matches = useMemo(() => matchingSegments(segments, query), [segments, query]);
  const searching = normalizeQuery(query).length > 0;
  const activeMatch = matches[matchPos] ?? -1;
  const current = isCurrent ? currentIdx : -1;

  const jumpTo = useCallback((idx: number) => {
    if (idx < 0) return;
    setFollowing(false);
    void listRef.current?.scrollToIndex({ index: idx, ...CENTER });
  }, []);

  const onQuery = (text: string) => {
    setQuery(text);
    setMatchPos(0);
    const first = matchingSegments(segments, text)[0];
    if (first !== undefined) jumpTo(first);
  };

  const step = (dir: 1 | -1) => {
    const next = stepMatch(matchPos, matches.length, dir);
    if (next < 0) return;
    setMatchPos(next);
    jumpTo(matches[next]);
  };

  const toggleFollow = () => {
    const next = !following;
    setFollowing(next);
    if (next && current >= 0) void listRef.current?.scrollToIndex({ index: current, ...CENTER });
  };

  const extra = useMemo(
    () => ({ current, query, activeMatch, colorOf }),
    [current, query, activeMatch, colorOf],
  );

  return (
    <View testID="transcript-tab" className="flex-1">
      <View className="flex-row items-center gap-2.5 px-5 pt-3">
        <View className="h-10 flex-1 flex-row items-center gap-2 rounded-[12px] bg-secondary pl-3.5 pr-2">
          <Icon name="search" size={18} color={colors.ink3} />
          <TextInput
            testID="transcript-search"
            accessibilityLabel="Search transcript"
            value={query}
            onChangeText={onQuery}
            placeholder="Search transcript"
            placeholderTextColor={colors.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="never"
            className="flex-1 py-0 font-jakarta text-[15px] text-foreground"
          />
          {searching ? (
            <>
              <Text
                testID="transcript-count"
                className="font-mono text-[12px] text-muted-foreground"
              >
                {matches.length ? `${matchPos + 1} of ${matches.length}` : "0 of 0"}
              </Text>
              <IconButton
                testID="transcript-clear"
                label="Clear search"
                icon="close"
                onPress={() => {
                  onQuery("");
                  Keyboard.dismiss();
                }}
              />
            </>
          ) : null}
        </View>
        {searching ? (
          <View className="flex-row">
            <IconButton
              testID="transcript-prev"
              label="Previous match"
              icon="chevronDown"
              flip
              disabled={!matches.length}
              onPress={() => step(-1)}
            />
            <IconButton
              testID="transcript-next"
              label="Next match"
              icon="chevronDown"
              disabled={!matches.length}
              onPress={() => step(1)}
            />
          </View>
        ) : playable ? (
          <Chip
            testID="transcript-follow"
            label="Follow"
            selected={following}
            onPress={toggleFollow}
          />
        ) : null}
      </View>

      {isCurrent ? (
        <FollowDriver
          segments={segments}
          listRef={listRef}
          following={following}
          onIndex={setCurrentIdx}
        />
      ) : null}

      {segments.length ? (
        <FlashList
          ref={listRef}
          testID="transcript-list"
          data={segments}
          extraData={extra}
          keyExtractor={(s: TranscriptSegmentRow) => String(s.idx)}
          maintainVisibleContentPosition={{ disabled: true }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => setFollowing(false)}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
          renderItem={({ item, index }: { item: TranscriptSegmentRow; index: number }) => (
            <Line
              seg={item}
              idx={index}
              color={colorOf.get(item.speaker) ?? colors.speakers[0]}
              current={index === current}
              query={query}
              active={index === activeMatch}
              colors={colors}
              onPress={onSeek}
            />
          )}
        />
      ) : missing ? (
        <Empty />
      ) : null}
    </View>
  );
}

import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, type TextInput, View } from "react-native";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  type ParticipantRow,
  type RecordingDetail,
  recordings,
  type TagsApi,
  useTranscript,
} from "@/lib/data";
import { useIsDemo } from "@/lib/demo";
import { formatDuration, formatDurationCompact } from "@/lib/format";
import { useGrainClient } from "@/lib/grain";
import { initials } from "@/lib/meeting";
import {
  barSegments,
  normalizeTag,
  participantRole,
  participantSubtitle,
  type Range,
  rangesMs,
  screenshareRanges,
  talkTime,
  type TalkRow,
  timelineDuration,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";
import type { TabProps } from "./coming-soon";
import { SectionTitle } from "./summary-tab";

const ROLE_LABEL = { host: "Host", attended: "Attended", invited: "Invited" } as const;

function Bar({
  testID,
  ranges,
  durationMs,
  color,
  onSeek,
}: {
  testID: string;
  ranges: Range[];
  durationMs: number;
  color: string;
  onSeek: (ms: number) => void;
}) {
  return (
    <View testID={testID} className="h-2 rounded-[4px] bg-secondary">
      {barSegments(ranges, durationMs).map((seg) => (
        <Pressable
          key={seg.start}
          testID={`${testID}-seg-${seg.start}`}
          accessibilityRole="button"
          accessibilityLabel={`Seek to ${formatDurationCompact(seg.start)}`}
          hitSlop={{ top: 10, bottom: 10 }}
          onPress={() => onSeek(seg.start)}
          className="absolute bottom-0 top-0 active:opacity-70"
          style={{ left: `${seg.left}%`, width: `${seg.width}%`, backgroundColor: color }}
        />
      ))}
    </View>
  );
}

function TalkRowView({
  row,
  durationMs,
  onSeek,
}: {
  row: TalkRow;
  durationMs: number;
  onSeek: (ms: number) => void;
}) {
  const colors = useColors();
  const color = colors.speakers[row.colorIndex % colors.speakers.length];
  const id = row.participantIds[0] ?? row.key;
  return (
    <View testID={`timeline-talk-${id}`} className="gap-1.5">
      <View className="flex-row items-center gap-3">
        <View
          className="h-[22px] w-[22px] items-center justify-center rounded-full"
          style={{ backgroundColor: color }}
        >
          <Text className="font-jakarta-bold text-[9px] text-white">{initials(row.label)}</Text>
        </View>
        <Text className="flex-1 font-jakarta-semibold text-[14px]" numberOfLines={1}>
          {row.label}
        </Text>
        <Text testID={`timeline-pct-${id}`} className="font-mono text-[12px] text-muted-foreground">
          {row.pct}% · {formatDurationCompact(row.ms)}
        </Text>
      </View>
      <Bar
        testID={`timeline-bar-${id}`}
        ranges={row.ranges}
        durationMs={durationMs}
        color={color}
        onSeek={onSeek}
      />
    </View>
  );
}

function ScopeTag({ scope }: { scope: string }) {
  if (scope !== "internal" && scope !== "external") return null;
  const external = scope === "external";
  return (
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
  );
}

function Participant({
  p,
  index,
  rec,
  last,
}: {
  p: ParticipantRow;
  index: number;
  rec: RecordingDetail;
  last: boolean;
}) {
  const colors = useColors();
  const subtitle = participantSubtitle(p);
  const role = ROLE_LABEL[participantRole(p, rec.recorders)];
  return (
    <View
      testID={`timeline-participant-${p.id}`}
      className={cn("flex-row items-center gap-3 px-3.5 py-2.5", !last && "border-b border-border")}
    >
      <View
        className="h-[30px] w-[30px] items-center justify-center rounded-full"
        style={{ backgroundColor: colors.speakers[index % colors.speakers.length] }}
      >
        <Text className="font-jakarta-bold text-[11px] text-white">{initials(p.name)}</Text>
      </View>
      <View className="flex-1">
        <Text className="font-jakarta-semibold text-[14px]" numberOfLines={1}>
          {p.name}
        </Text>
        <Text className="text-[12px] text-muted-foreground" numberOfLines={1}>
          {subtitle ? `${subtitle} · ${role}` : role}
        </Text>
      </View>
      <ScopeTag scope={p.scope} />
    </View>
  );
}

function Tags({ rec, api }: { rec: RecordingDetail; api: TagsApi | null }) {
  const colors = useColors();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const run = async (tag: string, on: boolean) => {
    setPending(tag);
    setError(null);
    try {
      await (on ? recordings.addTag(rec.id, tag, api) : recordings.removeTag(rec.id, tag, api));
    } catch {
      setError(`Couldn't ${on ? "add" : "remove"} "${tag}". Try again.`);
    } finally {
      setPending(null);
    }
  };

  const submit = () => {
    const tag = normalizeTag(draft);
    setDraft("");
    setAdding(false);
    if (tag && !rec.tags.includes(tag)) void run(tag, true);
  };

  return (
    <View className="gap-2.5">
      <SectionTitle>Tags</SectionTitle>
      <View className="flex-row flex-wrap items-center gap-1.5">
        {rec.tags.map((tag) => (
          <Pressable
            key={tag}
            testID={`timeline-tag-${tag}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove tag ${tag}`}
            disabled={pending !== null}
            onPress={() => void run(tag, false)}
            className={cn(
              "h-[28px] flex-row items-center gap-1 rounded-[8px] bg-secondary pl-2.5 pr-1.5 active:opacity-60",
              pending === tag && "opacity-50",
            )}
          >
            <Text className="font-jakarta-semibold text-[12px] text-muted-foreground">{tag}</Text>
            <Icon name="close" size={12} color={colors.ink3} />
          </Pressable>
        ))}
        {adding ? (
          <Input
            testID="timeline-tag-input"
            ref={inputRef}
            accessibilityLabel="New tag"
            autoCapitalize="none"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            onBlur={submit}
            returnKeyType="done"
            placeholder="Tag name"
            className="h-[28px] w-32 rounded-[8px] px-2.5 py-0 text-[12px]"
          />
        ) : (
          <Pressable
            testID="timeline-add-tag"
            accessibilityRole="button"
            accessibilityLabel="Add tag"
            disabled={pending !== null}
            onPress={() => setAdding(true)}
            className="h-[28px] flex-row items-center gap-1 rounded-[8px] border border-border px-2.5 active:opacity-60"
          >
            <Icon name="tag" size={12} color={colors.ink2} />
            <Text className="font-jakarta-semibold text-[12px] text-muted-foreground">Add tag</Text>
          </Pressable>
        )}
      </View>
      {error ? <Text className="text-[12px] text-destructive">{error}</Text> : null}
    </View>
  );
}

export function TimelineTab({ rec, onSeek }: TabProps) {
  const colors = useColors();
  const client = useGrainClient();
  const demo = useIsDemo();
  const segments = useTranscript(rec.id);
  const durationMs = timelineDuration(rec.durationMs, segments, rec.screenshares);
  const talk = talkTime(segments, rec.participants, durationMs);
  const shares = screenshareRanges(rec.screenshares, durationMs);

  return (
    <ScrollView
      testID="timeline-tab"
      className="flex-1"
      contentContainerClassName="gap-[18px] px-5 pt-4 pb-10"
      contentInsetAdjustmentBehavior="automatic"
    >
      <View className="gap-3.5">
        <SectionTitle>Talk time</SectionTitle>
        {talk.rows.length ? (
          talk.rows.map((row) => (
            <TalkRowView key={row.key} row={row} durationMs={durationMs} onSeek={onSeek} />
          ))
        ) : (
          <View testID="timeline-talk-empty" className="gap-1 rounded-[12px] bg-secondary p-3.5">
            <Text className="font-jakarta-semibold text-[13px]">Transcript not fetched yet</Text>
            <Text className="text-[12px] text-muted-foreground">
              Talk time is computed from the transcript. It downloads on Wi‑Fi, or open the
              Transcript tab.
            </Text>
          </View>
        )}
        {shares.length ? (
          <View testID="timeline-screenshare" className="gap-1.5">
            <View className="flex-row items-center gap-3">
              <Icon name="screen" size={20} color={colors.ink2} />
              <Text className="flex-1 font-jakarta-semibold text-[14px]">Screenshare</Text>
              <Text className="font-mono text-[12px] text-muted-foreground">
                {formatDuration(rangesMs(shares))}
              </Text>
            </View>
            <Bar
              testID="timeline-bar-screenshare"
              ranges={shares}
              durationMs={durationMs}
              color={colors.ink3}
              onSeek={onSeek}
            />
          </View>
        ) : null}
      </View>

      <View className="gap-2.5">
        <SectionTitle>{`Participants · ${rec.participants.length}`}</SectionTitle>
        {rec.participants.length ? (
          <View
            testID="timeline-participants"
            className="rounded-[16px] border border-border bg-card"
          >
            {rec.participants.map((p, i) => (
              <Participant
                key={p.id}
                p={p}
                index={i}
                rec={rec}
                last={i === rec.participants.length - 1}
              />
            ))}
          </View>
        ) : (
          <Text className="text-[13px] text-muted-foreground">No participants recorded.</Text>
        )}
      </View>

      <Tags rec={rec} api={demo ? null : (client?.recordings ?? null)} />
    </ScrollView>
  );
}

import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { HighlightRow, RecordingDetail } from "@/lib/data";
import { formatClock } from "@/lib/format";
import { playback, useIsCurrent, usePlaybackPosition, usePlaybackUntil } from "@/lib/player";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";
import type { TabProps } from "./types";
import { toNowPlaying } from "./player-card";

export function clipRange(h: HighlightRow) {
  return { at: h.timestamp / 1000, until: (h.timestamp + h.duration) / 1000 };
}

function openInGrain(rec: RecordingDetail) {
  void WebBrowser.openBrowserAsync(rec.url);
}

function ClipProgress({ start, end }: { start: number; end: number }) {
  const position = usePlaybackPosition();
  const until = usePlaybackUntil();
  const active = until !== null && position >= start && position <= end;
  if (!active) return null;
  const pct = end > start ? ((position - start) / (end - start)) * 100 : 0;
  return (
    <View testID="clip-progress" className="absolute right-0 bottom-0 left-0 h-[3px] bg-border">
      <View className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
    </View>
  );
}

function ClipCard({
  clip,
  selected,
  isCurrent,
  onPress,
  onLayout,
}: {
  clip: HighlightRow;
  selected: boolean;
  isCurrent: boolean;
  onPress: () => void;
  onLayout: (y: number) => void;
}) {
  const colors = useColors();
  const { at, until } = clipRange(clip);
  const speakers = clip.speakers?.join(", ");
  return (
    <Pressable
      testID={`clip-card-${clip.id}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onLayout={(e) => onLayout(e.nativeEvent.layout.y)}
      className={cn(
        "flex-row items-start gap-3 overflow-hidden rounded-2xl border bg-card p-3 active:opacity-80",
        selected ? "border-primary" : "border-border",
      )}
    >
      <View className="h-16 w-24 overflow-hidden rounded-[10px] bg-foreground">
        {clip.thumbnailUrl ? (
          <Image
            source={clip.thumbnailUrl}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={150}
          />
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
            {formatClock(clip.duration / 1000)}
          </Text>
        </View>
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-jakarta-bold text-[14px] leading-[19px]">{clip.text}</Text>
        <Text className="font-mono text-[11px] leading-4 text-muted-foreground">
          starts {formatClock(at)}
          {speakers ? ` · ${speakers}` : ""}
        </Text>
      </View>
      {isCurrent ? <ClipProgress start={at} end={until} /> : null}
    </Pressable>
  );
}

function OpenInGrain({ rec }: { rec: RecordingDetail }) {
  return (
    <View className="items-center gap-1 px-6 pt-3">
      <Text className="text-center text-[13px] leading-5 text-muted-foreground">
        Clips are created in Grain.
      </Text>
      <Pressable
        testID="clips-open-grain"
        accessibilityRole="link"
        hitSlop={8}
        onPress={() => openInGrain(rec)}
        className="active:opacity-60"
      >
        <Text className="font-jakarta-semibold text-[13px] leading-5 text-primary">
          Open this meeting in Grain to add one
        </Text>
      </Pressable>
    </View>
  );
}

function Empty({ rec }: { rec: RecordingDetail }) {
  return (
    <View testID="clips-empty" className="items-center gap-3 px-6 py-12">
      <Text className="font-jakarta-semibold text-base">No clips yet</Text>
      <Text className="text-center text-[13px] leading-5 text-muted-foreground">
        Clips are created in Grain. Open this meeting in Grain to add one.
      </Text>
      <Button testID="clips-open-grain" variant="outline" onPress={() => openInGrain(rec)}>
        <Icon name="external" size={16} />
        <Text>Open in Grain</Text>
      </Button>
    </View>
  );
}

export function ClipsTab({ rec }: TabProps) {
  const { clip: clipParam } = useLocalSearchParams<{ clip?: string }>();
  const isCurrent = useIsCurrent(rec.id);
  const hasMedia = rec.mediaType !== "transcript";
  const [selected, setSelected] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  const play = (clip: HighlightRow) => {
    setSelected(clip.id);
    if (hasMedia) void playback.load(toNowPlaying(rec), clipRange(clip));
  };

  useEffect(() => {
    const clip = clipParam ? rec.highlights.find((h) => h.id === clipParam) : undefined;
    if (clip) play(clip);
    // `rec` identity changes on every live refresh; only the clip id matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipParam, rec.id]);

  if (!rec.highlights.length) {
    return (
      <ScrollView testID="clips-tab" className="flex-1" contentInsetAdjustmentBehavior="automatic">
        <Empty rec={rec} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scroll}
      testID="clips-tab"
      className="flex-1"
      contentContainerClassName="gap-3 px-5 pt-4 pb-10"
      contentInsetAdjustmentBehavior="automatic"
    >
      {rec.highlights.map((clip) => (
        <ClipCard
          key={clip.id}
          clip={clip}
          selected={selected === clip.id}
          isCurrent={isCurrent}
          onPress={() => play(clip)}
          onLayout={(y) => {
            if (clip.id === clipParam) scroll.current?.scrollTo({ y, animated: false });
          }}
        />
      ))}
      <OpenInGrain rec={rec} />
    </ScrollView>
  );
}

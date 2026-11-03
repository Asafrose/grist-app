import * as Clipboard from "expo-clipboard";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { type RecordingDetail, useResumePosition, useTranscript } from "@/lib/data";
import { formatClock } from "@/lib/format";
import { useIsCurrent, usePlaybackPosition } from "@/lib/player";
import { recentTranscriptText } from "@/lib/transcript";

export function CopyRecentTranscript({ rec }: { rec: RecordingDetail }) {
  const segments = useTranscript(rec.id);
  const isCurrent = useIsCurrent(rec.id);
  const livePosition = usePlaybackPosition();
  const resume = useResumePosition(rec.id, rec.durationMs / 1000);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef(false);

  const copy = async () => {
    if (pending.current) return;
    const position = isCurrent ? livePosition : resume;
    const text = recentTranscriptText(segments, position * 1000);
    if (!text) {
      setMessage("No transcript in the last 30 seconds.");
      return;
    }
    const range = `${formatClock(Math.max(0, position - 30))}–${formatClock(position)}`;
    pending.current = true;
    setCopying(true);
    setMessage(null);
    try {
      const copied = await Clipboard.setStringAsync(
        `${rec.title}\nTranscript around ${range} (complete segments)\n\n${text}`,
      );
      setMessage(copied ? `Copied ${range}. Paste into your agent.` : "Couldn't copy. Try again.");
    } catch {
      setMessage("Couldn't copy. Try again.");
    } finally {
      pending.current = false;
      setCopying(false);
    }
  };

  return (
    <View className="gap-1 pt-2">
      <Button
        testID="copy-recent-transcript"
        variant="secondary"
        className="min-h-11"
        accessibilityLabel="Copy last 30 seconds of transcript"
        accessibilityHint="Copies complete transcript segments before the playback position"
        accessibilityState={{ disabled: copying || !segments.length, busy: copying }}
        disabled={copying || !segments.length}
        onPress={() => void copy()}
      >
        <Icon name="copy" size={18} />
        <Text>{copying ? "Copying…" : "Copy last 30s"}</Text>
      </Button>
      <Text
        testID="copy-recent-transcript-status"
        accessibilityLiveRegion="polite"
        className="text-center text-[12px] text-muted-foreground"
      >
        {!segments.length
          ? "Transcript not downloaded yet."
          : (message ?? "Includes complete transcript segments.")}
      </Text>
    </View>
  );
}

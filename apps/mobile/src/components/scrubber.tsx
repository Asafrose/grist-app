import { useState } from "react";
import { type ColorValue, type GestureResponderEvent, View } from "react-native";
import { Text } from "@/components/ui/text";
import { formatClock } from "@/lib/format";

export function scrubRatio(x: number, width: number): number {
  if (width <= 0) return 0;
  return Math.min(1, Math.max(0, x / width));
}

export function Scrubber({
  position,
  duration,
  onSeek,
  trackColor,
  fillColor,
  labelColor,
  testID,
}: {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  trackColor: ColorValue;
  fillColor: ColorValue;
  labelColor: ColorValue;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);

  const ratioAt = (e: GestureResponderEvent) => scrubRatio(e.nativeEvent.locationX, width);
  const ratio = drag ?? (duration ? Math.min(1, position / duration) : 0);
  const shown = drag === null ? position : drag * duration;

  return (
    <View className="w-full">
      <View
        testID={testID}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown) }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setDrag(ratioAt(e))}
        onResponderMove={(e) => setDrag(ratioAt(e))}
        onResponderRelease={(e) => {
          setDrag(null);
          onSeek(ratioAt(e) * duration);
        }}
        onResponderTerminate={() => setDrag(null)}
        className="h-8 justify-center"
      >
        <View
          pointerEvents="none"
          className="h-1 rounded-full"
          style={{ backgroundColor: trackColor }}
        >
          <View
            className="h-1 rounded-full"
            style={{ width: `${ratio * 100}%`, backgroundColor: fillColor }}
          />
        </View>
        <View
          pointerEvents="none"
          className="absolute h-3.5 w-3.5 rounded-full"
          style={{ left: ratio * width - 7, backgroundColor: fillColor }}
        />
      </View>
      <View className="flex-row justify-between">
        <Text className="font-mono text-[12px]" style={{ color: labelColor }}>
          {formatClock(shown)}
        </Text>
        <Text className="font-mono text-[12px]" style={{ color: labelColor }}>
          -{formatClock(Math.max(0, duration - shown))}
        </Text>
      </View>
    </View>
  );
}

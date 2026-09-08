import { useEffect, useState } from "react";
import { type ColorValue, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Text } from "@/components/ui/text";
import { formatClock } from "@/lib/format";
import { haptics } from "@/lib/haptics";

export function scrubRatio(x: number, width: number): number {
  if (width <= 0) return 0;
  return Math.min(1, Math.max(0, x / width));
}

function makeGesture(
  testID: string | undefined,
  setDragX: (x: number | null) => void,
  release: (x: number) => void,
) {
  const pan = Gesture.Pan()
    .withTestId(`${testID ?? "scrubber"}-pan`)
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .runOnJS(true)
    .onBegin((e) => {
      haptics.selection();
      setDragX(e.x);
    })
    .onUpdate((e) => setDragX(e.x))
    .onEnd((e, success) => {
      if (success) {
        haptics.selection();
        release(e.x);
      }
    })
    .onFinalize(() => setDragX(null));
  const tap = Gesture.Tap()
    .withTestId(`${testID ?? "scrubber"}-tap`)
    .runOnJS(true)
    .onEnd((e) => release(e.x));
  return Gesture.Race(pan, tap);
}

export function Scrubber({
  position,
  duration,
  onSeek,
  onScrub,
  trackColor,
  fillColor,
  labelColor,
  labels = true,
  testID,
}: {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  onScrub?: (seconds: number | null) => void;
  trackColor: ColorValue;
  fillColor: ColorValue;
  labelColor: ColorValue;
  labels?: boolean;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const [dragX, setDragX] = useState<number | null>(null);
  const [released, setReleased] = useState<{ x: number } | null>(null);

  // A rebuilt gesture makes GestureDetector call updateGestureHandler, which cancels the pan in
  // flight, so it is built once and only calls setters; the seek runs below with current props.
  const [gesture] = useState(() => makeGesture(testID, setDragX, (x) => setReleased({ x })));

  useEffect(() => {
    if (released) onSeek(scrubRatio(released.x, width) * duration);
    // Each release is a fresh object, so the seek runs once per gesture with the current props.
  }, [released]);

  const drag = dragX === null ? null : scrubRatio(dragX, width);

  useEffect(() => {
    onScrub?.(dragX === null ? null : scrubRatio(dragX, width) * duration);
  }, [dragX]);

  const ratio = drag ?? (duration ? Math.min(1, position / duration) : 0);
  const shown = drag === null ? position : drag * duration;

  return (
    <View className="w-full">
      <GestureDetector gesture={gesture}>
        <View
          testID={testID}
          accessibilityRole="adjustable"
          accessibilityLabel="Seek"
          accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown) }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
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
      </GestureDetector>
      {labels ? (
        <View className="flex-row justify-between">
          <Text
            testID={`${testID ?? "scrubber"}-position`}
            className="font-mono text-[12px]"
            style={{ color: labelColor }}
          >
            {formatClock(shown)}
          </Text>
          <Text className="font-mono text-[12px]" style={{ color: labelColor }}>
            -{formatClock(Math.max(0, duration - shown))}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

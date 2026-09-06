import { View } from "react-native";
import { Text } from "@/components/ui/text";
import type { RecordingDetail } from "@/lib/db";

export type TabProps = { rec: RecordingDetail; onSeek: (ms: number) => void };

export function ComingSoon({ label }: { label: string }) {
  return (
    <View testID="coming-soon" className="flex-1 items-center justify-center gap-1 px-8 py-12">
      <Text className="font-jakarta-semibold text-base">{label} coming soon</Text>
      <Text className="text-center text-[13px] text-muted-foreground">
        This tab is on its way. Summary is ready today.
      </Text>
    </View>
  );
}

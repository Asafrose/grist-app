import { Text } from "@/components/ui/text";
import { useOfflineHint, useSyncStatus } from "@/lib/library";

export function OfflineHint({ noun }: { noun: "meetings" | "clips" }) {
  const offline = useOfflineHint();
  const sync = useSyncStatus();
  if (!offline || sync !== "idle") return null;
  return (
    <Text
      testID="offline-hint"
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      numberOfLines={1}
      className="max-w-[180px] text-[12px] text-muted-foreground"
    >
      {`Offline. Showing saved ${noun}.`}
    </Text>
  );
}

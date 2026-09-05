import { ScrollView, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { screenInset, spacing, useColors } from "@/theme";

export function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  const colors = useColors();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: screenInset, gap: spacing.sm }}
    >
      <ThemedText variant="h1">{title}</ThemedText>
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing.sm }} />
      <ThemedText variant="sub" tone="ink2">
        {note}
      </ThemedText>
    </ScrollView>
  );
}

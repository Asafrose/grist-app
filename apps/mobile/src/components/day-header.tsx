import { View } from "react-native";
import { Text } from "@/components/ui/text";

export function DayHeader({ label }: { label: string }) {
  return (
    <View className="bg-background px-5 pt-[18px] pb-1">
      <Text className="font-jakarta-semibold text-[12px] tracking-[0.5px] text-subtle-foreground">
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

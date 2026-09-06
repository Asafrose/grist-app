import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";

export type NativeDatePickerProps = {
  value: Date | null;
  onChange: (date: Date) => void;
  testID?: string;
};

export function NativeDatePicker({ value, onChange, testID }: NativeDatePickerProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={() => onChange(value ?? new Date())}
      className="h-9 justify-center rounded-sm bg-secondary px-3"
    >
      <Text className="text-[13px] text-foreground">
        {value ? value.toLocaleDateString() : "Pick a date"}
      </Text>
    </Pressable>
  );
}

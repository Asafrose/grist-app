import { DatePickerDialog, Host } from "@expo/ui/jetpack-compose";
import { useState } from "react";
import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { useColors } from "@/theme";
import type { NativeDatePickerProps } from "./native-date-picker";

export function NativeDatePicker({ value, onChange, testID }: NativeDatePickerProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        className="h-9 justify-center rounded-sm bg-secondary px-3 active:opacity-70"
      >
        <Text className="text-[13px] text-foreground">
          {value ? value.toLocaleDateString() : "Pick a date"}
        </Text>
      </Pressable>
      {open ? (
        <Host matchContents>
          <DatePickerDialog
            initialDate={(value ?? new Date()).toISOString()}
            color={colors.accent}
            onDateSelected={(d) => {
              onChange(d);
              setOpen(false);
            }}
            onDismissRequest={() => setOpen(false)}
          />
        </Host>
      ) : null}
    </>
  );
}

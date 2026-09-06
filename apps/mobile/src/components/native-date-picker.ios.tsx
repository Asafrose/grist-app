import { DatePicker, Host } from "@expo/ui/swift-ui";
import { datePickerStyle, labelsHidden } from "@expo/ui/swift-ui/modifiers";
import { View } from "react-native";
import type { NativeDatePickerProps } from "./native-date-picker";

export function NativeDatePicker({ value, onChange, testID }: NativeDatePickerProps) {
  return (
    <View testID={testID}>
      <Host matchContents>
        <DatePicker
          selection={value ?? new Date()}
          displayedComponents={["date"]}
          onDateChange={onChange}
          modifiers={[datePickerStyle("compact"), labelsHidden()]}
        />
      </Host>
    </View>
  );
}

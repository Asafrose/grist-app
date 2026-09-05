import { Text, type TextProps } from "react-native";
import { type Colors, type TypeVariant, type as typeRamp, useColors } from "@/theme";

type Tone = "ink" | "ink2" | "ink3" | "accent" | "ext" | "danger" | "onAccent";

export function ThemedText({
  variant = "body",
  tone = "ink",
  style,
  ...props
}: TextProps & { variant?: TypeVariant; tone?: Tone }) {
  const colors = useColors();
  return (
    <Text
      style={[typeRamp[variant], { color: colors[tone satisfies keyof Colors] }, style]}
      {...props}
    />
  );
}

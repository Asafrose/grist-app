import { Pressable } from "react-native";
import { Icon, type IconName } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

type ChipProps = {
  label: string;
  selected?: boolean;
  tone?: "default" | "accent";
  size?: "md" | "sm";
  leading?: IconName;
  trailing?: IconName;
  onPress?: () => void;
  testID?: string;
  className?: string;
};

export function Chip({
  label,
  selected = false,
  tone = "default",
  size = "md",
  leading,
  trailing,
  onPress,
  testID,
  className,
}: ChipProps) {
  const colors = useColors();
  const accent = tone === "accent";
  const iconColor = accent ? colors.accent : selected ? colors.bg : colors.ink2;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className={cn(
        "flex-row items-center gap-1.5 rounded-full border active:opacity-70",
        size === "md" ? "h-8 px-3" : "h-7 px-2.5",
        accent
          ? "border-transparent bg-accent"
          : selected
            ? "border-foreground bg-foreground"
            : "border-border bg-card",
        className,
      )}
    >
      {leading ? <Icon name={leading} size={size === "md" ? 16 : 14} color={iconColor} /> : null}
      <Text
        numberOfLines={1}
        className={cn(
          "shrink font-jakarta-semibold",
          size === "md" ? "text-[13px]" : "text-[12px]",
          accent
            ? "text-accent-foreground"
            : selected
              ? "text-background"
              : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
      {trailing ? <Icon name={trailing} size={size === "md" ? 16 : 14} color={iconColor} /> : null}
    </Pressable>
  );
}

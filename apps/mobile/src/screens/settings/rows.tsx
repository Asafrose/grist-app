import { Children, isValidElement, type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import { Icon, type IconName } from "@/components/icon";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-2">
      <Text className="font-jakarta-semibold text-xs uppercase tracking-wider text-subtle-foreground">
        {title}
      </Text>
      <View className="overflow-hidden rounded-lg border border-border bg-card">
        {rows.map((row, i) => (
          <View key={isValidElement(row) && row.key !== null ? row.key : String(i)}>
            {i > 0 ? <View className="ml-[46px] h-px bg-border" /> : null}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

export function Row({
  icon,
  label,
  value,
  valueTestID,
  onPress,
  testID,
  right,
  destructive,
  disabled,
  chevron = "chevronRight",
}: {
  icon?: IconName;
  label: string;
  value?: string;
  valueTestID?: string;
  onPress?: () => void;
  testID?: string;
  right?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  chevron?: IconName | null;
}) {
  const colors = useColors();
  const tint = destructive ? colors.danger : colors.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress || disabled}
      className={cn(
        "min-h-[50px] flex-row items-center gap-3 px-3.5",
        onPress && "active:bg-secondary",
        disabled && "opacity-50",
      )}
    >
      {icon ? <Icon name={icon} size={20} color={tint} /> : <View className="w-5" />}
      <Text
        className={cn(
          "flex-1 font-jakarta-semibold text-[15px]",
          destructive && "text-destructive",
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
      {value ? (
        <Text testID={valueTestID} className="text-[13px] text-muted-foreground" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right ?? (onPress && chevron ? <Icon name={chevron} size={20} color={colors.ink3} /> : null)}
    </Pressable>
  );
}

export function ToggleRow({
  icon,
  label,
  checked,
  onChange,
  testID,
}: {
  icon: IconName;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testID: string;
}) {
  return (
    <Row
      icon={icon}
      label={label}
      value={checked ? "On" : "Off"}
      valueTestID={`${testID}-value`}
      onPress={() => onChange(!checked)}
      testID={testID}
      right={
        <Switch
          testID={`${testID}-switch`}
          checked={checked}
          onCheckedChange={onChange}
          accessibilityLabel={label}
        />
      }
    />
  );
}

export function PickerRow<T extends string | number>({
  icon,
  label,
  options,
  value,
  format,
  onSelect,
  testID,
}: {
  icon: IconName;
  label: string;
  options: readonly T[];
  value: T;
  format: (v: T) => string;
  onSelect: (v: T) => void;
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Row
        icon={icon}
        label={label}
        value={format(value)}
        valueTestID={`${testID}-value`}
        onPress={() => setOpen((o) => !o)}
        testID={testID}
        chevron={open ? "chevronDown" : "chevronRight"}
      />
      {open ? (
        <View className="mx-3.5 mb-3 flex-row gap-1 rounded-md bg-secondary p-1">
          {options.map((option) => {
            const selected = option === value;
            return (
              <Pressable
                key={String(option)}
                testID={`${testID}-option-${option}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                className={cn(
                  "h-[34px] flex-1 items-center justify-center rounded-[9px]",
                  selected && "bg-card shadow-sm shadow-black/10",
                )}
              >
                <Text
                  className={cn(
                    "font-jakarta-semibold text-[13px]",
                    selected ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {format(option)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

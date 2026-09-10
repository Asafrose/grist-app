import { router } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import type { ColorValue } from "react-native";

type HeaderBackProps = { canGoBack?: boolean; label: string; tintColor?: ColorValue };

export function HeaderBack({ canGoBack, label, tintColor }: HeaderBackProps) {
  if (!canGoBack) return null;

  return (
    <HeaderBackButton
      accessibilityLabel={`Back to ${label}`}
      label={label}
      onPress={() => router.back()}
      testID="header-back"
      tintColor={typeof tintColor === "string" ? tintColor : undefined}
    />
  );
}

export function headerBackOptions(label: string) {
  return {
    headerLeft: (props: { canGoBack?: boolean; tintColor?: ColorValue }) => (
      <HeaderBack canGoBack={props.canGoBack} label={label} tintColor={props.tintColor} />
    ),
  };
}

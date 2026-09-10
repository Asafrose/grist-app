import { type Href, router } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import type { ColorValue } from "react-native";

type HeaderBackProps = {
  canGoBack?: boolean;
  fallbackHref: Href;
  label: string;
  tintColor?: ColorValue;
};

const buttonStyle = {
  minHeight: 44,
  minWidth: 44,
  alignItems: "center",
  justifyContent: "center",
} as const;

export function HeaderBack({ canGoBack, fallbackHref, label, tintColor }: HeaderBackProps) {
  if (!canGoBack) return null;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref);
  };

  return (
    <HeaderBackButton
      accessibilityLabel={`Back to ${label}`}
      displayMode="default"
      label={label}
      onPress={goBack}
      style={buttonStyle}
      testID="header-back"
      tintColor={typeof tintColor === "string" ? tintColor : undefined}
    />
  );
}

export function headerBackOptions(label: string, fallbackHref: Href) {
  return {
    headerLeft: (props: { canGoBack?: boolean; tintColor?: ColorValue }) => (
      <HeaderBack
        canGoBack={props.canGoBack}
        fallbackHref={fallbackHref}
        label={label}
        tintColor={props.tintColor}
      />
    ),
  };
}

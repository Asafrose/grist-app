import { useRouter } from "expo-router";
import { Platform, Pressable } from "react-native";
import { Icon } from "@/components/icon";
import { useColors } from "@/theme";

export function SheetClose({ testID }: { testID: string }) {
  const router = useRouter();
  const colors = useColors();

  if (Platform.OS !== "android") return null;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    >
      <Icon name="close" color={colors.ink3} />
    </Pressable>
  );
}

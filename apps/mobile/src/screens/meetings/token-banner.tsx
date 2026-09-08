import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { auth, useTokenRejected } from "@/lib/auth";
import { useColors } from "@/theme";

export function TokenBanner() {
  const message = useTokenRejected();
  const router = useRouter();
  const colors = useColors();
  if (!message) return null;
  return (
    <View
      testID="token-banner"
      accessibilityRole="alert"
      className="mx-5 mt-2.5 gap-2 rounded-md border border-destructive bg-secondary p-3.5"
    >
      <View className="flex-row items-start gap-2.5">
        <Icon name="key" size={18} color={colors.danger} />
        <Text className="flex-1 text-[13px] leading-[18px] text-foreground">{message}</Text>
        <Pressable
          testID="token-banner-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={auth.accept}
          hitSlop={8}
        >
          <Icon name="close" size={16} color={colors.ink3} />
        </Pressable>
      </View>
      <Pressable
        testID="token-banner-replace"
        accessibilityRole="button"
        onPress={() => router.push("/settings")}
        className="self-start rounded px-1 py-1 active:bg-card"
      >
        <Text className="font-jakarta-semibold text-[13px] text-primary">Replace token</Text>
      </Pressable>
    </View>
  );
}

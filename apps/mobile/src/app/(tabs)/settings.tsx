import { ScrollView } from "react-native";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { auth } from "@/lib/auth";

export default function SettingsRoute() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="bg-background"
      contentContainerClassName="gap-4 p-5"
    >
      <Text role="heading" className="font-jakarta-extrabold text-[28px] leading-8 tracking-tight">
        Settings
      </Text>
      <Separator />
      <Text className="text-muted-foreground text-[13px] leading-[18px]">
        Playback, storage, account.
      </Text>
      <Button variant="outline" size="lg" onPress={auth.signOut} testID="sign-out">
        <Text>Sign out</Text>
      </Button>
    </ScrollView>
  );
}

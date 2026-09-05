import { ScrollView } from "react-native";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";

export function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="bg-background"
      contentContainerClassName="gap-2 p-5"
    >
      <Text role="heading" className="font-jakarta-extrabold text-[28px] leading-8 tracking-tight">
        {title}
      </Text>
      <Separator className="my-2" />
      <Text className="text-muted-foreground text-[13px] leading-[18px]">{note}</Text>
    </ScrollView>
  );
}

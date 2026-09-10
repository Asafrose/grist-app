import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { SheetClose } from "@/components/sheet-close";
import { Text } from "@/components/ui/text";
import { useWorkspace } from "@/lib/data";
import { filters, sameView, useFilterView, viewOptions } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

export function ViewPicker() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const selected = useFilterView();
  const options = viewOptions(useWorkspace().teams);

  return (
    <ScrollView
      testID="view-picker"
      contentContainerClassName="gap-3 px-5 pt-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center gap-3">
        <SheetClose testID="view-picker-close" />
        <Text role="heading" className="flex-1 font-jakarta-extrabold text-[22px] leading-7">
          View
        </Text>
      </View>
      <View className="overflow-hidden rounded-lg border border-border bg-card">
        {options.map((o, i) => {
          const current = sameView(selected, o.view);
          return (
            <View key={o.key}>
              {i > 0 ? <View className="ml-3.5 h-px bg-border" /> : null}
              <Pressable
                testID={`picker-${o.testID}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: current }}
                accessibilityLabel={o.label}
                onPress={() => {
                  filters.setView(o.view);
                  router.back();
                }}
                className="min-h-[50px] flex-row items-center gap-3 px-3.5 active:bg-secondary"
              >
                <Text
                  className={cn(
                    "flex-1 font-jakarta-semibold text-[15px]",
                    current && "text-accent-foreground",
                  )}
                  numberOfLines={1}
                >
                  {o.label}
                </Text>
                {current ? <Icon name="check" size={20} color={colors.accent} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

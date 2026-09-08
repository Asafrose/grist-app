import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { identity, useWorkspace } from "@/lib/data";
import { useMe, useMeStatus } from "@/lib/me";
import { initials } from "@/lib/meeting";
import { useColors } from "@/theme";

export function ProfileCard() {
  const colors = useColors();
  const me = useMe();
  const status = useMeStatus();
  const users = useWorkspace().users;
  const [picking, setPicking] = useState(false);

  const name =
    me?.name ?? (status === "loading" || status === "idle" ? "Finding you…" : "Who are you?");
  const detail = me
    ? [me.email, users.length ? `${users.length} people` : null].filter(Boolean).join(" · ")
    : status === "loading" || status === "idle"
      ? " "
      : "Tap to pick yourself from the workspace";

  return (
    <View className="gap-2">
      <Pressable
        testID="profile-card"
        accessibilityRole="button"
        onPress={() => setPicking((p) => !p)}
        className="flex-row items-center gap-3.5 rounded-lg border border-border bg-card p-3.5 active:opacity-80"
      >
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.speakers[3] }}
        >
          <Text className="font-jakarta-bold text-base text-white">
            {me ? initials(me.name) : "·"}
          </Text>
        </View>
        <View className="flex-1">
          <Text testID="profile-name" className="font-jakarta-bold text-base" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-[13px] text-muted-foreground" numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <Icon name={picking ? "chevronDown" : "chevronRight"} size={16} color={colors.ink3} />
      </Pressable>
      {picking ? (
        <View className="rounded-lg border border-border bg-card">
          <Text className="px-3.5 pt-3 pb-1 font-jakarta-semibold text-[12px] uppercase tracking-[0.5px] text-subtle-foreground">
            This is me
          </Text>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 280 }}>
            {users.map((u) => (
              <Pressable
                key={u.id}
                testID={`me-option-${u.id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: me?.email === u.email }}
                onPress={() => {
                  identity.choose(u);
                  setPicking(false);
                }}
                className="flex-row items-center justify-between px-3.5 py-2.5 active:bg-secondary"
              >
                <View className="flex-1">
                  <Text className="text-[15px]">{u.name}</Text>
                  <Text className="text-[12px] text-muted-foreground">{u.email}</Text>
                </View>
                {me?.email === u.email ? (
                  <Icon name="check" size={16} color={colors.accent} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

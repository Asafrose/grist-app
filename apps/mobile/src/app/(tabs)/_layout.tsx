import { Tabs } from "expo-router";
import { Icon, type IconName } from "@/components/icon";
import { fonts, useColors } from "@/theme";

const tabs: { name: string; title: string; icon: IconName }[] = [
  { name: "index", title: "Meetings", icon: "video" },
  { name: "search", title: "Search", icon: "search" },
  { name: "clips", title: "Clips", icon: "clips" },
  { name: "settings", title: "Settings", icon: "gear" },
];

export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color }) => <Icon name={t.icon} size={24} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}

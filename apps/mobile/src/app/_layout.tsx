import { DarkTheme, DefaultTheme, type Theme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router/stack";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { fonts, palette } from "@/theme";

function navTheme(scheme: "light" | "dark"): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const c = palette[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.bg,
      card: c.surface,
      text: c.ink,
      border: c.line,
      notification: c.ext,
    },
    fonts: {
      regular: { fontFamily: fonts.regular, fontWeight: "400" },
      medium: { fontFamily: fonts.medium, fontWeight: "500" },
      bold: { fontFamily: fonts.bold, fontWeight: "700" },
      heavy: { fontFamily: fonts.extrabold, fontWeight: "800" },
    },
  };
}

export default function RootLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <ThemeProvider value={navTheme(scheme)}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="meeting/[id]" options={{ headerShown: true, title: "" }} />
      </Stack>
    </ThemeProvider>
  );
}

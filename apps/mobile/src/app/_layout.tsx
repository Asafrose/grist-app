import "../../global.css";

import { PortalHost } from "@rn-primitives/portal";
import { DarkTheme, DefaultTheme, type Theme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router/stack";
import * as SplashScreen from "expo-splash-screen";
import { Suspense, use, useEffect } from "react";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { authReady, useAuth } from "@/lib/auth";
import { fonts, palette } from "@/theme";

SplashScreen.preventAutoHideAsync();

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

function HideSplashOnMount() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return null;
}

function Root() {
  use(authReady);
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const signedIn = useAuth((s) => s.status === "signed-in");

  return (
    <ThemeProvider value={navTheme(scheme)}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="meeting/[id]" options={{ headerShown: true, title: "" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
        </Stack.Protected>
      </Stack>
      <PortalHost />
      <HideSplashOnMount />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  );
}

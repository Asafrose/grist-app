import "../../global.css";

import { PortalHost } from "@rn-primitives/portal";
import { DarkTheme, DefaultTheme, type Theme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router/stack";
import * as SplashScreen from "expo-splash-screen";
import { Suspense, use, useEffect } from "react";
import { MiniPlayer } from "@/components/mini-player";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { authReady, useAuth } from "@/lib/auth";
import { libraryReady } from "@/lib/library";
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

const appReady = Promise.all([authReady, libraryReady]);

function Root() {
  use(appReady);
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const signedIn = useAuth((s) => s.status === "signed-in");

  return (
    <ThemeProvider value={navTheme(scheme)}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="meeting/[id]"
            options={{ headerShown: true, title: "", headerBackTitle: "Meetings" }}
          />
          <Stack.Screen
            name="filters"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [0.82, 1],
              sheetGrabberVisible: true,
              sheetCornerRadius: 20,
              contentStyle: { backgroundColor: palette[scheme].surface },
            }}
          />
          <Stack.Screen
            name="now-playing"
            options={{ presentation: "modal", contentStyle: { backgroundColor: palette.dark.bg } }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
        </Stack.Protected>
      </Stack>
      {signedIn ? <MiniPlayer /> : null}
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

import "../../global.css";

import { PortalHost } from "@rn-primitives/portal";
import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, type Theme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router/stack";
import * as SplashScreen from "expo-splash-screen";
import { Suspense, use, useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { headerBackOptions } from "@/components/header-back";
import { MiniPlayer } from "@/components/mini-player";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { authReady, useSignedIn } from "@/lib/auth";
import { libraryReady } from "@/lib/library";
import { queryClient } from "@/lib/query";
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
  const signedIn = useSignedIn();

  return (
    <ThemeProvider value={navTheme(scheme)}>
      <Stack screenOptions={{ headerShown: false, orientation: "portrait" }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="meeting/[id]"
            options={{
              headerShown: true,
              title: "",
              ...headerBackOptions("Meetings"),
              // `end` is a max x: on iOS 26 the pop starts anywhere in the content, so cap it
              // to an edge strip that stops short of the scrubber thumb at 0:00 (~36pt in).
              gestureResponseDistance: { end: 24 },
            }}
          />
          <Stack.Screen
            name="downloads"
            options={{
              headerShown: true,
              title: "Downloads",
              ...headerBackOptions("Settings"),
            }}
          />
          <Stack.Screen
            name="filters"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [1],
              sheetGrabberVisible: true,
              sheetCornerRadius: 20,
              contentStyle: { backgroundColor: palette[scheme].surface },
            }}
          />
          <Stack.Screen
            name="view-picker"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [0.6, 1],
              sheetGrabberVisible: true,
              sheetCornerRadius: 20,
              contentStyle: { backgroundColor: palette[scheme].surface },
            }}
          />
          <Stack.Screen
            name="actions"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [0.85, 1],
              sheetGrabberVisible: true,
              sheetCornerRadius: 20,
              contentStyle: { backgroundColor: palette[scheme].surface },
            }}
          />
          <Stack.Screen
            name="fullscreen"
            options={{
              presentation: "fullScreenModal",
              orientation: "all",
              animation: "fade",
              contentStyle: { backgroundColor: "#000000" },
            }}
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <Root />
        </Suspense>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

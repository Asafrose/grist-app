import { GRAIN_TOKEN_SETTINGS_URL } from "@grist/grain-api";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { auth } from "@/lib/auth";
import { DEMO_TOKEN } from "@/lib/demo";
import { makeClient, tokenErrorMessage } from "@/lib/grain";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

export function SignIn() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function paste() {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text) setToken(text);
  }

  async function submit() {
    const value = token.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await makeClient(value).recordings.list();
      await auth.signIn(value);
    } catch (e) {
      setError(tokenErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex-grow px-5"
        contentContainerStyle={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 8 }}
      >
        <View className="flex-row items-center gap-2.5">
          <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-foreground">
            <Icon name="grist" size={24} color={colors.bg} />
          </View>
          <Text className="font-jakarta-bold text-xl leading-6 tracking-tight">Grist</Text>
        </View>

        <Text
          role="heading"
          className="mt-14 font-jakarta-extrabold text-[28px] leading-8 tracking-tight"
        >
          Your meetings,{"\n"}on your phone.
        </Text>
        <Text className="mt-3 text-base text-muted-foreground leading-6">
          Listen to recordings, read AI notes and follow transcripts from your Grain workspace.
        </Text>

        <View className="mt-11 gap-2">
          <Text className="font-jakarta-semibold text-[13px] text-muted-foreground">
            Personal access token
          </Text>
          <View
            className={cn(
              "h-[52px] flex-row items-center gap-2.5 rounded-md border-[1.5px] bg-card px-3.5",
              error ? "border-destructive" : "border-primary",
            )}
          >
            <Icon name="key" color={colors.ink3} />
            <TextInput
              testID="token-input"
              accessibilityLabel="Personal access token"
              value={token}
              onChangeText={(t) => {
                setToken(t);
                setError(null);
              }}
              onSubmitEditing={submit}
              placeholder="grain_pat_…"
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              returnKeyType="go"
              className="flex-1 py-0 font-mono text-[15px] text-foreground"
            />
            <Pressable onPress={paste} hitSlop={12} accessibilityRole="button">
              <Text className="font-jakarta-semibold text-[13px] text-accent-foreground">
                Paste
              </Text>
            </Pressable>
          </View>
          <Text
            className={cn(
              "text-xs leading-4",
              error ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {error ?? "Stored in the device keychain. Only sent to api.grain.com."}
          </Text>
        </View>

        <Button
          testID="continue"
          size="lg"
          className="mt-5 h-[50px] rounded-lg"
          onPress={submit}
          disabled={!token.trim() || busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text className="font-jakarta-bold text-base">Continue</Text>
          )}
        </Button>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Where do I get a token?"
          onPress={() => WebBrowser.openBrowserAsync(GRAIN_TOKEN_SETTINGS_URL)}
          className="mt-7 flex-row items-center gap-3 rounded-lg border border-border bg-card p-3.5 active:opacity-75"
        >
          <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-accent">
            <Icon name="external" color={colors.accent} />
          </View>
          <View className="flex-1">
            <Text className="font-jakarta-bold text-sm">Where do I get a token?</Text>
            <Text className="text-xs text-muted-foreground">
              Grain › Account settings › Integrations › Personal API
            </Text>
          </View>
          <Icon name="chevronRight" color={colors.ink3} />
        </Pressable>

        <View className="flex-1" />
        {__DEV__ ? (
          <Pressable
            testID="demo-sign-in"
            accessibilityRole="button"
            onPress={() => auth.signIn(DEMO_TOKEN)}
            className="self-center rounded-full border border-border px-3 py-1.5 active:opacity-70"
          >
            <Text className="font-jakarta-semibold text-xs text-muted-foreground">
              Use demo data
            </Text>
          </Pressable>
        ) : null}
        <Text className="pt-4 text-center text-xs text-muted-foreground">
          Open source · Not affiliated with Grain
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

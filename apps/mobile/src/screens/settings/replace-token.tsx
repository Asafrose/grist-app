import { useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { auth } from "@/lib/auth";
import { makeClient, tokenErrorMessage } from "@/lib/grain";
import { cn } from "@/lib/utils";
import { useColors } from "@/theme";

export function ReplaceToken({ onDone }: { onDone: () => void }) {
  const colors = useColors();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = token.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await makeClient(value).recordings.list();
      await auth.signIn(value);
      onDone();
    } catch (e) {
      setError(tokenErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-2 px-3.5 pt-1 pb-3.5">
      <View
        className={cn(
          "h-[46px] flex-row items-center gap-2.5 rounded-md border-[1.5px] bg-background px-3",
          error ? "border-destructive" : "border-primary",
        )}
      >
        <Icon name="key" color={colors.ink3} />
        <TextInput
          testID="replace-token-input"
          accessibilityLabel="New personal access token"
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
      </View>
      <Text
        className={cn("text-xs leading-4", error ? "text-destructive" : "text-muted-foreground")}
      >
        {error ??
          "Validated with Grain before it replaces the current token. Your library resyncs."}
      </Text>
      <View className="flex-row gap-2 pt-1">
        <Button
          testID="replace-token-cancel"
          variant="outline"
          className="flex-1"
          onPress={onDone}
          disabled={busy}
        >
          <Text>Cancel</Text>
        </Button>
        <Button
          testID="replace-token-save"
          className="flex-1"
          onPress={submit}
          disabled={!token.trim() || busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text className="font-jakarta-semibold">Save token</Text>
          )}
        </Button>
      </View>
    </View>
  );
}

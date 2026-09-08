import * as SecureStore from "expo-secure-store";
import { create, useStore } from "zustand";

export const TOKEN_KEY = "grain_pat";

type AuthState = { rejected: string | null } & (
  | { status: "loading"; token: null }
  | { status: "signed-out"; token: null }
  | { status: "signed-in"; token: string }
);

export const authStore = create<AuthState>(() => ({
  status: "loading",
  token: null,
  rejected: null,
}));

async function signIn(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  authStore.setState({ status: "signed-in", token, rejected: null });
}

async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  authStore.setState({ status: "signed-out", token: null, rejected: null });
}

function reject(message: string): void {
  const s = authStore.getState();
  if (s.status !== "signed-in" || s.rejected === message) return;
  authStore.setState({ rejected: message });
}

function accept(): void {
  if (authStore.getState().rejected !== null) authStore.setState({ rejected: null });
}

export function hydrateAuth(): Promise<void> {
  return SecureStore.getItemAsync(TOKEN_KEY).then((token) => {
    authStore.setState(
      token
        ? { status: "signed-in", token, rejected: null }
        : { status: "signed-out", token: null, rejected: null },
    );
  });
}

export const authReady = hydrateAuth();

export const auth = {
  signIn,
  signOut,
  reject,
  accept,
  token: () => authStore.getState().token,
  rejected: () => authStore.getState().rejected,
};

export const useAuthToken = () => useStore(authStore, (s) => s.token);
export const useSignedIn = () => useStore(authStore, (s) => s.status === "signed-in");
export const useTokenRejected = () => useStore(authStore, (s) => s.rejected);

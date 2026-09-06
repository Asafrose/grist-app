import * as SecureStore from "expo-secure-store";
import { create, useStore } from "zustand";

export const TOKEN_KEY = "grain_pat";

type AuthState =
  | { status: "loading"; token: null }
  | { status: "signed-out"; token: null }
  | { status: "signed-in"; token: string };

export const authStore = create<AuthState>(() => ({ status: "loading", token: null }));

async function signIn(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  authStore.setState({ status: "signed-in", token });
}

async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  authStore.setState({ status: "signed-out", token: null });
}

export function hydrateAuth(): Promise<void> {
  return SecureStore.getItemAsync(TOKEN_KEY).then((token) => {
    authStore.setState(
      token ? { status: "signed-in", token } : { status: "signed-out", token: null },
    );
  });
}

export const authReady = hydrateAuth();

export const auth = {
  signIn,
  signOut,
  token: () => authStore.getState().token,
};

export const useAuthToken = () => useStore(authStore, (s) => s.token);
export const useSignedIn = () => useStore(authStore, (s) => s.status === "signed-in");

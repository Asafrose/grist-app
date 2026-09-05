import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

export const TOKEN_KEY = "grain_pat";

type AuthState =
  | { status: "loading"; token: null }
  | { status: "signed-out"; token: null }
  | { status: "signed-in"; token: string };

type AuthActions = {
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState & AuthActions>((set) => ({
  status: "loading",
  token: null,

  async signIn(token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    set({ status: "signed-in", token });
  },

  async signOut() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ status: "signed-out", token: null });
  },
}));

export function hydrateAuth(): Promise<void> {
  return SecureStore.getItemAsync(TOKEN_KEY).then((token) => {
    useAuth.setState(
      token ? { status: "signed-in", token } : { status: "signed-out", token: null },
    );
  });
}

export const authReady = hydrateAuth();

export const auth = {
  signIn: (token: string) => useAuth.getState().signIn(token),
  signOut: () => useAuth.getState().signOut(),
  token: () => useAuth.getState().token,
};

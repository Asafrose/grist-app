jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    mockKeychain: store,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afterFirstUnlockThisDeviceOnly",
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

import * as SecureStore from "expo-secure-store";
import { auth, authReady, hydrateAuth, TOKEN_KEY, useAuth } from "./auth";

const mockStore = (SecureStore as unknown as { mockKeychain: Map<string, string> }).mockKeychain;

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  useAuth.setState({ status: "loading", token: null });
});

describe("auth store", () => {
  it("starts loading and hydrates to signed-out when the keychain is empty", async () => {
    expect(useAuth.getState().status).toBe("loading");
    await hydrateAuth();
    expect(useAuth.getState()).toMatchObject({ status: "signed-out", token: null });
  });

  it("hydrates to signed-in when a token is in the keychain", async () => {
    mockStore.set(TOKEN_KEY, "grain_pat_abc");
    await hydrateAuth();
    expect(useAuth.getState()).toMatchObject({ status: "signed-in", token: "grain_pat_abc" });
  });

  it("kicks off hydration on import so the app never waits on a component effect", async () => {
    await expect(authReady).resolves.toBeUndefined();
  });

  it("signIn writes to the keychain with device-only accessibility and updates state", async () => {
    await auth.signIn("grain_pat_xyz");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEY, "grain_pat_xyz", {
      keychainAccessible: "afterFirstUnlockThisDeviceOnly",
    });
    expect(useAuth.getState()).toMatchObject({ status: "signed-in", token: "grain_pat_xyz" });
    expect(auth.token()).toBe("grain_pat_xyz");
  });

  it("signOut clears the keychain and state", async () => {
    await auth.signIn("grain_pat_xyz");
    await auth.signOut();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
    expect(useAuth.getState()).toMatchObject({ status: "signed-out", token: null });
    expect(auth.token()).toBeNull();
  });

  it("does not change state if the keychain write fails", async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error("keychain locked"));
    await expect(auth.signIn("bad")).rejects.toThrow("keychain locked");
    expect(useAuth.getState().status).toBe("loading");
  });

  it("notifies subscribers on every transition", async () => {
    const seen: string[] = [];
    const unsub = useAuth.subscribe((s) => seen.push(s.status));
    await hydrateAuth();
    await auth.signIn("t");
    await auth.signOut();
    unsub();
    expect(seen).toEqual(["signed-out", "signed-in", "signed-out"]);
  });
});

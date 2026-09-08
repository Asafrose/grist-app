import * as SecureStore from "expo-secure-store";
import { auth, authReady, hydrateAuth, TOKEN_KEY, authStore } from "./auth";

const mockStore = (SecureStore as unknown as { mockKeychain: Map<string, string> }).mockKeychain;

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  authStore.setState({ status: "loading", token: null, rejected: null });
});

describe("auth store", () => {
  it("starts loading and hydrates to signed-out when the keychain is empty", async () => {
    expect(authStore.getState().status).toBe("loading");
    await hydrateAuth();
    expect(authStore.getState()).toMatchObject({ status: "signed-out", token: null });
  });

  it("hydrates to signed-in when a token is in the keychain", async () => {
    mockStore.set(TOKEN_KEY, "grain_pat_abc");
    await hydrateAuth();
    expect(authStore.getState()).toMatchObject({ status: "signed-in", token: "grain_pat_abc" });
  });

  it("kicks off hydration on import so the app never waits on a component effect", async () => {
    await expect(authReady).resolves.toBeUndefined();
  });

  it("signIn writes to the keychain with device-only accessibility and updates state", async () => {
    await auth.signIn("grain_pat_xyz");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEY, "grain_pat_xyz", {
      keychainAccessible: "afterFirstUnlockThisDeviceOnly",
    });
    expect(authStore.getState()).toMatchObject({ status: "signed-in", token: "grain_pat_xyz" });
    expect(auth.token()).toBe("grain_pat_xyz");
  });

  it("signOut clears the keychain and state", async () => {
    await auth.signIn("grain_pat_xyz");
    await auth.signOut();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
    expect(authStore.getState()).toMatchObject({ status: "signed-out", token: null });
    expect(auth.token()).toBeNull();
  });

  it("does not change state if the keychain write fails", async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error("keychain locked"));
    await expect(auth.signIn("bad")).rejects.toThrow("keychain locked");
    expect(authStore.getState().status).toBe("loading");
  });

  it("holds the token when Grain rejects it and clears the rejection on the next success", async () => {
    await auth.signIn("grain_pat_xyz");
    auth.reject("Grain didn't accept that token. Check it and try again.");
    expect(authStore.getState()).toMatchObject({
      status: "signed-in",
      token: "grain_pat_xyz",
      rejected: "Grain didn't accept that token. Check it and try again.",
    });
    expect(auth.rejected()).toBe("Grain didn't accept that token. Check it and try again.");
    auth.accept();
    expect(auth.rejected()).toBeNull();
    auth.accept();
    expect(auth.rejected()).toBeNull();
  });

  it("ignores a rejection while signed out and clears it on sign-in and sign-out", async () => {
    auth.reject("nope");
    expect(auth.rejected()).toBeNull();
    await auth.signIn("t");
    auth.reject("nope");
    auth.reject("nope");
    expect(auth.rejected()).toBe("nope");
    await auth.signIn("t2");
    expect(auth.rejected()).toBeNull();
    auth.reject("nope");
    await auth.signOut();
    expect(auth.rejected()).toBeNull();
  });

  it("notifies subscribers on every transition", async () => {
    const seen: string[] = [];
    const unsub = authStore.subscribe((s) => seen.push(s.status));
    await hydrateAuth();
    await auth.signIn("t");
    await auth.signOut();
    unsub();
    expect(seen).toEqual(["signed-out", "signed-in", "signed-out"]);
  });
});

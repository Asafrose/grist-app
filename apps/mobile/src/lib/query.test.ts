import { GrainApiError } from "@grist/grain-api";
import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState } from "react-native";
import {
  isAuthError,
  onAppStateChange,
  QUERY_RETRIES,
  queryClient,
  RETRY_MAX_MS,
  retryDelay,
  networkSetup,
  shouldRetry,
} from "@/lib/query";

jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));

describe("query client defaults", () => {
  it("retries twice with capped exponential backoff", () => {
    const defaults = queryClient.getDefaultOptions().queries!;
    expect(defaults.retry).toBe(shouldRetry);
    expect(defaults.refetchOnWindowFocus).toBe(false);
    expect(queryClient.getDefaultOptions().mutations!.retry).toBe(shouldRetry);
    expect(shouldRetry(0, new Error("boom"))).toBe(true);
    expect(shouldRetry(QUERY_RETRIES, new Error("boom"))).toBe(false);
    expect(retryDelay(0)).toBe(1_000);
    expect(retryDelay(1)).toBe(2_000);
    expect(retryDelay(20)).toBe(RETRY_MAX_MS);
  });

  it("never retries an auth failure", () => {
    const unauthorized = new GrainApiError("Unauthorized", 401);
    expect(isAuthError(unauthorized)).toBe(true);
    expect(shouldRetry(0, unauthorized)).toBe(false);
    expect(isAuthError(new GrainApiError("Server error", 500))).toBe(false);
    expect(isAuthError(new Error("offline"))).toBe(false);
  });
});

describe("focus and online wiring", () => {
  it("registers an AppState listener that drives the focus manager", () => {
    expect((AppState.addEventListener as jest.Mock).mock.calls).toContainEqual([
      "change",
      onAppStateChange,
    ]);
    onAppStateChange("background");
    expect(focusManager.isFocused()).toBe(false);
    onAppStateChange("active");
    expect(focusManager.isFocused()).toBe(true);
    focusManager.setFocused(false);
  });

  it("drives the online manager from expo-network", () => {
    const listener = (Network.addNetworkStateListener as jest.Mock).mock.calls.at(-1)?.[0] as (e: {
      isConnected?: boolean;
      isInternetReachable?: boolean;
    }) => void;
    expect(listener).toBeDefined();
    listener({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    listener({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
    listener({ isConnected: true });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("removes the previous subscription when the listener is re-installed", () => {
    const remove = jest.fn();
    (Network.addNetworkStateListener as jest.Mock).mockReturnValueOnce({ remove });
    onlineManager.setEventListener(networkSetup);
    onlineManager.setEventListener(networkSetup);
    expect(remove).toHaveBeenCalled();
  });

  it("assumes online where the platform exposes no network listener", () => {
    const mocked = jest.requireMock("expo-network") as { addNetworkStateListener?: unknown };
    const real = mocked.addNetworkStateListener;
    mocked.addNetworkStateListener = undefined;
    const cleanup = networkSetup(() => {});
    expect(cleanup()).toBeUndefined();
    mocked.addNetworkStateListener = real;
    onlineManager.setEventListener(networkSetup);
    onlineManager.setOnline(true);
  });
});

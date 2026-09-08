import { GrainApiError } from "@grist/grain-api";
import * as Network from "expo-network";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { AppState, type AppStateStatus } from "react-native";
import { auth } from "@/lib/auth";
import { tokenErrorMessage } from "@/lib/token-error";

export const QUERY_RETRIES = 2;
export const RETRY_BASE_MS = 1_000;
export const RETRY_MAX_MS = 30_000;

export function isAuthError(error: unknown): boolean {
  return error instanceof GrainApiError && (error.isAuth || error.status === 401);
}

export function reportAuthFailure(error: unknown): boolean {
  if (!isAuthError(error)) return false;
  auth.reject(tokenErrorMessage(error));
  return true;
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return !isAuthError(error) && failureCount < QUERY_RETRIES;
}

export const retryDelay = (attempt: number) => Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry, retryDelay, refetchOnWindowFocus: false },
    mutations: { retry: shouldRetry, retryDelay },
  },
});

export function onAppStateChange(state: AppStateStatus): void {
  focusManager.setFocused(state === "active");
}

AppState.addEventListener("change", onAppStateChange);

export function networkSetup(setOnline: (online: boolean) => void): () => void {
  if (typeof Network.addNetworkStateListener !== "function") return () => undefined;
  const sub = Network.addNetworkStateListener((state) => {
    setOnline(state.isInternetReachable ?? state.isConnected ?? true);
  });
  return () => sub.remove();
}

onlineManager.setEventListener(networkSetup);

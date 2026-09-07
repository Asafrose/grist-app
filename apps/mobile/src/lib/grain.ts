import { GrainApiError, GrainClient } from "@grist/grain-api";
import { useMemo } from "react";
import { useAuthToken } from "@/lib/auth";

export function makeClient(token: string) {
  return new GrainClient({ token });
}

export function tokenErrorMessage(e: unknown): string {
  if (e instanceof GrainApiError && e.isAuth)
    return "Grain didn't accept that token. Check it and try again.";
  if (e instanceof GrainApiError && e.isRateLimit) {
    const s = e.retryAfterSeconds;
    return s && s > 0
      ? `Too many requests to Grain. Try again in ${Math.ceil(s)}s.`
      : "Too many requests to Grain. Try again in a moment.";
  }
  if (e instanceof GrainApiError)
    return `Grain returned an error (${e.status}). Try again in a moment.`;
  return "Couldn't reach Grain. Check your connection and try again.";
}

export function isTokenRejected(e: unknown): boolean {
  return e instanceof GrainApiError && e.isAuth;
}

export function useGrainClient(): GrainClient | null {
  const token = useAuthToken();
  return useMemo(() => (token ? makeClient(token) : null), [token]);
}

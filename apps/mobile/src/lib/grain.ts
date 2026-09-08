import { GrainClient } from "@grist/grain-api";
import { useMemo } from "react";
import { useAuthToken } from "@/lib/auth";

export { isTokenRejected, tokenErrorMessage } from "@/lib/token-error";

export function makeClient(token: string) {
  return new GrainClient({ token });
}

export function useGrainClient(): GrainClient | null {
  const token = useAuthToken();
  return useMemo(() => (token ? makeClient(token) : null), [token]);
}

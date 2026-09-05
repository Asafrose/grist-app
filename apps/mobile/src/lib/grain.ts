import { GrainClient } from "@grist/grain-api";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";

export function makeClient(token: string) {
  return new GrainClient({ token });
}

export function useGrainClient(): GrainClient | null {
  const token = useAuth((s) => s.token);
  return useMemo(() => (token ? makeClient(token) : null), [token]);
}

import type { ReactNode } from "react";

const chain: Record<string, unknown> = new Proxy({}, { get: () => () => chain }) as Record<
  string,
  unknown
>;

export const Gesture = new Proxy({}, { get: () => () => chain });

export function GestureDetector({ children }: { children: ReactNode }) {
  return children;
}

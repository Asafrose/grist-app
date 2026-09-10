import { type ComponentType, useState } from "react";
import { ScrollView, View } from "react-native";

export const useSharedValue = <T,>(initial: T) => {
  const [shared] = useState(() => {
    const box = { held: initial };
    return {
      get: () => box.held,
      set: (next: T) => {
        box.held = next;
      },
    };
  });
  return shared;
};

export const useAnimatedStyle = (fn: () => unknown) => fn();
export const useAnimatedRef = () => ({ current: null });
export const cancelAnimation = () => {};
export const withTiming = <T,>(to: T) => to;
export const Easing = {
  quad: (t: number) => t * t,
  out: (fn: (t: number) => number) => (t: number) => 1 - fn(1 - t),
};
export const withSpring = <T,>(to: T) => to;
export const runOnJS =
  <A extends unknown[]>(fn: (...args: A) => void) =>
  (...args: A) =>
    fn(...args);

const createAnimatedComponent = <P,>(Component: ComponentType<P>) => Component;

export default { View, ScrollView, createAnimatedComponent };
export { createAnimatedComponent };

import type { TextStyle } from "react-native";

export const fonts = {
  regular: "PlusJakartaSans-Regular",
  medium: "PlusJakartaSans-Medium",
  semibold: "PlusJakartaSans-SemiBold",
  bold: "PlusJakartaSans-Bold",
  extrabold: "PlusJakartaSans-ExtraBold",
  mono: "JetBrainsMono-Regular",
  monoMedium: "JetBrainsMono-Medium",
} as const;

export const type = {
  h1: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 32, letterSpacing: -0.56 },
  h2: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  h3: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  sub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  subStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.48,
    textTransform: "uppercase",
  },
  tab: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14 },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"] },
  monoMedium: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
  },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

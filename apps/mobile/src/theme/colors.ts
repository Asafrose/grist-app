import { useColorScheme } from "@/hooks/use-color-scheme";

export const palette = {
  light: {
    bg: "#F7F6F2",
    surface: "#FFFFFF",
    surface2: "#F1F0EB",
    ink: "#1B1D1F",
    ink2: "#5A6067",
    ink3: "#8B9096",
    line: "#E7E5DF",
    accent: "#0E8C86",
    onAccent: "#FFFFFF",
    accentSoft: "#DFF2F0",
    ext: "#B85C1E",
    extSoft: "#FBEDE3",
    danger: "#C2410C",
    scrim: "rgba(20,22,24,0.45)",
    speakers: ["#2F8F9D", "#B0752E", "#8A6BB5", "#4F9A5B"],
  },
  dark: {
    bg: "#121415",
    surface: "#1B1E20",
    surface2: "#22262A",
    ink: "#F2F1EC",
    ink2: "#A9AFB5",
    ink3: "#737980",
    line: "#2A2E31",
    accent: "#3FBDB4",
    onAccent: "#0E1F1E",
    accentSoft: "#163A38",
    ext: "#E08A4F",
    extSoft: "#3A2416",
    danger: "#F0865A",
    scrim: "rgba(0,0,0,0.6)",
    speakers: ["#5FB6C2", "#D3A15A", "#B39AD8", "#7BC287"],
  },
} as const;

export type Scheme = keyof typeof palette;
export type Colors = (typeof palette)[Scheme];

export function useColors(): Colors {
  const scheme = useColorScheme();
  return palette[scheme === "dark" ? "dark" : "light"];
}

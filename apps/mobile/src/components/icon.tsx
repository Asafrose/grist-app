import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useColors } from "@/theme";

const paths = {
  search: (
    <>
      <Path d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z" />
      <Path d="M20 20l-3.5-3.5" />
    </>
  ),
  sliders: (
    <>
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <Circle cx="16" cy="7" r="2" />
      <Circle cx="10" cy="17" r="2" />
    </>
  ),
  play: <Path d="M7 5v14l12-7z" fill="currentColor" stroke="none" />,
  pause: <Path d="M8 5v14M16 5v14" strokeWidth={3} />,
  back10: (
    <>
      <Path d="M4 12a8 8 0 1 0 2.3-5.7L4 8" />
      <Path d="M4 3v5h5" />
      <Path d="M10 15v-5l-1.5 1M14.5 15c1 0 1.5-.8 1.5-2.5S15.5 10 14.5 10 13 10.8 13 12.5s.5 2.5 1.5 2.5z" />
    </>
  ),
  fwd10: (
    <>
      <Path d="M20 12a8 8 0 1 1-2.3-5.7L20 8" />
      <Path d="M20 3v5h-5" />
      <Path d="M10 15v-5l-1.5 1M14.5 15c1 0 1.5-.8 1.5-2.5S15.5 10 14.5 10 13 10.8 13 12.5s.5 2.5 1.5 2.5z" />
    </>
  ),
  chevronRight: <Path d="M9 6l6 6-6 6" />,
  chevronDown: <Path d="M6 9l6 6 6-6" />,
  back: <Path d="M15 6l-6 6 6 6" />,
  share: (
    <>
      <Path d="M12 3v12M8 7l4-4 4 4" />
      <Path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </>
  ),
  download: (
    <>
      <Path d="M12 3v12M8 11l4 4 4-4" />
      <Path d="M5 19h14" />
    </>
  ),
  tag: (
    <>
      <Path d="M3 11V4h7l10 10-7 7z" />
      <Circle cx="7.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  people: (
    <>
      <Circle cx="9" cy="8" r="3.5" />
      <Path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <Path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2" />
    </>
  ),
  calendar: (
    <>
      <Rect x="3" y="5" width="18" height="16" rx="3" />
      <Path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  more: (
    <>
      <Circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <Circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <Circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  video: (
    <>
      <Rect x="3" y="6" width="13" height="12" rx="3" />
      <Path d="M16 10l5-3v10l-5-3z" />
    </>
  ),
  pip: (
    <>
      <Rect x="3" y="5" width="18" height="14" rx="3" />
      <Rect x="12" y="11" width="7" height="5" rx="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  gear: (
    <>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  clips: (
    <>
      <Circle cx="6" cy="6" r="3" />
      <Circle cx="6" cy="18" r="3" />
      <Path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1l3.9 3.9" />
    </>
  ),
  list: <Path d="M4 6h16M4 12h16M4 18h10" />,
  mic: (
    <>
      <Rect x="9" y="3" width="6" height="11" rx="3" />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  text: <Path d="M4 6h16M4 10h16M4 14h10M4 18h7" />,
  check: <Path d="M5 12l5 5L20 7" />,
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  external: (
    <>
      <Path d="M14 4h6v6M20 4l-9 9" />
      <Path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </>
  ),
  key: (
    <>
      <Circle cx="8" cy="14" r="4" />
      <Path d="M11 11l9-9M16 4l3 3M13 7l3 3" />
    </>
  ),
  wifi: (
    <>
      <Path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0" />
      <Circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  speed: (
    <>
      <Path d="M4 14a8 8 0 1 1 16 0" />
      <Path d="M12 14l4-5" />
      <Circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  copy: (
    <>
      <Rect x="9" y="9" width="11" height="11" rx="2" />
      <Path d="M5 15V5a1 1 0 0 1 1-1h10" />
    </>
  ),
  screen: (
    <>
      <Rect x="3" y="5" width="18" height="12" rx="2" />
      <Path d="M8 21h8M12 17v4" />
    </>
  ),
  grist: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 7v10M8 10v4M16 10v4" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  const colors = useColors();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? colors.ink}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      color={color ?? colors.ink}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {paths[name]}
    </Svg>
  );
}

import type { RecordingDetail } from "@/lib/data";
import { render, screen } from "@/test/render";
import { ClipsTab } from "./clips-tab";
import { SummaryTab } from "./summary-tab";
import { TimelineTab } from "./timeline-tab";

jest.mock("react-native-reanimated", () => require("@/test/mocks/reanimated"));
jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-image", () => ({ Image: jest.requireActual("react-native").Image }));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn(), useGrainClient: jest.fn() }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRoute: () => ({ key: "meeting-1" }),
  useRouter: () => ({ push: jest.fn() }),
}));

const rec = {
  id: "r1",
  title: "Probe",
  mediaType: "video",
  durationMs: 600_000,
  participants: [],
  actionItems: [],
  sections: [{ position: 0, title: "Overview", markdown: "hello" }],
  highlights: [],
  screenshares: [],
  tags: [],
  syncedAt: null,
} as unknown as RecordingDetail;

const withClip = {
  ...rec,
  highlights: [
    { id: "h1", text: "A clip", timestamp: 1000, durationMs: 20_000, thumbnailUrl: null, url: "" },
  ],
} as unknown as RecordingDetail;

const INSET = 207;

const tabs = [
  ["summary-tab", <SummaryTab key="s" rec={rec} onSeek={() => {}} contentInsetBottom={INSET} />],
  ["timeline-tab", <TimelineTab key="t" rec={rec} onSeek={() => {}} contentInsetBottom={INSET} />],
  ["clips-tab", <ClipsTab key="c" rec={withClip} onSeek={() => {}} contentInsetBottom={INSET} />],
] as const;

describe.each(tabs)("%s content inset", (testID, element) => {
  // NativeWind compiles `contentContainerClassName` into `contentContainerStyle`, so passing
  // that prop as well drops the tab's gap and padding and the content stops overflowing.
  it("gives the collapsed card's height back as a spacer, not as a style override", async () => {
    await render(element);
    expect(screen.getByTestId(testID).props.contentContainerStyle).toBeUndefined();
    expect(screen.getByTestId(`${testID}-inset`)).toHaveStyle({ height: INSET });
  });
});

it("drops the spacer when the card is showing", async () => {
  await render(<TimelineTab rec={rec} onSeek={() => {}} />);
  expect(screen.queryByTestId("timeline-tab-inset")).toBeNull();
});

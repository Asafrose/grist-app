import { MeetingRow } from "@/components/meeting-row";
import type { RecordingListRow } from "@/lib/data";
import { render, screen } from "@/test/render";

jest.mock("expo-image", () => ({ Image: jest.requireActual("react-native").Image }));
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/lib/data", () => ({ useDownload: () => ({ status: "idle" }) }));
jest.mock("@/lib/thumbnails", () => ({
  usePoster: (subject: { thumbnailUrl?: string | null }) => ({
    uri: mockGenerating ? null : (subject.thumbnailUrl ?? null),
    generating: mockGenerating,
  }),
}));

let mockGenerating = false;

beforeEach(() => {
  mockGenerating = false;
});

const HOUR = 3_600_000;

const item = (
  positionSeconds: number | null,
  extra: Partial<RecordingListRow> = {},
): RecordingListRow =>
  ({
    id: "r1",
    title: "Weekly sync",
    mediaType: "video",
    thumbnailUrl: "https://example.test/t.jpg",
    highlightThumbnailUrl: null,
    startDatetime: new Date(2026, 8, 6, 13, 5).toISOString(),
    durationMs: 30 * 60_000,
    participantCount: 4,
    externalCount: 0,
    recorders: [{ id: "u1", name: "Ada" }],
    tags: [],
    teams: [],
    meetingType: null,
    externalEmails: "[]",
    positionSeconds,
    openedAt: null,
    ...extra,
  }) as unknown as RecordingListRow;

describe("MeetingRow", () => {
  it("shows the duration badge and no progress bar with no stored position", async () => {
    await render(<MeetingRow item={item(null)} last />);
    expect(screen.getByText("30m")).toBeTruthy();
    expect(screen.queryByTestId("progress-r1")).toBeNull();
    expect(screen.queryByTestId("time-left-r1")).toBeNull();
  });

  it("replaces the badge with the time left and shows a progress bar mid-view", async () => {
    await render(<MeetingRow item={item(10 * 60)} last />);
    expect(screen.getByTestId("time-left-r1")).toHaveTextContent("20 min left");
    expect(screen.queryByText("30m")).toBeNull();
    expect(screen.getByTestId("progress-r1")).toBeTruthy();
  });

  it("badges an unopened recording from the last two days as New", async () => {
    const startDatetime = new Date(Date.now() - 3 * HOUR).toISOString();
    await render(<MeetingRow item={item(null, { startDatetime })} last />);
    expect(screen.getByText("New")).toBeTruthy();
    expect(screen.getByTestId("new-r1")).toBeTruthy();
  });

  it("drops the badge once the recording has been opened", async () => {
    const startDatetime = new Date(Date.now() - 3 * HOUR).toISOString();
    const openedAt = new Date().toISOString();
    await render(<MeetingRow item={item(null, { startDatetime, openedAt })} last />);
    expect(screen.queryByTestId("new-r1")).toBeNull();
  });

  it("drops the badge past 48 hours even when never opened", async () => {
    const startDatetime = new Date(Date.now() - 49 * HOUR).toISOString();
    await render(<MeetingRow item={item(null, { startDatetime })} last />);
    expect(screen.queryByTestId("new-r1")).toBeNull();
  });

  it("never shows the badge beside the remaining-time indicator", async () => {
    const startDatetime = new Date(Date.now() - 3 * HOUR).toISOString();
    await render(<MeetingRow item={item(10 * 60, { startDatetime })} last />);
    expect(screen.getByTestId("time-left-r1")).toBeTruthy();
    expect(screen.queryByTestId("new-r1")).toBeNull();
  });

  it("shows nothing special once watched to the end", async () => {
    await render(<MeetingRow item={item(30 * 60 - 5)} last />);
    expect(screen.getByText("30m")).toBeTruthy();
    expect(screen.queryByTestId("progress-r1")).toBeNull();
  });

  it("falls back to the first highlight thumbnail", async () => {
    await render(
      <MeetingRow
        item={item(null, {
          thumbnailUrl: null,
          highlightThumbnailUrl: "https://example.test/h.jpg",
        })}
        last
      />,
    );
    expect(screen.getByTestId("thumb-r1")).toHaveProp("source", {
      uri: "https://example.test/h.jpg",
    });
  });

  it("spins while a thumbnail is being generated for a video", async () => {
    mockGenerating = true;
    await render(<MeetingRow item={item(null, { thumbnailUrl: null })} last />);
    expect(screen.getByTestId("thumb-loading-r1")).toBeOnTheScreen();
  });

  it("shows the media icon for audio with no thumbnail", async () => {
    mockGenerating = true;
    await render(<MeetingRow item={item(null, { thumbnailUrl: null, mediaType: "audio" })} last />);
    expect(screen.queryByTestId("thumb-loading-r1")).toBeNull();
  });
});

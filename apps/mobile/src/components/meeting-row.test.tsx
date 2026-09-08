import { MeetingRow } from "@/components/meeting-row";
import type { RecordingListRow } from "@/lib/data";
import { render, screen } from "@/test/render";

jest.mock("expo-image", () => ({ Image: jest.requireActual("react-native").Image }));
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/lib/data", () => ({ useDownload: () => ({ status: "idle" }) }));
jest.mock("@/lib/thumbnails", () => ({ useThumbnail: () => null }));

const item = (positionSeconds: number | null): RecordingListRow =>
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

  it("shows nothing special once watched to the end", async () => {
    await render(<MeetingRow item={item(30 * 60 - 5)} last />);
    expect(screen.getByText("30m")).toBeTruthy();
    expect(screen.queryByTestId("progress-r1")).toBeNull();
  });
});

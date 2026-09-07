import type { Recording, Transcript } from "@grist/grain-api";
import detail from "@grist/grain-api/fixtures/recording.json";
import transcript from "@grist/grain-api/fixtures/transcript.json";
import { act, fireEvent, render, screen } from "@/test/render";
import { getRecording, type RecordingDetail, setTranscript, upsertRecordings } from "@/lib/db";
import { libraryReady, libraryStore } from "@/lib/library";
import { playerStore } from "@/lib/player";
import { palette } from "@/theme";
import { TranscriptTab } from "./transcript-tab";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("expo-video", () => ({
  createVideoPlayer: jest.fn(() => ({
    addListener: jest.fn(),
    replaceAsync: jest.fn(async () => {}),
    play: jest.fn(),
    pause: jest.fn(),
  })),
  VideoView: () => null,
  isPictureInPictureSupported: () => false,
}));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "CELLULAR" })),
}));
jest.mock("@/lib/db/open", () => ({
  openDb: jest.fn(async () => jest.requireActual("@/test/db").testDb()),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("expo-sqlite", () => ({ addDatabaseChangeListener: () => ({ remove() {} }) }));

const mockScrollToIndex = jest.fn();
jest.mock("@shopify/flash-list", () => {
  const React = jest.requireActual("react");
  const { FlatList } = jest.requireActual("react-native");
  const FlashList = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ scrollToIndex: mockScrollToIndex }));
    return <FlatList {...props} initialNumToRender={50} />;
  });
  return { FlashList };
});

const NOW = "2026-09-06T10:00:00Z";
const base = detail as Recording;
const segments = transcript as Transcript;

function seed(overrides: Partial<Recording> = {}, withTranscript = true): RecordingDetail {
  const db = libraryStore.getState().db!;
  upsertRecordings(db, [{ ...base, ...overrides }], NOW);
  setTranscript(db, base.id, withTranscript ? segments : [], NOW);
  return getRecording(db, base.id)!;
}

const nowPlaying = {
  id: base.id,
  title: base.title,
  mediaType: "video",
  thumbnailUrl: null,
  durationMs: base.duration_ms,
};

async function show(rec: RecordingDetail, onSeek: (ms: number) => void) {
  await render(<TranscriptTab rec={rec} onSeek={onSeek} />);
  await screen.findByTestId("transcript-line-0");
}

beforeAll(async () => {
  await libraryReady;
});

beforeEach(() => {
  mockScrollToIndex.mockClear();
  playerStore.setState({ current: null, position: 0, playing: false });
});

describe("TranscriptTab", () => {
  it("renders every line with speaker, time and stable per-speaker colours", async () => {
    await show(seed(), jest.fn());

    expect(screen.getByTestId("transcript-tab")).toBeOnTheScreen();
    expect(screen.getByTestId("transcript-line-0")).toHaveTextContent(/Marcus Kowalski/);
    expect(screen.getByTestId("transcript-line-0")).toHaveTextContent(/0:04/);
    expect(screen.getByTestId("transcript-line-1")).toHaveTextContent(/Mia Duarte/);
    expect(screen.getAllByText("MK").length).toBeGreaterThan(1);

    const [s1, s2] = palette.light.speakers;
    for (const name of screen.getAllByText("Marcus Kowalski"))
      expect(name).toHaveStyle({ color: s1 });
    for (const name of screen.getAllByText("Mia Duarte")) expect(name).toHaveStyle({ color: s2 });
    expect(screen.getByTestId("transcript-follow")).toBeSelected();
    expect(screen.queryByTestId("transcript-empty")).toBeNull();
  });

  it("seeks to the line's start when a line is tapped", async () => {
    const onSeek = jest.fn();
    await show(seed(), onSeek);
    await fireEvent.press(screen.getByTestId("transcript-line-1"));
    expect(onSeek).toHaveBeenCalledWith(segments[1].start);
  });

  it("filters and jumps between matches with an n of m count", async () => {
    await show(seed(), jest.fn());
    await fireEvent.changeText(screen.getByTestId("transcript-search"), "Volume");

    const total = segments.filter((s) => s.text.toLowerCase().includes("volume")).length;
    expect(total).toBeGreaterThan(1);
    expect(screen.getByTestId("transcript-count")).toHaveTextContent(`1 of ${total}`);
    expect(mockScrollToIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({ index: 0, viewPosition: 0.5 }),
    );
    expect(screen.getAllByText("volume").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("transcript-follow")).toBeNull();

    await fireEvent.press(screen.getByTestId("transcript-next"));
    expect(screen.getByTestId("transcript-count")).toHaveTextContent(`2 of ${total}`);
    const second = mockScrollToIndex.mock.lastCall?.[0].index;
    expect(second).toBeGreaterThan(0);

    await fireEvent.press(screen.getByTestId("transcript-prev"));
    expect(screen.getByTestId("transcript-count")).toHaveTextContent(`1 of ${total}`);
    await fireEvent.press(screen.getByTestId("transcript-prev"));
    expect(screen.getByTestId("transcript-count")).toHaveTextContent(`${total} of ${total}`);

    await fireEvent.changeText(screen.getByTestId("transcript-search"), "zebra");
    expect(screen.getByTestId("transcript-count")).toHaveTextContent("0 of 0");
    expect(screen.getByTestId("transcript-next")).toBeDisabled();

    await fireEvent.press(screen.getByTestId("transcript-clear"));
    expect(screen.queryByTestId("transcript-count")).toBeNull();
    expect(screen.getByTestId("transcript-follow")).not.toBeSelected();
  });

  it("highlights the current line and follows playback only for the playing recording", async () => {
    await show(seed(), jest.fn());
    await act(async () => playerStore.setState({ position: segments[2].start / 1000 + 0.1 }));
    expect(screen.getByTestId("transcript-line-2")).not.toBeSelected();
    expect(mockScrollToIndex).not.toHaveBeenCalled();

    await act(async () => playerStore.setState({ current: nowPlaying }));
    expect(screen.getByTestId("transcript-line-2")).toBeSelected();
    expect(screen.getByTestId("transcript-line-1")).not.toBeSelected();
    expect(mockScrollToIndex).toHaveBeenLastCalledWith({
      index: 2,
      animated: true,
      viewPosition: 0.5,
    });

    await act(async () => playerStore.setState({ position: segments[5].start / 1000 }));
    expect(screen.getByTestId("transcript-line-5")).toBeSelected();
    expect(mockScrollToIndex).toHaveBeenLastCalledWith(expect.objectContaining({ index: 5 }));

    mockScrollToIndex.mockClear();
    await fireEvent(screen.getByTestId("transcript-list"), "scrollBeginDrag");
    expect(screen.getByTestId("transcript-follow")).not.toBeSelected();
    await act(async () => playerStore.setState({ position: segments[6].start / 1000 }));
    expect(screen.getByTestId("transcript-line-6")).toBeSelected();
    expect(mockScrollToIndex).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("transcript-follow"));
    expect(screen.getByTestId("transcript-follow")).toBeSelected();
    expect(mockScrollToIndex).toHaveBeenLastCalledWith(expect.objectContaining({ index: 6 }));
  });

  it("shows a clear state when the transcript is not downloaded", async () => {
    await render(<TranscriptTab rec={seed({}, false)} onSeek={jest.fn()} />);
    expect(screen.getByTestId("transcript-empty")).toBeOnTheScreen();
    expect(screen.getByText("Transcript not downloaded yet")).toBeOnTheScreen();
    expect(screen.queryByTestId("transcript-list")).toBeNull();
  });

  it("lets a transcript-only recording be read without a Follow control", async () => {
    await render(<TranscriptTab rec={seed({ media_type: "transcript" })} onSeek={jest.fn()} />);
    expect(screen.getByTestId("transcript-line-0")).toBeOnTheScreen();
    expect(screen.queryByTestId("transcript-follow")).toBeNull();
    await act(async () =>
      playerStore.setState({ current: { ...nowPlaying, mediaType: "transcript" } }),
    );
    expect(screen.getByTestId("transcript-line-0")).not.toBeSelected();
  });
});

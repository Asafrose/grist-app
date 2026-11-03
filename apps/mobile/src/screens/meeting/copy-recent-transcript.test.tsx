import * as Clipboard from "expo-clipboard";
import { act, fireEvent, render, screen } from "@/test/render";
import { type RecordingDetail, useResumePosition, useTranscript } from "@/lib/data";
import { playerStore } from "@/lib/player";
import { CopyRecentTranscript } from "./copy-recent-transcript";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("@/lib/data", () => ({
  ...jest.requireActual("@/lib/data"),
  useTranscript: jest.fn(),
  useResumePosition: jest.fn(),
}));

const rec = { id: "r1", title: "Planning", durationMs: 120_000 } as RecordingDetail;
const segments = [
  { start: 0, end: 20_000, speaker: "Ana", text: "Earlier" },
  { start: 30_000, end: 50_000, speaker: "Ben", text: "Recent" },
  { start: 70_000, end: 80_000, speaker: "Ana", text: "Later" },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  jest.mocked(useTranscript).mockReturnValue(segments as ReturnType<typeof useTranscript>);
  jest.mocked(useResumePosition).mockReturnValue(15);
  playerStore.setState({
    current: { ...rec, mediaType: "audio", thumbnailUrl: null },
    position: 60,
    playing: false,
  });
});

it("copies paused playback context with a title and range and confirms success", async () => {
  await render(<CopyRecentTranscript rec={rec} />);
  await fireEvent.press(screen.getByTestId("copy-recent-transcript"));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
    "Planning\nTranscript around 0:30–1:00 (complete segments)\n\n[0:30] Ben: Recent",
  );
  expect(screen.getByTestId("copy-recent-transcript-status")).toHaveTextContent(/Copied 0:30–1:00/);
  expect(useTranscript).toHaveBeenCalledWith(rec.id);
});

it("uses the updated position after seeking while playing", async () => {
  await render(<CopyRecentTranscript rec={rec} />);
  await act(async () => {
    playerStore.setState({ position: 85, playing: true });
  });
  await fireEvent.press(screen.getByTestId("copy-recent-transcript"));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
    expect.stringContaining("[1:10] Ana: Later"),
  );
  expect(Clipboard.setStringAsync).not.toHaveBeenCalledWith(expect.stringContaining("Ben: Recent"));
});

it("uses this recording's resume position instead of another recording's playback", async () => {
  playerStore.setState({
    current: { ...rec, id: "other", mediaType: "audio", thumbnailUrl: null },
  });
  await render(<CopyRecentTranscript rec={rec} />);
  await fireEvent.press(screen.getByTestId("copy-recent-transcript"));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
    "Planning\nTranscript around 0:00–0:15 (complete segments)\n\n[0:00] Ana: Earlier",
  );
});

it("disables copying when the transcript is missing", async () => {
  jest.mocked(useTranscript).mockReturnValue([]);
  await render(<CopyRecentTranscript rec={rec} />);
  expect(screen.getByTestId("copy-recent-transcript")).toBeDisabled();
  expect(screen.getByTestId("copy-recent-transcript-status")).toHaveTextContent(
    /Transcript not downloaded yet/,
  );
  await fireEvent.press(screen.getByTestId("copy-recent-transcript"));
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
});

it.each([0, 120])(
  "keeps the clipboard unchanged when the window at %s is empty",
  async (position) => {
    playerStore.setState({ position });
    await render(<CopyRecentTranscript rec={rec} />);
    await fireEvent.press(screen.getByTestId("copy-recent-transcript"));
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("copy-recent-transcript-status")).toHaveTextContent(
      /No transcript in the last 30 seconds/,
    );
  },
);

it.each(["rejected", "false"])("handles a %s clipboard write and allows retry", async (failure) => {
  if (failure === "rejected")
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error("unavailable"));
  else jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
  await render(<CopyRecentTranscript rec={rec} />);
  await fireEvent.press(screen.getByTestId("copy-recent-transcript"));
  expect(screen.getByTestId("copy-recent-transcript-status")).toHaveTextContent(
    "Couldn't copy. Try again.",
  );
  await fireEvent.press(screen.getByTestId("copy-recent-transcript"));
  expect(screen.getByTestId("copy-recent-transcript-status")).toHaveTextContent(/Copied/);
});

it("prevents duplicate writes while the clipboard is pending", async () => {
  let resolve!: (value: boolean) => void;
  jest.mocked(Clipboard.setStringAsync).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render(<CopyRecentTranscript rec={rec} />);
  await fireEvent.press(screen.getByTestId("copy-recent-transcript"));
  expect(screen.getByTestId("copy-recent-transcript")).toBeDisabled();
  await fireEvent.press(screen.getByTestId("copy-recent-transcript"));
  expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve(true);
  });
  expect(screen.getByTestId("copy-recent-transcript")).toBeEnabled();
});

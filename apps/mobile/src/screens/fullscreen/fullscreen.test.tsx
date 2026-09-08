import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@/test/render";
import { setTranscript } from "@/lib/db";
import { haptics } from "@/lib/haptics";
import { libraryReady, libraryStore } from "@/lib/library";
import { type NowPlaying, playback, playerStore } from "@/lib/player";
import { settings } from "@/lib/settings";
import { CONTROLS_HIDE_MS, Fullscreen } from "./index";

jest.mock("@/lib/haptics", () => ({ haptics: { selection: jest.fn(), light: jest.fn() } }));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-image", () => ({ Image: jest.requireActual("react-native").Image }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));

const video: NowPlaying = {
  id: "r1",
  title: "Pricing review",
  mediaType: "video",
  thumbnailUrl: null,
  durationMs: 600_000,
};

const seedTranscript = (segments: { start: number; end: number; speaker: string }[]) =>
  act(async () =>
    setTranscript(
      libraryStore.getState().db!,
      video.id,
      segments.map((s) => ({ ...s, text: "line", participant_id: null })),
      "2026-09-06T10:00:00Z",
    ),
  );

beforeAll(async () => {
  await libraryReady;
});

afterEach(async () => {
  await seedTranscript([]);
});

beforeEach(() => {
  jest.restoreAllMocks();
  mockBack.mockClear();
  settings.set("pictureInPicture", true);
  playerStore.setState({
    current: video,
    status: "ready",
    playing: true,
    position: 120,
    duration: 600,
    until: null,
    error: null,
  });
});

const tick = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe("Fullscreen", () => {
  it("renders the shared video view with our overlay controls", async () => {
    await seedTranscript([
      { start: 100_000, end: 125_000, speaker: "Ana Lima" },
      { start: 130_000, end: 140_000, speaker: "Ben Ortiz" },
    ]);
    await render(<Fullscreen />);
    await screen.findByTestId("fs-next-speaker");
    expect(screen.getByTestId("video-view")).toBeOnTheScreen();
    expect(screen.getByTestId("fs-controls")).toBeOnTheScreen();
    for (const id of [
      "fs-close",
      "fs-play-pause",
      "fs-seek-back",
      "fs-seek-forward",
      "fs-rate",
      "fs-pip",
      "fs-scrubber",
      "fs-next-speaker",
    ]) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
    expect(screen.getByText("2:00")).toBeOnTheScreen();
    expect(screen.getByText("-8:00")).toBeOnTheScreen();
    expect(screen.getByLabelText("Pause")).toBeOnTheScreen();
  });

  it("drives the shared player through the facade", async () => {
    const toggle = jest.spyOn(playback, "toggle").mockImplementation(() => {});
    const seekBy = jest.spyOn(playback, "seekBy").mockImplementation(() => {});
    const setRate = jest.spyOn(playback, "setRate").mockImplementation(() => {});
    const pip = jest.spyOn(playback, "startPictureInPicture").mockResolvedValue(undefined);
    await render(<Fullscreen />);
    await fireEvent.press(screen.getByTestId("fs-play-pause"));
    expect(toggle).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId("fs-seek-back"));
    expect(seekBy).toHaveBeenCalledWith(-10);
    await fireEvent.press(screen.getByTestId("fs-seek-forward"));
    expect(seekBy).toHaveBeenCalledWith(10);
    jest.mocked(haptics.selection).mockClear();
    await fireEvent.press(screen.getByTestId("fs-rate"));
    expect(setRate).toHaveBeenCalledWith(1.2);
    expect(haptics.selection).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId("fs-pip"));
    expect(pip).toHaveBeenCalledTimes(1);
  });

  it("surfaces a rejected picture in picture start", async () => {
    const pip = jest
      .spyOn(playback, "startPictureInPicture")
      .mockRejectedValue(new Error("not allowed"));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<Fullscreen />);
    await fireEvent.press(screen.getByTestId("fs-pip"));
    expect(pip).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith("Picture in picture unavailable", "not allowed");
  });

  it("hides the picture in picture button when the setting is off", async () => {
    settings.set("pictureInPicture", false);
    await render(<Fullscreen />);
    expect(screen.queryByTestId("fs-pip")).toBeNull();
    expect(screen.getByTestId("fs-rate")).toBeOnTheScreen();
  });

  it("hides the controls after a few seconds and brings them back on tap", async () => {
    jest.useFakeTimers();
    try {
      await render(<Fullscreen />);
      expect(screen.getByTestId("fs-controls")).toBeOnTheScreen();
      await tick(CONTROLS_HIDE_MS);
      expect(screen.queryByTestId("fs-controls")).toBeNull();
      await fireEvent.press(screen.getByTestId("fs-surface"));
      expect(screen.getByTestId("fs-controls")).toBeOnTheScreen();
      await tick(CONTROLS_HIDE_MS - 1);
      await fireEvent.press(screen.getByTestId("fs-seek-forward"));
      await tick(CONTROLS_HIDE_MS - 1);
      expect(screen.getByTestId("fs-controls")).toBeOnTheScreen();
      await tick(1);
      expect(screen.queryByTestId("fs-controls")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the controls up while paused", async () => {
    jest.useFakeTimers();
    try {
      await render(<Fullscreen />);
      await act(async () => playerStore.setState({ playing: false }));
      await tick(CONTROLS_HIDE_MS * 2);
      expect(screen.getByTestId("fs-controls")).toBeOnTheScreen();
      await act(async () => playerStore.setState({ playing: true }));
      await tick(CONTROLS_HIDE_MS);
      expect(screen.queryByTestId("fs-controls")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("closes without touching the shared player, so position survives", async () => {
    const stop = jest.spyOn(playback, "stop").mockImplementation(() => {});
    await render(<Fullscreen />);
    await fireEvent.press(screen.getByTestId("fs-close"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    expect(playerStore.getState()).toMatchObject({ current: video, position: 120, playing: true });
  });

  it("seeks a second before the next speaker starts", async () => {
    const seekTo = jest.spyOn(playback, "seekTo").mockImplementation(() => {});
    await seedTranscript([
      { start: 100_000, end: 125_000, speaker: "Ana Lima" },
      { start: 130_000, end: 140_000, speaker: "Ben Ortiz" },
    ]);
    await render(<Fullscreen />);
    jest.mocked(haptics.selection).mockClear();
    await fireEvent.press(await screen.findByTestId("fs-next-speaker"));
    expect(seekTo).toHaveBeenCalledWith(129);
    expect(haptics.selection).toHaveBeenCalledTimes(1);
  });

  it("hides the next speaker control without a later speaker change", async () => {
    await seedTranscript([{ start: 100_000, end: 400_000, speaker: "Ana Lima" }]);
    await render(<Fullscreen />);
    expect(screen.queryByTestId("fs-next-speaker")).toBeNull();
  });

  it("offers only a way out when nothing is playing", async () => {
    playerStore.setState({ current: null });
    await render(<Fullscreen />);
    expect(screen.queryByTestId("video-view")).toBeNull();
    await fireEvent.press(screen.getByTestId("fs-close"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

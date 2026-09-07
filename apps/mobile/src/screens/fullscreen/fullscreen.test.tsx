import { act, fireEvent, render, screen } from "@/test/render";
import { type NowPlaying, playback, playerStore } from "@/lib/player";
import { CONTROLS_HIDE_MS, Fullscreen } from "./index";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("expo-video", () => {
  const { View } = jest.requireActual("react-native");
  return {
    createVideoPlayer: jest.fn(() => ({
      addListener: jest.fn(),
      replaceAsync: jest.fn(async () => {}),
      play: jest.fn(),
      pause: jest.fn(),
    })),
    VideoView: (props: object) => <View testID="video-view" {...props} />,
    isPictureInPictureSupported: () => true,
  };
});
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

beforeEach(() => {
  jest.restoreAllMocks();
  mockBack.mockClear();
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
    await render(<Fullscreen />);
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
    await fireEvent.press(screen.getByTestId("fs-rate"));
    expect(setRate).toHaveBeenCalledWith(1.2);
    await fireEvent.press(screen.getByTestId("fs-pip"));
    expect(pip).toHaveBeenCalledTimes(1);
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

  it("offers only a way out when nothing is playing", async () => {
    playerStore.setState({ current: null });
    await render(<Fullscreen />);
    expect(screen.queryByTestId("video-view")).toBeNull();
    await fireEvent.press(screen.getByTestId("fs-close"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

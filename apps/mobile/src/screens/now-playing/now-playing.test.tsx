import { fireEvent, render, screen } from "@/test/render";
import { getTranscript } from "@/lib/db";
import { demoRecordings, seedDemo } from "@/lib/demo";
import { libraryReady, useLibrary } from "@/lib/library";
import { type NowPlaying as Loaded, playback, usePlayer } from "@/lib/player";
import { initials, segmentAt } from "@/lib/transcript";
import { NowPlaying } from "./index";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
}));
jest.mock("@/lib/db/open", () => ({
  openDb: jest.fn(async () => jest.requireActual("@/test/db").testDb()),
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
jest.mock("expo-sqlite", () => ({ addDatabaseChangeListener: () => ({ remove() {} }) }));

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
  usePathname: () => "/now-playing",
}));

const demo = demoRecordings()[0];
const video: Loaded = {
  id: demo.id,
  title: demo.title,
  mediaType: "video",
  thumbnailUrl: demo.thumbnail_url ?? null,
  durationMs: demo.duration_ms,
};

beforeAll(async () => {
  await libraryReady;
  seedDemo(useLibrary.getState().db!);
});

beforeEach(() => {
  jest.restoreAllMocks();
  usePlayer.setState({
    current: video,
    status: "ready",
    playing: true,
    position: 60,
    duration: demo.duration_ms / 1000,
    rate: 1,
    error: null,
  });
});

describe("NowPlaying", () => {
  it("shows an empty state when nothing is loaded", async () => {
    usePlayer.setState({ current: null });
    await render(<NowPlaying />);
    expect(screen.getByText("Nothing is playing.")).toBeOnTheScreen();
  });

  it("renders title, meta, elapsed/remaining and the current transcript line", async () => {
    await render(<NowPlaying />);
    expect(screen.getByText(demo.title)).toBeOnTheScreen();
    expect(await screen.findByText(/· 44 min$/)).toBeOnTheScreen();
    expect(screen.getByText("1:00")).toBeOnTheScreen();
    expect(screen.getByText("-43:01")).toBeOnTheScreen();

    const segments = getTranscript(useLibrary.getState().db!, demo.id);
    const line = segmentAt(segments, 60_000)!;
    expect(await screen.findByTestId("np-transcript")).toHaveTextContent(
      `${initials(line.speaker)}${line.speaker} · ${line.text}`,
    );
    expect(screen.getByTestId("np-artwork")).toBeOnTheScreen();
    expect(screen.queryByText("Audio only")).toBeNull();
  });

  it("drives play/pause and skipping through the facade", async () => {
    const toggle = jest.spyOn(playback, "toggle").mockImplementation(() => {});
    const seekBy = jest.spyOn(playback, "seekBy").mockImplementation(() => {});
    await render(<NowPlaying />);
    expect(screen.getByLabelText("Pause")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("np-play-pause"));
    expect(toggle).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId("np-seek-back"));
    expect(seekBy).toHaveBeenCalledWith(-10);
    await fireEvent.press(screen.getByTestId("np-seek-forward"));
    expect(seekBy).toHaveBeenCalledWith(10);
  });

  it("offers Grain's speeds and applies the chosen one", async () => {
    const setRate = jest.spyOn(playback, "setRate").mockImplementation(() => {});
    await render(<NowPlaying />);
    expect(screen.queryByTestId("np-rates")).toBeNull();
    await fireEvent.press(screen.getByTestId("np-rate"));
    for (const r of [1, 1.2, 1.5, 1.7, 2, 2.2, 2.5]) {
      expect(screen.getByTestId(`np-rate-${r}`)).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByTestId("np-rate-1.5"));
    expect(setRate).toHaveBeenCalledWith(1.5);
    expect(screen.queryByTestId("np-rates")).toBeNull();
  });

  it("toggles between artwork and the shared video view for video recordings", async () => {
    await render(<NowPlaying />);
    expect(screen.queryByTestId("video-view")).toBeNull();
    await fireEvent.press(screen.getByTestId("np-video"));
    expect(screen.getByTestId("video-view")).toBeOnTheScreen();
    expect(screen.queryByTestId("np-artwork")).toBeNull();
    await fireEvent.press(screen.getByTestId("np-video"));
    expect(screen.getByTestId("np-artwork")).toBeOnTheScreen();
  });

  it("shows audio artwork without a video toggle for audio recordings", async () => {
    usePlayer.setState({ current: { ...video, mediaType: "audio" } });
    await render(<NowPlaying />);
    expect(screen.getByText("Audio only")).toBeOnTheScreen();
    expect(screen.queryByTestId("np-video")).toBeNull();
  });

  it("closes and opens the meeting", async () => {
    await render(<NowPlaying />);
    await fireEvent.press(screen.getByTestId("np-close"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId("np-open-meeting"));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/meeting/[id]",
      params: { id: demo.id },
    });
  });

  it("surfaces playback errors", async () => {
    usePlayer.setState({ status: "error", error: "Media expired" });
    await render(<NowPlaying />);
    expect(screen.getByText("Media expired")).toBeOnTheScreen();
  });
});

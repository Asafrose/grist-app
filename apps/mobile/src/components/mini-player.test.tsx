import { fireEvent, render, screen } from "@/test/render";
import { MiniPlayer } from "@/components/mini-player";
import { type NowPlaying, playback, usePlayer } from "@/lib/player";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("expo-video", () => ({
  createVideoPlayer: jest.fn(() => ({
    addListener: jest.fn(),
    replaceAsync: jest.fn(async () => {}),
    play: jest.fn(),
    pause: jest.fn(),
  })),
}));
jest.mock("expo-image", () => ({ Image: jest.requireActual("react-native").Image }));

const mockPush = jest.fn();
let mockPathname = "/";
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

const rec: NowPlaying = {
  id: "r1",
  title: "Northwind / Acme: Demo + POV Discussion",
  mediaType: "video",
  thumbnailUrl: null,
  durationMs: 2_641_000,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = "/";
  usePlayer.setState({
    current: null,
    status: "idle",
    playing: false,
    position: 0,
    duration: 0,
    error: null,
  });
});

describe("MiniPlayer", () => {
  it("renders nothing until a recording is loaded", async () => {
    await render(<MiniPlayer />);
    expect(screen.queryByTestId("mini-player")).toBeNull();
  });

  it("shows the title, elapsed time and drives the player facade", async () => {
    usePlayer.setState({
      current: rec,
      status: "ready",
      playing: true,
      position: 1002,
      duration: 2641,
    });
    const toggle = jest.spyOn(playback, "toggle").mockImplementation(() => {});
    const seekBy = jest.spyOn(playback, "seekBy").mockImplementation(() => {});
    await render(<MiniPlayer />);

    expect(screen.getByText(rec.title)).toBeOnTheScreen();
    expect(screen.getByText("16:42 · 44:01")).toBeOnTheScreen();
    expect(screen.getByLabelText("Pause")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("mini-play-pause"));
    expect(toggle).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId("mini-seek-back"));
    expect(seekBy).toHaveBeenCalledWith(-10);
    await fireEvent.press(screen.getByTestId("mini-seek-forward"));
    expect(seekBy).toHaveBeenCalledWith(10);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("expands to Now Playing when tapped", async () => {
    usePlayer.setState({ current: rec, status: "ready" });
    await render(<MiniPlayer />);
    await fireEvent.press(screen.getByTestId("mini-player"));
    expect(mockPush).toHaveBeenCalledWith("/now-playing");
  });

  it("shows a spinner instead of play/pause while loading", async () => {
    usePlayer.setState({ current: rec, status: "loading" });
    await render(<MiniPlayer />);
    expect(screen.queryByTestId("mini-play-pause")).toBeNull();
    expect(screen.getByTestId("mini-player")).toBeOnTheScreen();
  });

  it.each([
    ["/now-playing", false],
    ["/meeting/r1", false],
    ["/meeting/other", true],
    ["/search", true],
  ])("at %s the mini player is %s", async (path, shown) => {
    usePlayer.setState({ current: rec, status: "ready" });
    mockPathname = path;
    await render(<MiniPlayer />);
    expect(screen.queryByTestId("mini-player") !== null).toBe(shown);
  });
});

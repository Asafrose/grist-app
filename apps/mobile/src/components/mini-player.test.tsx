import { fireEvent, render, screen } from "@/test/render";
import { MiniPlayer } from "@/components/mini-player";
import { type NowPlaying, playback, playerStore } from "@/lib/player";

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

type PanEvent = { translationY: number; velocityY: number };

let mockPanUpdate: ((e: PanEvent) => void) | undefined;
let mockPanEnd: ((e: PanEvent) => void) | undefined;
jest.mock("react-native-gesture-handler", () => {
  const pan = {
    activeOffsetY: () => pan,
    failOffsetY: () => pan,
    onUpdate: (fn: (e: PanEvent) => void) => {
      mockPanUpdate = fn;
      return pan;
    },
    onEnd: (fn: (e: PanEvent) => void) => {
      mockPanEnd = fn;
      return pan;
    },
  };
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: jest.requireActual("react-native").View,
  };
});

const mockShared: { value: number }[] = [];
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: jest.requireActual("react-native").View },
  useSharedValue: (initial: number) => {
    const shared = { value: initial };
    mockShared.push(shared);
    return shared;
  },
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (to: number, _config: unknown, done?: (finished: boolean) => void) => {
    done?.(true);
    return to;
  },
  withSpring: (to: number) => to,
  runOnJS: (fn: () => void) => fn,
}));

function offset(): number {
  const shared = mockShared.at(-1);
  if (!shared) throw new Error("no shared value registered");
  return shared.value;
}

function swipe(...events: PanEvent[]) {
  if (!mockPanUpdate || !mockPanEnd) throw new Error("no pan gesture registered");
  for (const e of events.slice(0, -1)) mockPanUpdate(e);
  mockPanEnd(events.at(-1) as PanEvent);
}

const mockNavigate = jest.fn();
let mockPathname = "/";
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: mockNavigate }),
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
  mockShared.length = 0;
  playerStore.setState({
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
    playerStore.setState({
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
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("opens the playing meeting when tapped", async () => {
    playerStore.setState({ current: rec, status: "ready" });
    await render(<MiniPlayer />);
    await fireEvent.press(screen.getByTestId("mini-player"));
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: "/meeting/[id]",
      params: { id: rec.id },
    });
  });

  it("stops playback from the close button", async () => {
    playerStore.setState({ current: rec, status: "ready" });
    const stop = jest.spyOn(playback, "stop").mockImplementation(() => {});
    await render(<MiniPlayer />);
    await fireEvent.press(screen.getByLabelText("Close player"));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("follows the finger down and stops playback once the card is off-screen", async () => {
    playerStore.setState({ current: rec, status: "ready" });
    const stop = jest.spyOn(playback, "stop").mockImplementation(() => {});
    await render(<MiniPlayer />);
    mockPanUpdate?.({ translationY: 20, velocityY: 300 });
    expect(offset()).toBe(20);
    mockPanUpdate?.({ translationY: 80, velocityY: 600 });
    expect(offset()).toBe(80);
    mockPanEnd?.({ translationY: 120, velocityY: 900 });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("springs back and keeps playing after a short drag", async () => {
    playerStore.setState({ current: rec, status: "ready" });
    const stop = jest.spyOn(playback, "stop").mockImplementation(() => {});
    await render(<MiniPlayer />);
    swipe({ translationY: 10, velocityY: 50 }, { translationY: 20, velocityY: 60 });
    expect(stop).not.toHaveBeenCalled();
  });

  it("does not drag the card upward", async () => {
    playerStore.setState({ current: rec, status: "ready" });
    const stop = jest.spyOn(playback, "stop").mockImplementation(() => {});
    await render(<MiniPlayer />);
    swipe({ translationY: -120, velocityY: -900 }, { translationY: -120, velocityY: -900 });
    expect(offset()).toBe(0);
    expect(stop).not.toHaveBeenCalled();
    expect(screen.getByTestId("mini-player")).toBeOnTheScreen();
  });

  it("shows a spinner instead of play/pause while loading", async () => {
    playerStore.setState({ current: rec, status: "loading" });
    await render(<MiniPlayer />);
    expect(screen.queryByTestId("mini-play-pause")).toBeNull();
    expect(screen.getByTestId("mini-player")).toBeOnTheScreen();
  });

  it.each([
    ["/meeting/r1", false],
    ["/meeting/other", true],
    ["/search", true],
  ])("at %s the mini player is %s", async (path, shown) => {
    playerStore.setState({ current: rec, status: "ready" });
    mockPathname = path;
    await render(<MiniPlayer />);
    expect(screen.queryByTestId("mini-player") !== null).toBe(shown);
  });
});

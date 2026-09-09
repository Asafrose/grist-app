import { act, fireEvent, render, screen, waitFor } from "@/test/render";
import { PlayerView } from "@/components/player-view";
import { perf } from "@/lib/perf";
import { type NowPlaying, playback, playerReady, playerStore } from "@/lib/player";
import { videoViewPictureInPicture } from "@/test/mocks/expo-video";

jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-image", () => ({ Image: jest.requireActual("react-native").Image }));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));

const video: NowPlaying = {
  id: "r1",
  title: "Pricing review",
  mediaType: "video",
  thumbnailUrl: null,
  durationMs: 600_000,
};

beforeEach(async () => {
  await playerReady();
  playerStore.setState({ current: video, status: "ready" });
  videoViewPictureInPicture.mockClear();
});

describe("PlayerView", () => {
  it("attaches the video view on mount and detaches it on unmount", async () => {
    const view = await render(<PlayerView surface="card" />);
    expect(screen.getByTestId("video-view")).toBeOnTheScreen();
    await playback.startPictureInPicture();
    expect(videoViewPictureInPicture).toHaveBeenCalledTimes(1);

    await act(async () => view.unmount());
    await expect(playback.startPictureInPicture()).rejects.toThrow("not on screen");
  });

  it("detaches the video view when the recording is no longer video", async () => {
    await render(<PlayerView surface="card" />);
    await playback.startPictureInPicture();
    expect(videoViewPictureInPicture).toHaveBeenCalledTimes(1);

    await act(async () => {
      playerStore.setState({ current: { ...video, mediaType: "audio" } });
    });
    expect(screen.queryByTestId("video-view")).toBeNull();
    await expect(playback.startPictureInPicture()).rejects.toThrow("not on screen");
  });

  it("attaches nothing for audio", async () => {
    playerStore.setState({ current: { ...video, mediaType: "audio" } });
    await render(<PlayerView surface="card" />);
    expect(screen.queryByTestId("video-view")).toBeNull();
    await expect(playback.startPictureInPicture()).rejects.toThrow("not on screen");
  });
});

describe("PlayerView surface timing", () => {
  it("measures a pending fullscreen mark on the first rendered frame", async () => {
    perf.clear();
    await render(<PlayerView surface="card" />);
    perf.mark("fullscreen-exit-visible");
    await fireEvent(screen.getByTestId("video-view"), "firstFrameRender");
    expect(perf.recent()).toEqual([
      {
        label: "fullscreen dismiss → card surface rendered",
        ms: expect.any(Number),
        at: expect.any(Number),
      },
    ]);
    perf.clear();
  });

  it("stays silent when no transition is being timed", async () => {
    perf.clear();
    await render(<PlayerView surface="card" />);
    await fireEvent(screen.getByTestId("video-view"), "firstFrameRender");
    expect(perf.recent()).toEqual([]);
  });

  it("leaves the other surface's pending mark alone", async () => {
    perf.clear();
    await render(<PlayerView surface="card" />);
    perf.mark("fullscreen-enter-visible");
    await fireEvent(screen.getByTestId("video-view"), "firstFrameRender");
    expect(perf.recent()).toEqual([]);

    await render(<PlayerView surface="fullscreen" />);
    await fireEvent(screen.getAllByTestId("video-view")[0]!, "firstFrameRender");
    expect(perf.recent()).toEqual([
      {
        label: "fullscreen tap → fullscreen surface rendered",
        ms: expect.any(Number),
        at: expect.any(Number),
      },
    ]);
    perf.clear();
  });
});

describe("PlayerView poster", () => {
  it("covers the surface with the thumbnail until the video is ready", async () => {
    playerStore.setState({
      current: { ...video, thumbnailUrl: "https://thumb/1" },
      status: "loading",
    });
    await render(<PlayerView surface="card" />);
    expect(screen.getByTestId("player-poster")).toBeOnTheScreen();
    expect(screen.getByTestId("poster-image")).toHaveProp("source", "https://thumb/1");

    await act(async () => {
      playerStore.setState({ status: "ready" });
    });
    await waitFor(() => expect(screen.queryByTestId("player-poster")).toBeNull());
  });

  it("stays out of the way when a loaded source is swapped mid-playback", async () => {
    playerStore.setState({
      current: { ...video, thumbnailUrl: "https://thumb/1" },
      status: "ready",
      playing: true,
    });
    await render(<PlayerView surface="card" />);
    await waitFor(() => expect(screen.queryByTestId("player-poster")).toBeNull());

    await act(async () => {
      playerStore.setState({ status: "loading" });
    });
    expect(screen.queryByTestId("player-poster")).toBeNull();
  });

  it("comes back for the next recording", async () => {
    playerStore.setState({
      current: { ...video, thumbnailUrl: "https://thumb/1" },
      status: "ready",
    });
    await render(<PlayerView surface="card" />);
    await waitFor(() => expect(screen.queryByTestId("player-poster")).toBeNull());

    await act(async () => {
      playerStore.setState({
        current: { ...video, id: "r2", thumbnailUrl: "https://thumb/2" },
        status: "loading",
      });
    });
    expect(screen.getByTestId("poster-image")).toHaveProp("source", "https://thumb/2");
  });

  it("leaves the audio-only surface alone", async () => {
    playerStore.setState({
      current: { ...video, mediaType: "audio", thumbnailUrl: "https://thumb/1" },
      status: "loading",
    });
    await render(<PlayerView surface="card" />);
    expect(screen.queryByTestId("player-poster")).toBeNull();
  });
});

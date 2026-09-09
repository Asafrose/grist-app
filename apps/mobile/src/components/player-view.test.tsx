import { act, render, screen, waitFor } from "@/test/render";
import { PlayerView } from "@/components/player-view";
import { type NowPlaying, playback, playerStore } from "@/lib/player";
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

beforeEach(() => {
  playerStore.setState({ current: video, status: "ready" });
  videoViewPictureInPicture.mockClear();
});

describe("PlayerView", () => {
  it("attaches the video view on mount and detaches it on unmount", async () => {
    const view = await render(<PlayerView />);
    expect(screen.getByTestId("video-view")).toBeOnTheScreen();
    await playback.startPictureInPicture();
    expect(videoViewPictureInPicture).toHaveBeenCalledTimes(1);

    await act(async () => view.unmount());
    await expect(playback.startPictureInPicture()).rejects.toThrow("not on screen");
  });

  it("detaches the video view when the recording is no longer video", async () => {
    await render(<PlayerView />);
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
    await render(<PlayerView />);
    expect(screen.queryByTestId("video-view")).toBeNull();
    await expect(playback.startPictureInPicture()).rejects.toThrow("not on screen");
  });
});

describe("PlayerView poster", () => {
  it("covers the surface with the thumbnail until the video is ready", async () => {
    playerStore.setState({
      current: { ...video, thumbnailUrl: "https://thumb/1" },
      status: "loading",
    });
    await render(<PlayerView />);
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
    await render(<PlayerView />);
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
    await render(<PlayerView />);
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
    await render(<PlayerView />);
    expect(screen.queryByTestId("player-poster")).toBeNull();
  });
});

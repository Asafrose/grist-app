import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@/test/render";
import { playbackPositions, type RecordingDetail } from "@/lib/data";
import { library, libraryReady } from "@/lib/library";
import { playback, playerStore } from "@/lib/player";
import { settings } from "@/lib/settings";
import { PlayerCard } from "./player-card";

jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-image", () => ({ Image: jest.requireActual("react-native").Image }));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn(), useGrainClient: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const rec = {
  id: "r1",
  title: "Pricing review",
  mediaType: "video",
  thumbnailUrl: null,
  durationMs: 600_000,
} as RecordingDetail;

beforeEach(() => {
  jest.restoreAllMocks();
  settings.set("pictureInPicture", true);
  playerStore.setState({
    current: { ...rec },
    status: "ready",
    playing: false,
    position: 0,
    duration: 600,
    until: null,
    error: null,
  });
});

describe("PlayerCard picture in picture", () => {
  it("surfaces a rejected start", async () => {
    const pip = jest
      .spyOn(playback, "startPictureInPicture")
      .mockRejectedValue(new Error("not allowed"));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<PlayerCard rec={rec} />);
    await fireEvent.press(screen.getByTestId("pip"));
    expect(pip).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith("Picture in picture unavailable", "not allowed");
  });

  it("hides the button when the setting is off", async () => {
    settings.set("pictureInPicture", false);
    await render(<PlayerCard rec={rec} />);
    expect(screen.queryByTestId("pip")).toBeNull();
    expect(screen.getByTestId("player-fullscreen")).toBeOnTheScreen();
  });
});

describe("PlayerCard before playback", () => {
  beforeAll(async () => {
    await libraryReady;
  });

  beforeEach(() => {
    playbackPositions.clear(rec.id);
    playerStore.setState({
      current: null,
      status: "idle",
      playing: false,
      position: 0,
      duration: 0,
    });
  });

  it("shows the stored resume position and preloads the frame it will start from", async () => {
    const preload = jest.spyOn(playback, "preload").mockResolvedValue(undefined);
    playbackPositions.save(rec.id, 120);
    await render(<PlayerCard rec={rec} />);
    expect(screen.getByTestId("position")).toHaveTextContent("2:00");
    expect(preload).toHaveBeenCalledWith(expect.objectContaining({ id: rec.id }), 120);
  });

  it("preloads once per meeting, whatever the library does afterwards", async () => {
    const preload = jest.spyOn(playback, "preload").mockResolvedValue(undefined);
    playbackPositions.save(rec.id, 120);
    const view = await render(<PlayerCard rec={rec} />);
    expect(preload).toHaveBeenCalledTimes(1);

    // A sync hands the screen a fresh row and bumps the version the resume read follows.
    playback.stop();
    await act(async () => {
      library.touch();
      view.rerender(<PlayerCard rec={{ ...rec }} />);
    });
    expect(preload).toHaveBeenCalledTimes(1);
  });

  it("preloads nothing for an unplayed recording", async () => {
    const preload = jest.spyOn(playback, "preload").mockResolvedValue(undefined);
    await render(<PlayerCard rec={rec} />);
    expect(screen.getByTestId("position")).toHaveTextContent("0:00");
    expect(preload).toHaveBeenCalledWith(expect.objectContaining({ id: rec.id }), 0);
  });

  it("preloads nothing for an audio recording", async () => {
    const preload = jest.spyOn(playback, "preload").mockResolvedValue(undefined);
    playbackPositions.save(rec.id, 120);
    await render(<PlayerCard rec={{ ...rec, mediaType: "audio" } as RecordingDetail} />);
    expect(preload).not.toHaveBeenCalled();
  });

  it("loads paused when a seek starts an unloaded recording", async () => {
    jest.spyOn(playback, "preload").mockResolvedValue(undefined);
    const load = jest.spyOn(playback, "load").mockResolvedValue(undefined);
    await render(<PlayerCard rec={rec} />);
    await fireEvent.press(screen.getByTestId("seek-forward"));
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ id: rec.id }), {
      at: 10,
      autoplay: false,
    });
  });

  it("starts playback from the play button", async () => {
    jest.spyOn(playback, "preload").mockResolvedValue(undefined);
    const load = jest.spyOn(playback, "load").mockResolvedValue(undefined);
    await render(<PlayerCard rec={rec} />);
    await fireEvent.press(screen.getByTestId("player-start"));
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ id: rec.id }));
  });
});

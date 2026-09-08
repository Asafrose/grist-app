import { fireEvent, render, screen } from "@/test/render";
import type { RecordingDetail } from "@/lib/data";
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
  it("swallows a rejected start", async () => {
    const pip = jest
      .spyOn(playback, "startPictureInPicture")
      .mockRejectedValue(new Error("not allowed"));
    await render(<PlayerCard rec={rec} />);
    await fireEvent.press(screen.getByTestId("pip"));
    expect(pip).toHaveBeenCalledTimes(1);
  });

  it("hides the button when the setting is off", async () => {
    settings.set("pictureInPicture", false);
    await render(<PlayerCard rec={rec} />);
    expect(screen.queryByTestId("pip")).toBeNull();
    expect(screen.getByTestId("player-fullscreen")).toBeOnTheScreen();
  });
});

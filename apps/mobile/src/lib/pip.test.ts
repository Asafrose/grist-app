import { Alert } from "react-native";
import { startPictureInPicture } from "@/lib/pip";
import { playback } from "@/lib/player";

jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));

describe("startPictureInPicture", () => {
  it("starts picture in picture through the facade", async () => {
    const start = jest.spyOn(playback, "startPictureInPicture").mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await startPictureInPicture();
    expect(start).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it("surfaces the rejection reason", async () => {
    jest
      .spyOn(playback, "startPictureInPicture")
      .mockRejectedValue(new Error("The video is not on screen."));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await startPictureInPicture();
    expect(alert).toHaveBeenCalledWith(
      "Picture in picture unavailable",
      "The video is not on screen.",
    );
  });

  it("surfaces a non-error rejection", async () => {
    jest.spyOn(playback, "startPictureInPicture").mockRejectedValue("nope");
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await startPictureInPicture();
    expect(alert).toHaveBeenCalledWith("Picture in picture unavailable", "nope");
  });
});

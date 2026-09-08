import { Platform, Share } from "react-native";
import { shareLink } from "./share";

const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });

beforeEach(() => share.mockClear());

describe("shareLink", () => {
  it("passes the url and title to the iOS sheet", () => {
    shareLink("https://grain.com/highlight/abc", "The moment");
    expect(share).toHaveBeenCalledWith(
      { url: "https://grain.com/highlight/abc", message: "The moment" },
      { dialogTitle: "The moment" },
    );
  });

  it("puts the url in the message on Android", () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    try {
      shareLink("https://grain.com/highlight/abc", "The moment");
      expect(share).toHaveBeenCalledWith(
        { message: "https://grain.com/highlight/abc" },
        { dialogTitle: "The moment" },
      );
    } finally {
      Object.defineProperty(Platform, "OS", { value: os, configurable: true });
    }
  });

  it("swallows a dismissed or failed sheet", async () => {
    share.mockRejectedValueOnce(new Error("nope"));
    expect(() => shareLink("https://grain.com/highlight/abc", "The moment")).not.toThrow();
    await Promise.resolve();
  });
});

import { impactAsync, selectionAsync } from "expo-haptics";
import { Platform } from "react-native";
import { haptics } from "@/lib/haptics";

describe("haptics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = "ios";
  });

  it.each(["ios", "android"] as const)("taps both generators on %s", (os) => {
    Platform.OS = os;
    haptics.selection();
    haptics.light();
    expect(selectionAsync).toHaveBeenCalledTimes(1);
    expect(impactAsync).toHaveBeenCalledWith("light");
  });

  it("stays silent on web, where expo-haptics throws", () => {
    Platform.OS = "web";
    haptics.selection();
    haptics.light();
    expect(selectionAsync).not.toHaveBeenCalled();
    expect(impactAsync).not.toHaveBeenCalled();
  });
});

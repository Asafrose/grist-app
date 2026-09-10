import { act, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Platform } from "react-native";
import { authStore } from "@/lib/auth";

jest.mock("react-native-reanimated", () => require("@/test/mocks/reanimated"));
jest.mock("react-native-gesture-handler", () => require("@/test/mocks/gesture-handler"));

const platforms = ["ios", "android"] as const;

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

describe.each(platforms)("root layout on %s", (os) => {
  const original = Platform.OS;

  beforeEach(() => {
    setPlatform(os);
    authStore.setState({ status: "signed-out", token: null, rejected: null });
  });

  afterEach(() => {
    setPlatform(original);
  });

  it("mounts the providers and the sign-in screen without a React warning", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      renderRouter(
        {
          _layout: require("@/app/_layout").default,
          "sign-in": require("@/app/sign-in").default,
          index: () => null,
        },
        { initialUrl: "/sign-in" },
      );
    });

    await waitFor(() => expect(screen.getByTestId("token-input")).toBeOnTheScreen());
    await act(async () => {});

    expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([]);
    errors.mockRestore();
  });
});

import { GrainApiError } from "@grist/grain-api";
import { fireEvent, render, screen, waitFor } from "@/test/render";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { auth, useAuth } from "@/lib/auth";
import { makeClient } from "@/lib/grain";
import { SignIn } from "./index";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("expo-clipboard", () => ({
  getStringAsync: jest.fn(async () => "  grain_pat_from_clipboard  "),
}));
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(async () => ({ type: "cancel" })),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));

const list = jest.fn();
(makeClient as jest.Mock).mockImplementation(() => ({ recordings: { list } }));

beforeEach(() => {
  jest.clearAllMocks();
  (makeClient as jest.Mock).mockImplementation(() => ({ recordings: { list } }));
  useAuth.setState({ status: "signed-out", token: null });
});

describe("SignIn", () => {
  it("renders the token field, disabled continue, and the help card", async () => {
    await render(<SignIn />);
    expect(screen.getByText("Your meetings,\non your phone.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Personal access token")).toBeOnTheScreen();
    expect(screen.getByTestId("continue")).toBeDisabled();
    expect(screen.getByLabelText("Where do I get a token?")).toBeOnTheScreen();
    expect(
      screen.getByText("Stored in the device keychain. Only sent to api.grain.com."),
    ).toBeOnTheScreen();
  });

  it("shows an inline error when Grain rejects the token and does not sign in", async () => {
    list.mockRejectedValueOnce(new GrainApiError("unauthorized", 401, "unauthorized"));
    await render(<SignIn />);
    await fireEvent.changeText(screen.getByTestId("token-input"), "bad-token");
    await fireEvent.press(screen.getByTestId("continue"));

    expect(
      await screen.findByText("Grain didn't accept that token. Check it and try again."),
    ).toBeOnTheScreen();
    expect(makeClient).toHaveBeenCalledWith("bad-token");
    expect(useAuth.getState().status).toBe("signed-out");
  });

  it("distinguishes server errors from network failures", async () => {
    list.mockRejectedValueOnce(new GrainApiError("boom", 500));
    await render(<SignIn />);
    await fireEvent.changeText(screen.getByTestId("token-input"), "t");
    await fireEvent.press(screen.getByTestId("continue"));
    expect(
      await screen.findByText("Grain returned an error (500). Try again in a moment."),
    ).toBeOnTheScreen();

    list.mockRejectedValueOnce(new TypeError("Network request failed"));
    await fireEvent.changeText(screen.getByTestId("token-input"), "t2");
    await fireEvent.press(screen.getByTestId("continue"));
    expect(
      await screen.findByText("Couldn't reach Grain. Check your connection and try again."),
    ).toBeOnTheScreen();
  });

  it("validates with a list call, trims the token, and signs in on success", async () => {
    list.mockResolvedValueOnce({ recordings: [], cursor: null });
    const signIn = jest.spyOn(auth, "signIn");
    await render(<SignIn />);
    await fireEvent.changeText(screen.getByTestId("token-input"), "  grain_pat_ok  ");
    await fireEvent.press(screen.getByTestId("continue"));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith("grain_pat_ok"));
    expect(makeClient).toHaveBeenCalledWith("grain_pat_ok");
    expect(useAuth.getState()).toMatchObject({ status: "signed-in", token: "grain_pat_ok" });
  });

  it("pastes the clipboard into the field, trimmed", async () => {
    await render(<SignIn />);
    await fireEvent.press(screen.getByText("Paste"));
    await waitFor(() =>
      expect(screen.getByTestId("token-input").props.value).toBe("grain_pat_from_clipboard"),
    );
    expect(Clipboard.getStringAsync).toHaveBeenCalled();
    expect(screen.getByTestId("continue")).toBeEnabled();
  });

  it("opens Grain's personal API settings from the help card", async () => {
    await render(<SignIn />);
    await fireEvent.press(screen.getByLabelText("Where do I get a token?"));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      "https://grain.com/app/settings/account/integrations/personal_api",
    );
  });
});

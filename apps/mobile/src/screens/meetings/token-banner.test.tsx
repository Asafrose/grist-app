import { act, fireEvent, render, screen } from "@/test/render";
import { auth, authStore } from "@/lib/auth";
import { TokenBanner } from "./token-banner";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

const REJECTED = "Grain didn't accept that token. Check it and try again.";

beforeEach(() => {
  mockPush.mockClear();
  authStore.setState({ status: "signed-in", token: "pat", rejected: null });
});

describe("TokenBanner", () => {
  it("stays hidden while the token is accepted", async () => {
    await render(<TokenBanner />);
    expect(screen.queryByTestId("token-banner")).toBeNull();
  });

  it("shows the token error copy and routes to Settings to replace the token", async () => {
    await render(<TokenBanner />);
    await act(async () => auth.reject(REJECTED));
    expect(screen.getByTestId("token-banner")).toBeTruthy();
    expect(screen.getByText(REJECTED)).toBeTruthy();
    fireEvent.press(screen.getByTestId("token-banner-replace"));
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("dismisses without signing out", async () => {
    await render(<TokenBanner />);
    await act(async () => auth.reject(REJECTED));
    await act(async () => fireEvent.press(screen.getByTestId("token-banner-dismiss")));
    expect(screen.queryByTestId("token-banner")).toBeNull();
    expect(authStore.getState()).toMatchObject({ status: "signed-in", token: "pat" });
  });
});

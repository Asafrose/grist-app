import { GrainApiError } from "@grist/grain-api";
import * as WebBrowser from "expo-web-browser";
import { auth, authStore } from "@/lib/auth";
import { downloads } from "@/lib/data";
import { indexSize } from "@/lib/db";
import { filtersStore } from "@/lib/filters";
import { makeClient } from "@/lib/grain";
import { library, libraryReady, libraryStore } from "@/lib/library";
import { queryClient } from "@/lib/query";
import { getWorkspace } from "@/lib/workspace";
import { DEFAULT_SETTINGS, settingsStore } from "@/lib/settings";
import { fireEvent, render, screen, waitFor } from "@/test/render";
import { maskToken, Settings } from "./index";

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(async () => ({ type: "cancel" })),
}));
jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "CELLULAR" })),
}));
jest.mock("expo-file-system", () => require("@/test/mocks/expo-file-system"));
jest.mock("@/lib/grain", () => ({
  ...jest.requireActual("@/lib/grain"),
  makeClient: jest.fn(),
}));

const mockSizes = jest.requireMock("expo-file-system").mockSizes as Map<string, number>;

const list = jest.fn();
const iterate = jest.fn(async function* () {
  yield { cursor: null, recordings: [] };
});
const api = () => ({ recordings: { list, iterate, transcript: jest.fn(async () => []) } });
(makeClient as jest.Mock).mockImplementation(api);
queryClient.setDefaultOptions({ queries: { retry: false } });

async function signInDemo() {
  await libraryReady;
  authStore.setState({ status: "signed-in", token: "demo" });
  await library.refresh(true);
}

beforeEach(async () => {
  jest.clearAllMocks();
  (makeClient as jest.Mock).mockImplementation(api);
  settingsStore.setState(DEFAULT_SETTINGS);
  mockSizes.clear();
  downloads.clear();
  await signInDemo();
});

describe("Settings", () => {
  it("shows every section, the demo profile, live index size and the masked token", async () => {
    await render(<Settings />);
    for (const title of ["Playback", "Storage", "Account", "About"]) {
      expect(screen.getByText(title)).toBeOnTheScreen();
    }
    expect(await screen.findByText("Marcus Kowalski")).toBeOnTheScreen();
    expect(screen.getByText(/marcus\.kowalski@treyresearch\.example/)).toBeOnTheScreen();
    expect(screen.getByTestId("index-size")).toHaveTextContent("24 meetings · 0 B");
    expect(screen.getByTestId("downloads-size")).toHaveTextContent("0 meetings · 0 B");
    expect(screen.getByTestId("token-masked")).toHaveTextContent("demo••••");
    expect(screen.getByTestId("clear-downloads")).toBeDisabled();
    expect(screen.getByText("Open source · Not affiliated with Grain")).toBeOnTheScreen();
  });

  it("writes playback preferences to the settings store and the player", async () => {
    await render(<Settings />);
    await fireEvent(screen.getByTestId("setting-pip-switch"), "checkedChange", false);
    expect(settingsStore.getState().pictureInPicture).toBe(false);

    expect(screen.queryByTestId("setting-rate-option-1.5")).toBeNull();
    await fireEvent.press(screen.getByTestId("setting-rate"));
    await fireEvent.press(screen.getByTestId("setting-rate-option-1.5"));
    expect(screen.getByTestId("setting-rate-value")).toHaveTextContent("1.5×");
    expect(settingsStore.getState().playbackRate).toBe(1.5);
    expect(screen.queryByTestId("setting-rate-option-1.5")).toBeNull();
  });

  it("picks a default meetings view from Mine, Workspace and the teams", async () => {
    await render(<Settings />);
    expect(screen.getByText("Meetings")).toBeOnTheScreen();
    expect(screen.getByTestId("setting-default-view-value")).toHaveTextContent("Mine");
    await fireEvent.press(screen.getByTestId("setting-default-view"));
    const teams = getWorkspace(libraryStore.getState().db!).teams;
    expect(screen.getByTestId("setting-default-view-option-workspace")).toBeOnTheScreen();
    for (const t of teams) {
      expect(screen.getByTestId(`setting-default-view-option-team:${t.id}`)).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByTestId(`setting-default-view-option-team:${teams[1].id}`));
    expect(settingsStore.getState().defaultView).toEqual({ kind: "team", id: teams[1].id });
    expect(screen.getByTestId("setting-default-view-value")).toHaveTextContent(teams[1].name);
    expect(filtersStore.getState().view).toEqual({ kind: "team", id: teams[1].id });
  });

  it("changes the storage caps through pickers", async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByTestId("setting-keep"));
    await fireEvent.press(screen.getByTestId("setting-keep-option-90"));
    expect(screen.getByTestId("setting-keep-value")).toHaveTextContent("90 days");
    await fireEvent.press(screen.getByTestId("setting-cap"));
    await fireEvent.press(screen.getByTestId(`setting-cap-option-${5 * 1024 ** 3}`));
    expect(screen.getByTestId("setting-cap-value")).toHaveTextContent("5 GB");
    expect(settingsStore.getState()).toMatchObject({
      keepDownloadsDays: 90,
      downloadCapBytes: 5 * 1024 ** 3,
    });
  });

  it("picks the pre-buffer window, including off", async () => {
    await render(<Settings />);
    expect(screen.getByTestId("setting-prebuffer-value")).toHaveTextContent("1 day");
    await fireEvent.press(screen.getByTestId("setting-prebuffer"));
    await fireEvent.press(screen.getByTestId("setting-prebuffer-option-2"));
    expect(screen.getByTestId("setting-prebuffer-value")).toHaveTextContent("2 days");
    await fireEvent.press(screen.getByTestId("setting-prebuffer"));
    await fireEvent.press(screen.getByTestId("setting-prebuffer-option-0"));
    expect(screen.getByTestId("setting-prebuffer-value")).toHaveTextContent("Off");
    expect(settingsStore.getState().prebufferDays).toBe(0);
  });

  it("clears the transcript index and shows the size drop to zero", async () => {
    await render(<Settings />);
    const db = libraryStore.getState().db!;
    expect(indexSize(db).meetings).toBe(24);
    await fireEvent.press(screen.getByTestId("clear-index"));
    expect(indexSize(db)).toEqual({ meetings: 0, segments: 0 });
    await waitFor(() =>
      expect(screen.getByTestId("index-size")).toHaveTextContent("0 meetings · 0 B"),
    );
    expect(screen.getByTestId("clear-index")).toBeDisabled();
  });

  it("clears downloads and shows the size drop to zero", async () => {
    mockSizes.set("file:///docs/downloads/r1.mp4", 2048);
    downloads.hydrate();
    await render(<Settings />);
    expect(screen.getByTestId("downloads-size")).toHaveTextContent("1 meetings · 2.0 KB");
    expect(screen.getByTestId("clear-downloads")).not.toBeDisabled();
    await fireEvent.press(screen.getByTestId("clear-downloads"));
    await waitFor(() =>
      expect(screen.getByTestId("downloads-size")).toHaveTextContent("0 meetings · 0 B"),
    );
    expect(screen.getByTestId("clear-downloads")).toBeDisabled();
  });

  it("rejects a bad replacement token with the sign-in copy and keeps the session", async () => {
    list.mockRejectedValueOnce(new GrainApiError("unauthorized", 401));
    await render(<Settings />);
    await fireEvent.press(screen.getByTestId("token-row"));
    expect(screen.getByTestId("replace-token-save")).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("replace-token-input"), "bad-token");
    await fireEvent.press(screen.getByTestId("replace-token-save"));
    expect(
      await screen.findByText("Grain didn't accept that token. Check it and try again."),
    ).toBeOnTheScreen();
    expect(makeClient).toHaveBeenCalledWith("bad-token");
    expect(authStore.getState().token).toBe("demo");

    await fireEvent.press(screen.getByTestId("replace-token-cancel"));
    expect(screen.queryByTestId("replace-token-input")).toBeNull();
    expect(screen.getByTestId("token-masked")).toHaveTextContent("demo••••");
  });

  it("validates and signs in with a replacement token, then re-masks it", async () => {
    list.mockResolvedValueOnce({ recordings: [], cursor: null });
    const signIn = jest.spyOn(auth, "signIn");
    await render(<Settings />);
    await fireEvent.press(screen.getByTestId("token-row"));
    await fireEvent.changeText(screen.getByTestId("replace-token-input"), "  grain_pat_new_1  ");
    await fireEvent.press(screen.getByTestId("replace-token-save"));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("grain_pat_new_1"));
    expect(authStore.getState()).toMatchObject({ status: "signed-in", token: "grain_pat_new_1" });
    await waitFor(() => expect(screen.getByTestId("token-masked")).toHaveTextContent("grain_••••"));
    await waitFor(() => expect(queryClient.isFetching({ queryKey: ["library"] })).toBe(0));
  });

  it("opens the token row already expanded while the current token is rejected", async () => {
    auth.reject("Grain didn't accept that token. Check it and try again.");
    await render(<Settings />);
    expect(screen.getByTestId("token-rejected")).toHaveTextContent(
      "Grain didn't accept that token. Check it and try again.",
    );
    expect(screen.getByTestId("replace-token-input")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("token-row"));
    expect(screen.queryByTestId("replace-token-input")).toBeNull();
    auth.accept();
  });

  it("opens Grain settings and the source repo, and signs out", async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByTestId("open-grain-settings"));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      "https://grain.com/app/settings/account/integrations/personal_api",
    );
    await fireEvent.press(screen.getByTestId("open-source"));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      "https://github.com/Asafrose/better-grain",
    );
    await fireEvent.press(screen.getByTestId("sign-out"));
    await waitFor(() => expect(authStore.getState().status).toBe("signed-out"));
  });

  it("masks everything after the first six characters", () => {
    expect(maskToken("grain_pat_abcdef")).toBe("grain_••••");
    expect(maskToken("demo")).toBe("demo••••");
  });
});

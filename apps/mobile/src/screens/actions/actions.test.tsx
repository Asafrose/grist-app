import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Share } from "react-native";
import { authStore } from "@/lib/auth";
import { getRecording, getTranscript } from "@/lib/db";
import { seedDemo } from "@/lib/demo";
import { downloadsStore } from "@/lib/downloads";
import { makeClient, useGrainClient } from "@/lib/grain";
import { library, libraryReady, libraryStore } from "@/lib/library";
import { act, fireEvent, render, screen, waitFor } from "@/test/render";
import { Actions, transcriptToText } from "./index";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(async () => ({ type: "cancel" })),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
}));
jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "CELLULAR" })),
}));
jest.mock("expo-file-system", () => require("@/test/mocks/expo-file-system"));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn(), useGrainClient: jest.fn() }));

const iterate = jest.fn(async function* () {
  yield { cursor: null, recordings: [] };
});
const transcriptText = jest.fn(async () => "Alice: hello\nBob: hi");
const rename = jest.fn(async () => ({ success: true }));
const api = {
  recordings: { iterate, transcript: jest.fn(async () => []), transcriptText, rename },
};
const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });

const ID = "demo-0";
const rec = () => getRecording(libraryStore.getState().db!, ID)!;

async function signIn(token: "demo" | "pat") {
  await act(async () => {
    authStore.setState({ status: "signed-in", token });
    await new Promise((r) => setTimeout(r, 0));
    await library.refresh(true);
    if (token === "pat") seedDemo(libraryStore.getState().db!);
  });
  await waitFor(() => expect(getRecording(libraryStore.getState().db!, ID)).toBeTruthy());
}

beforeAll(async () => {
  await libraryReady;
  await signIn("demo");
});

beforeEach(() => {
  jest.clearAllMocks();
  downloadsStore.setState({ byId: {} });
  (makeClient as jest.Mock).mockImplementation(() => api);
  (useGrainClient as jest.Mock).mockImplementation(() => api);
});

describe("Actions sheet", () => {
  it("renders the meeting header and both groups of rows", async () => {
    await render(<Actions id={ID} />);
    expect(screen.getByText(rec().title)).toBeOnTheScreen();
    for (const id of [
      "action-share",
      "action-download",
      "action-tags",
      "action-copy-transcript",
      "action-rename",
      "action-grain-comments",
      "action-grain-playlist",
      "action-grain-viewers",
      "action-grain-integrations",
    ]) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
    expect(screen.getByText("In Grain")).toBeOnTheScreen();
    expect(screen.getByTestId("action-tags-sub")).toHaveTextContent(
      rec().tags.length ? rec().tags.join(", ") : "None yet",
    );
  });

  it("shares the recording url through the native share sheet", async () => {
    await render(<Actions id={ID} />);
    await fireEvent.press(screen.getByTestId("action-share"));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: rec().url }),
      expect.objectContaining({ dialogTitle: rec().title }),
    );
  });

  it("copies the plain-text transcript from the API", async () => {
    await signIn("pat");
    try {
      await render(<Actions id={ID} />);
      await fireEvent.press(screen.getByTestId("action-copy-transcript"));
      await waitFor(() =>
        expect(Clipboard.setStringAsync).toHaveBeenCalledWith("Alice: hello\nBob: hi"),
      );
      expect(transcriptText).toHaveBeenCalledWith(ID, "txt");
      expect(screen.getByTestId("action-copy-transcript-sub")).toHaveTextContent("Copied");
    } finally {
      await signIn("demo");
    }
  });

  it("copies the local transcript in demo mode and reports failures", async () => {
    await render(<Actions id={ID} />);
    await fireEvent.press(screen.getByTestId("action-copy-transcript"));
    const expected = transcriptToText(getTranscript(libraryStore.getState().db!, ID));
    expect(expected).toContain(":");
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expected));
    expect(transcriptText).not.toHaveBeenCalled();

    (Clipboard.setStringAsync as jest.Mock).mockRejectedValueOnce(new Error("nope"));
    await fireEvent.press(screen.getByTestId("action-copy-transcript"));
    await waitFor(() =>
      expect(screen.getByTestId("action-copy-transcript-sub")).toHaveTextContent(/retry/),
    );
  });

  it("renames inline, validating a non-empty title", async () => {
    const original = rec().title;
    await render(<Actions id={ID} />);
    expect(screen.queryByTestId("rename-input")).toBeNull();
    await fireEvent.press(screen.getByTestId("action-rename"));
    const input = screen.getByTestId("rename-input");
    expect(input.props.value).toBe(original);
    await fireEvent.changeText(input, "   ");
    expect(screen.getByTestId("rename-save")).toBeDisabled();
    await fireEvent.changeText(input, "  Renamed in the sheet ");
    await fireEvent.press(screen.getByTestId("rename-save"));
    await waitFor(() => expect(rec().title).toBe("Renamed in the sheet"));
    expect(rename).not.toHaveBeenCalled();
    expect(await screen.findByText("Renamed in the sheet")).toBeOnTheScreen();
    expect(screen.queryByTestId("rename-input")).toBeNull();
    await fireEvent.press(screen.getByTestId("action-rename"));
    await fireEvent.changeText(screen.getByTestId("rename-input"), original);
    await fireEvent.press(screen.getByTestId("rename-save"));
    await waitFor(() => expect(rec().title).toBe(original));
  });

  it("calls the API to rename with a real token and shows errors", async () => {
    await signIn("pat");
    try {
      rename.mockRejectedValueOnce(new Error("Grain said no"));
      await render(<Actions id={ID} />);
      await fireEvent.press(screen.getByTestId("action-rename"));
      await fireEvent.changeText(screen.getByTestId("rename-input"), "Will fail");
      await fireEvent.press(screen.getByTestId("rename-save"));
      expect(await screen.findByText("Grain said no")).toBeOnTheScreen();
      expect(rename).toHaveBeenCalledWith(ID, "Will fail");
      expect(screen.getByTestId("rename-input")).toBeOnTheScreen();
    } finally {
      await signIn("demo");
    }
  });

  it("shows download progress and toggles cancel and remove", async () => {
    await render(<Actions id={ID} />);
    expect(screen.getByTestId("action-download-sub")).toHaveTextContent(
      /plays without a connection/,
    );
    expect(screen.queryByTestId("download-progress")).toBeNull();
    await act(async () =>
      downloadsStore.setState({
        byId: { [ID]: { status: "downloading", progress: 0.4, uri: null, bytes: 4, error: null } },
      }),
    );
    expect(screen.getByTestId("action-download-sub")).toHaveTextContent("Downloading · 40%");
    expect(screen.getByTestId("download-progress")).toHaveStyle({ width: "40%" });
    await fireEvent.press(screen.getByTestId("action-download"));

    await act(async () =>
      downloadsStore.setState({
        byId: {
          [ID]: { status: "done", progress: 1, uri: "file:///x.mp4", bytes: 2048, error: null },
        },
      }),
    );
    expect(screen.getByTestId("action-download-sub")).toHaveTextContent(
      "Downloaded · 2.0 KB · tap to remove",
    );
    await fireEvent.press(screen.getByTestId("action-download"));
    expect(downloadsStore.getState().byId[ID]).toBeUndefined();

    await fireEvent.press(screen.getByTestId("action-download"));
    await waitFor(() => expect(downloadsStore.getState().byId[ID]?.status).toBe("done"));
  });

  it("opens the Grain web app for every In Grain row", async () => {
    await render(<Actions id={ID} />);
    for (const key of ["comments", "playlist", "viewers", "integrations"]) {
      await fireEvent.press(screen.getByTestId(`action-grain-${key}`));
    }
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(4);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(rec().url);
  });

  it("sends Tags to the Timeline tab of the meeting", async () => {
    await render(<Actions id={ID} />);
    await fireEvent.press(screen.getByTestId("action-tags"));
    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: "/meeting/[id]",
      params: { id: ID, tab: "timeline" },
    });
  });

  it("explains when the recording is unknown", async () => {
    await render(<Actions id="missing" />);
    expect(screen.getByText(/not in your library/)).toBeOnTheScreen();
  });
});

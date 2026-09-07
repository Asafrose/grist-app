import type { Recording } from "@grist/grain-api";
import detail from "@grist/grain-api/fixtures/recording.json";
import { fireEvent, render, screen, waitFor } from "@/test/render";
import { router } from "expo-router";
import { authStore } from "@/lib/auth";
import { getRecording, listRecordings, upsertRecordings } from "@/lib/db";
import { makeClient, useGrainClient } from "@/lib/grain";
import { library, libraryReady, libraryStore } from "@/lib/library";
import { playerStore } from "@/lib/player";
import { isoSeconds } from "@/lib/sync";
import { Meeting } from "./index";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("expo-video", () => ({
  createVideoPlayer: jest.fn(() => ({
    addListener: jest.fn(),
    replaceAsync: jest.fn(async () => {}),
    play: jest.fn(),
    pause: jest.fn(),
  })),
  VideoView: () => null,
  isPictureInPictureSupported: () => false,
}));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "CELLULAR" })),
}));
jest.mock("@/lib/db/open", () => ({
  openDb: jest.fn(async () => jest.requireActual("@/test/db").testDb()),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn(), useGrainClient: jest.fn() }));
jest.mock("expo-sqlite", () => ({ addDatabaseChangeListener: () => ({ remove() {} }) }));
jest.mock("expo-router", () => {
  const React = jest.requireActual("react");
  let params: Record<string, string> = {};
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  return {
    __setParams: (next: Record<string, string>) => {
      params = next;
      notify();
    },
    router: {
      setParams: jest.fn((next: Record<string, string>) => {
        params = { ...params, ...next };
        notify();
      }),
    },
    useLocalSearchParams: () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const l = () => force((x: number) => x + 1);
        listeners.add(l);
        return () => listeners.delete(l);
      }, []);
      return params;
    },
    Stack: { Screen: () => null },
  };
});

const { __setParams: setParams } = jest.requireMock("expo-router");
const fixture = detail as Recording;
const iterate = jest.fn(async function* () {
  yield { cursor: null, recordings: [] };
});
const transcript = jest.fn(async () => []);
const get = jest.fn(async () => ({ ...fixture, title: "Refreshed title" }));
const api = { recordings: { iterate, transcript, get } };

beforeEach(() => {
  jest.clearAllMocks();
  (makeClient as jest.Mock).mockImplementation(() => api);
  (useGrainClient as jest.Mock).mockImplementation(() => (authStore.getState().token ? api : null));
  setParams({});
});

describe("Meeting shell with a real token", () => {
  beforeAll(async () => {
    await libraryReady;
    authStore.setState({ status: "signed-in", token: "pat" });
    await library.refresh(true);
  });

  it("refreshes a stale recording in the background and re-renders the result", async () => {
    const db = libraryStore.getState().db!;
    upsertRecordings(db, [fixture], isoSeconds(Date.now() - 3_600_000));
    await render(<Meeting id={fixture.id} />);
    expect(await screen.findByText("Refreshed title")).toBeOnTheScreen();
    expect(get).toHaveBeenCalledWith(fixture.id, expect.objectContaining({ ai_summary: true }));
    expect(getRecording(db, fixture.id)?.title).toBe("Refreshed title");
  });

  it("leaves a fresh recording alone", async () => {
    const db = libraryStore.getState().db!;
    upsertRecordings(db, [fixture], isoSeconds(Date.now()));
    await render(<Meeting id={fixture.id} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(get).not.toHaveBeenCalled();
  });

  it("explains when the recording is not cached", async () => {
    await render(<Meeting id="missing" />);
    expect(screen.getByText(/not in your library yet/)).toBeOnTheScreen();
  });
});

describe("Meeting shell in demo mode", () => {
  beforeAll(async () => {
    await libraryReady;
    authStore.setState({ status: "signed-in", token: "demo" });
    await new Promise((r) => setTimeout(r, 0));
    await library.refresh(true);
    await waitFor(() =>
      expect(listRecordings(libraryStore.getState().db!).length).toBeGreaterThan(20),
    );
  });

  it("renders the pinned player, title, meta chips and tab strip without refreshing", async () => {
    const db = libraryStore.getState().db!;
    const rec = getRecording(db, "demo-0")!;
    await render(<Meeting id="demo-0" />);

    expect(screen.getByText(rec.title)).toBeOnTheScreen();
    expect(screen.getByTestId("player-start")).toBeOnTheScreen();
    expect(screen.getByTestId("position")).toHaveTextContent("0:00");
    expect(screen.getByText("External")).toBeOnTheScreen();
    expect(screen.getByText("Sales")).toBeOnTheScreen();
    expect(screen.getByText(/\+\d+$/)).toBeOnTheScreen();
    for (const t of ["summary", "transcript", "timeline", "clips"]) {
      expect(screen.getByTestId(`meeting-tab-${t}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId("meeting-tab-summary")).toBeSelected();
    expect(screen.getByText("Action items")).toBeOnTheScreen();
    await new Promise((r) => setTimeout(r, 0));
    expect(get).not.toHaveBeenCalled();
  });

  it("switches tabs through the URL and back", async () => {
    await render(<Meeting id="demo-0" />);
    await fireEvent.press(screen.getByTestId("meeting-tab-transcript"));
    expect(router.setParams).toHaveBeenCalledWith({ tab: "transcript" });
    expect(screen.getByTestId("transcript-tab")).toBeOnTheScreen();
    expect(screen.queryByText("Action items")).toBeNull();
    expect(screen.getByTestId("meeting-tab-transcript")).toBeSelected();
    expect(screen.getByTestId("meeting-tab-summary")).not.toBeSelected();

    await fireEvent.press(screen.getByTestId("meeting-tab-clips"));
    expect(screen.getByTestId("clips-empty")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("meeting-tab-summary"));
    expect(screen.getByText("Action items")).toBeOnTheScreen();
  });

  it("opens on the tab named in the URL", async () => {
    setParams({ tab: "timeline" });
    await render(<Meeting id="demo-0" />);
    expect(screen.getByText("Timeline coming soon")).toBeOnTheScreen();
  });

  it("a seek chip loads the recording at that position and shows it in the transport", async () => {
    await render(<Meeting id="demo-0" />);
    await fireEvent.press(screen.getAllByTestId("ts-88000")[0]);
    await waitFor(() => expect(playerStore.getState().current?.id).toBe("demo-0"));
    expect(playerStore.getState().position).toBe(88);
    await waitFor(() => expect(screen.queryByTestId("player-start")).toBeNull());
    expect(screen.getByTestId("position")).toHaveTextContent("1:28");
  });

  it("seeks to the t param on open", async () => {
    setParams({ t: "125" });
    await render(<Meeting id="demo-1" />);
    await waitFor(() => expect(playerStore.getState().current?.id).toBe("demo-1"));
    expect(playerStore.getState().position).toBe(125);
    expect(screen.getByTestId("position")).toHaveTextContent("2:05");
  });

  it("shows an audio-only surface without a video view", async () => {
    const db = libraryStore.getState().db!;
    const audio = listRecordings(db).find((r) => r.mediaType === "audio")!;
    await render(<Meeting id={audio.id} />);
    expect(screen.getByText("Audio only")).toBeOnTheScreen();
    expect(screen.getByTestId("player-start")).toBeOnTheScreen();
  });

  it("hides the transport for transcript-only recordings", async () => {
    const db = libraryStore.getState().db!;
    upsertRecordings(
      db,
      [{ ...fixture, id: "transcript-only", media_type: "transcript" }],
      isoSeconds(Date.now()),
    );
    await render(<Meeting id="transcript-only" />);
    expect(screen.getByText("Transcript only")).toBeOnTheScreen();
    expect(screen.queryByTestId("player-start")).toBeNull();
    expect(screen.queryByTestId("position")).toBeNull();
    const before = playerStore.getState().current?.id;
    await fireEvent.press(screen.getAllByTestId("ts-88000")[0]);
    expect(playerStore.getState().current?.id).toBe(before);
  });
});

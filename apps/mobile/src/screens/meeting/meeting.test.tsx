import type { Recording } from "@grist/grain-api";
import detail from "@grist/grain-api/fixtures/recording.json";
import { act, fireEvent, render, screen, waitFor } from "@/test/render";
import { router } from "expo-router";
import { authStore } from "@/lib/auth";
import { getRecording, getRecordingOpen, listRecordings, upsertRecordings } from "@/lib/db";
import { makeClient, useGrainClient } from "@/lib/grain";
import { library, libraryReady, libraryStore } from "@/lib/library";
import { haptics } from "@/lib/haptics";
import { deepLinks, seekKey } from "@/lib/deep-links";
import { meetingLayout, meetingLayoutStore } from "@/lib/meeting-layout";
import { playback, playerStore } from "@/lib/player";
import { isoSeconds } from "@/lib/sync";
import { Meeting } from "./index";

jest.mock("@/lib/haptics", () => ({ haptics: { selection: jest.fn(), light: jest.fn() } }));
jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("react-native-reanimated", () => require("@/test/mocks/reanimated"));
jest.mock("react-native-gesture-handler", () => require("@/test/mocks/gesture-handler"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "CELLULAR" })),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn(), useGrainClient: jest.fn() }));
jest.mock("expo-router", () => {
  const React = jest.requireActual("react");
  let params: Record<string, string> = {};
  let routeKey = "meeting-1";
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  return {
    __setRouteKey: (next: string) => {
      routeKey = next;
    },
    useRoute: () => ({ key: routeKey }),
    __setParams: (next: Record<string, string>) => {
      params = next;
      notify();
    },
    router: {
      setParams: jest.fn((next: Record<string, string>) => {
        params = { ...params, ...next };
        notify();
      }),
      push: jest.fn(),
    },
    useRouter: () => jest.requireMock("expo-router").router,
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

const { __setParams: setParams, __setRouteKey: setRouteKey } = jest.requireMock("expo-router");
const fixture = detail as Recording;
const iterate = jest.fn(async function* () {
  yield { cursor: null, recordings: [] };
});
const transcript = jest.fn(async () => []);
const get = jest.fn(async () => ({ ...fixture, title: "Refreshed title" }));
const api = { recordings: { iterate, transcript, get } };

beforeEach(() => {
  jest.clearAllMocks();
  meetingLayout.reset();
  deepLinks.reset();
  setRouteKey("meeting-1");
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

  it("marks the recording opened on mount", async () => {
    const db = libraryStore.getState().db!;
    upsertRecordings(db, [{ ...fixture, id: "never-opened" }], isoSeconds(Date.now()));
    expect(getRecordingOpen(db, "never-opened")).toBeNull();
    await render(<Meeting id="never-opened" />);
    await waitFor(() => expect(getRecordingOpen(db, "never-opened")).not.toBeNull());
  });

  it("explains when the recording is not cached", async () => {
    await render(<Meeting id="missing" />);
    expect(screen.getByText(/not in your library yet/)).toBeOnTheScreen();
  });

  it("does not mark an uncached recording opened", async () => {
    const db = libraryStore.getState().db!;
    await render(<Meeting id="not-synced-yet" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(getRecordingOpen(db, "not-synced-yet")).toBeNull();
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
    expect(screen.getByTestId("timeline-tab")).toBeOnTheScreen();
    expect(screen.getByText("Talk time")).toBeOnTheScreen();
  });

  it("a seek chip loads the recording at that position and shows it in the transport", async () => {
    await render(<Meeting id="demo-0" />);
    await fireEvent.press(screen.getAllByTestId("ts-88000")[0]);
    await waitFor(() => expect(playerStore.getState().current?.id).toBe("demo-0"));
    expect(playerStore.getState().position).toBe(88);
    await waitFor(() => expect(screen.queryByTestId("player-start")).toBeNull());
    expect(screen.getByTestId("position")).toHaveTextContent("1:28");
  });

  it("picks a playback rate from the speed menu with a haptic tick", async () => {
    const setRate = jest.spyOn(playback, "setRate").mockImplementation(() => {});
    jest.mocked(haptics.selection).mockClear();
    await render(<Meeting id="demo-0" />);
    await fireEvent.press(screen.getByTestId("rate"));
    await fireEvent.press(screen.getByTestId("rate-1.5"));
    expect(setRate).toHaveBeenCalledWith(1.5);
    expect(haptics.selection).toHaveBeenCalledTimes(1);
  });

  it("seeks to the t param on open", async () => {
    setParams({ t: "125" });
    await render(<Meeting id="demo-1" />);
    await waitFor(() => expect(playerStore.getState().current?.id).toBe("demo-1"));
    expect(playerStore.getState().position).toBe(125);
    expect(screen.getByTestId("position")).toHaveTextContent("2:05");
  });

  it("consumes the t deep link so a remount of the same screen cannot replay it", async () => {
    const loadSpy = jest.spyOn(playback, "load").mockImplementation(async () => {});
    setParams({ t: "310" });
    await render(<Meeting id="demo-1" />);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "demo-1" }), { at: 310 });
    expect(deepLinks.consume(seekKey("meeting-1", 310))).toBe(false);
    loadSpy.mockRestore();
  });

  it("does not seek again on a remount of the screen that already played", async () => {
    const loadSpy = jest.spyOn(playback, "load").mockImplementation(async () => {});
    deepLinks.consume(seekKey("meeting-1", 310));
    setParams({ t: "310" });
    await render(<Meeting id="demo-1" />);
    expect(loadSpy).not.toHaveBeenCalled();
    loadSpy.mockRestore();
  });

  it("seeks again when the same t is pushed onto a new screen", async () => {
    const loadSpy = jest.spyOn(playback, "load").mockImplementation(async () => {});
    deepLinks.consume(seekKey("meeting-1", 310));
    setRouteKey("meeting-2");
    setParams({ t: "310" });
    await render(<Meeting id="demo-1" />);
    expect(loadSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "demo-1" }), { at: 310 });
    loadSpy.mockRestore();
  });

  it("seeks again when t names another position", async () => {
    const loadSpy = jest.spyOn(playback, "load").mockImplementation(async () => {});
    deepLinks.consume(seekKey("meeting-1", 310));
    setParams({ t: "420" });
    await render(<Meeting id="demo-1" />);
    expect(loadSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "demo-1" }), { at: 420 });
    loadSpy.mockRestore();
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

  const nowPlaying = (r: { id: string; title: string; durationMs: number }) => ({
    id: r.id,
    title: r.title,
    mediaType: "audio" as const,
    thumbnailUrl: null,
    durationMs: r.durationMs,
  });
  const summary = () => screen.getByTestId("summary-tab");
  const at = (y: number, contentHeight = 2400) => ({
    nativeEvent: {
      contentOffset: { y },
      contentSize: { height: contentHeight },
      layoutMeasurement: { height: 600 },
    },
  });
  const dragOn = async (
    list: () => ReturnType<typeof screen.getByTestId>,
    ...offsets: number[]
  ) => {
    await fireEvent(list(), "scrollBeginDrag", at(offsets[0]));
    for (const y of offsets) await fireEvent.scroll(list(), at(y));
    await fireEvent(list(), "scrollEndDrag", at(offsets.at(-1) as number));
  };
  const drag = (...offsets: number[]) => dragOn(summary, ...offsets);

  it("collapses the card when the reader drags up and restores it at the top", async () => {
    const view = await render(<Meeting id="demo-0" />);
    expect(screen.getByTestId("meeting-tabs")).toBeOnTheScreen();

    await drag(0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");
    expect(screen.getByTestId("meeting-tabs")).toBeOnTheScreen();
    expect(screen.queryByTestId("player-card")).toBeNull();
    expect(screen.getByTestId("player-card", { includeHiddenElements: true })).toBeTruthy();

    // Reading back up mid-list is not enough; the card only comes back at the top.
    await drag(400, 370, 340);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");
    await drag(340, 260, 180, 100);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await drag(100, 40, 0);
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
    expect(screen.getByTestId("player-card")).toBeOnTheScreen();

    view.unmount();
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("collapses from the transcript list, which calls onScroll itself", async () => {
    await act(async () => setParams({ tab: "transcript" }));
    await render(<Meeting id="demo-0" />);
    const list = screen.getByTestId("transcript-list");

    await dragOn(() => list, 0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await dragOn(() => list, 400, 260, 180);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await dragOn(() => list, 180, 60, 0);
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("ignores the momentum an animated scrollToIndex emits", async () => {
    await act(async () => setParams({ tab: "transcript" }));
    await render(<Meeting id="demo-0" />);
    const list = screen.getByTestId("transcript-list");

    await dragOn(() => list, 0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    // Searching jumps the list with an animated scrollToIndex, which emits momentum events
    // of its own on iOS.
    await fireEvent.changeText(screen.getByTestId("transcript-search"), "ingestion");
    await fireEvent(list, "momentumScrollBegin", at(400));
    await fireEvent.scroll(list, at(0));
    await fireEvent(list, "momentumScrollEnd", at(0));
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await dragOn(() => list, 400, 200, 0);
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("ignores the rubber band at the end of the content", async () => {
    await render(<Meeting id="demo-0" />);
    await drag(0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");
    // The list bounces past its end and springs back; neither is a reversal.
    await dragOn(summary, 1790, 1799, 1860, 1810, 1799);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");
  });

  it("ignores the momentum of a fling that stops short of the top", async () => {
    await render(<Meeting id="demo-0" />);
    await drag(0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await fireEvent(summary(), "momentumScrollBegin", at(400));
    for (const y of [300, 200, 120, 80]) await fireEvent.scroll(summary(), at(y));
    await fireEvent(summary(), "momentumScrollEnd", at(80));
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");
  });

  it("expands as a fling arrives inside the near-top band", async () => {
    await render(<Meeting id="demo-0" />);
    await drag(0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await fireEvent(summary(), "momentumScrollBegin", at(400));
    for (const y of [300, 200, 120, 44]) await fireEvent.scroll(summary(), at(y));
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("expands when the reader drags the list back to the top", async () => {
    await render(<Meeting id="demo-0" />);
    await drag(0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    // A landing at the top nobody scrolled to — transcript follow, or a clamp after a
    // layout change — is ignored.
    await fireEvent.scroll(summary(), at(0));
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await dragOn(summary, 400, 200, 0);
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("expands when a fling coasts to the top", async () => {
    await render(<Meeting id="demo-0" />);
    await drag(0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await fireEvent(summary(), "scrollBeginDrag", at(400));
    await fireEvent.scroll(summary(), at(360));
    await fireEvent(summary(), "scrollEndDrag", at(360));
    await fireEvent(summary(), "momentumScrollBegin", at(360));
    for (const y of [240, 120, 20]) await fireEvent.scroll(summary(), at(y));
    // The frame that lands at the top often arrives only with the momentum end.
    await fireEvent(summary(), "momentumScrollEnd", at(0));
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("stays collapsed when a fling stops short of the top", async () => {
    await render(<Meeting id="demo-0" />);
    await drag(0, 40, 120, 800);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await fireEvent(summary(), "momentumScrollBegin", at(800));
    for (const y of [600, 400, 300]) await fireEvent.scroll(summary(), at(y));
    await fireEvent(summary(), "momentumScrollEnd", at(300));
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");
  });

  it("ignores programmatic scrolling, such as the transcript following playback", async () => {
    await render(<Meeting id="demo-0" />);
    await fireEvent.scroll(summary(), at(400));
    await fireEvent.scroll(summary(), at(800));
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("expands the collapsed card when a timestamp starts playback", async () => {
    await render(<Meeting id="demo-0" />);
    await drag(0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await fireEvent.press(screen.getAllByTestId("ts-88000")[0]);
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  // A genuine transition to being the current recording: an audio recording is never
  // preloaded on mount, so it starts out not current whatever the player card does.
  it("expands the collapsed card when playback starts on this recording", async () => {
    const db = libraryStore.getState().db!;
    const audio = listRecordings(db).find((r) => r.mediaType === "audio")!;
    playerStore.setState({ current: null, playing: false, status: "idle" });
    await render(<Meeting id={audio.id} />);
    await drag(0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe(audio.id);

    // `load` publishes the recording paused, then the player reports it playing.
    await act(async () => playerStore.setState({ current: nowPlaying(audio), status: "ready" }));
    expect(meetingLayoutStore.getState().collapsedId).toBe(audio.id);

    await act(async () => playerStore.setState({ playing: true }));
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("stays collapsed while the recording sits loaded but paused", async () => {
    const db = libraryStore.getState().db!;
    const audio = listRecordings(db).find((r) => r.mediaType === "audio")!;
    playerStore.setState({ current: null, playing: false, status: "idle" });
    await render(<Meeting id={audio.id} />);
    await drag(0, 40, 120, 400);

    await act(async () => playerStore.setState({ current: nowPlaying(audio), status: "ready" }));
    expect(meetingLayoutStore.getState().collapsedId).toBe(audio.id);
  });

  // The player card claims the recording on mount to preload its resume frame, so the card
  // is showing when it becomes current. A later resume from the mini player is not a start.
  it("stays collapsed when playback resumes on a recording preloaded at mount", async () => {
    const db = libraryStore.getState().db!;
    const audio = listRecordings(db).find((r) => r.mediaType === "audio")!;
    playerStore.setState({ current: null, playing: false, status: "idle" });
    await render(<Meeting id={audio.id} />);
    await act(async () => playerStore.setState({ current: nowPlaying(audio), status: "ready" }));
    await drag(0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe(audio.id);

    await act(async () => playerStore.setState({ playing: true }));
    expect(meetingLayoutStore.getState().collapsedId).toBe(audio.id);
  });

  // The recording can already be current at mount, preloaded on its resume position.
  it("leaves the card collapsed when playback resumes from the mini player", async () => {
    const current = {
      id: "demo-0",
      title: "Demo",
      mediaType: "video" as const,
      thumbnailUrl: null,
      durationMs: 1000,
    };
    playerStore.setState({ current, playing: false, status: "ready" });
    await render(<Meeting id="demo-0" />);
    await drag(0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await act(async () => playerStore.setState({ playing: true }));
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");
  });

  it("reads the next drag from where the list actually sits after an expand", async () => {
    await render(<Meeting id="demo-0" />);
    await drag(0, 40, 400, 800);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    // Expand-on-play leaves the list at 800 with the card open.
    await fireEvent.press(screen.getAllByTestId("ts-88000")[0]);
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();

    await dragOn(summary, 800, 740, 670);
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();

    await dragOn(summary, 800, 860);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");
  });

  it("expands the collapsed card when a clip is tapped", async () => {
    const db = libraryStore.getState().db!;
    const withClips = listRecordings(db)
      .map((r) => getRecording(db, r.id))
      .find((r) => r && r.highlights.length > 0)!;
    await act(async () => setParams({ tab: "clips" }));
    await render(<Meeting id={withClips.id} />);

    const clips = screen.getByTestId("clips-tab");
    await dragOn(() => clips, 0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe(withClips.id);

    await fireEvent.press(screen.getByTestId(`clip-card-${withClips.highlights[0].id}`));
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("restores the card when the reader switches tabs", async () => {
    await render(<Meeting id="demo-0" />);
    await drag(0, 40, 120, 400);
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-0");

    await act(async () => setParams({ tab: "timeline" }));
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("leaves another meeting collapsed when this one unmounts", async () => {
    meetingLayout.setCollapsed("demo-1", true);
    const view = await render(<Meeting id="demo-0" />);
    view.unmount();
    expect(meetingLayoutStore.getState().collapsedId).toBe("demo-1");
  });
});

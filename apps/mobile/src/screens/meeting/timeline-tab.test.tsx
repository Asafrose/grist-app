import type { Recording, Transcript } from "@grist/grain-api";
import detail from "@grist/grain-api/fixtures/recording.json";
import transcript from "@grist/grain-api/fixtures/transcript.json";
import { fireEvent, render, screen, waitFor } from "@/test/render";
import { authStore } from "@/lib/auth";
import { useRecording } from "@/lib/data";
import { getRecording, setTranscript, upsertRecordings } from "@/lib/db";
import { useIsDemo } from "@/lib/demo";
import { useGrainClient } from "@/lib/grain";
import { library, libraryReady, libraryStore } from "@/lib/library";
import { isoSeconds } from "@/lib/sync";
import { TimelineTab } from "./timeline-tab";

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
jest.mock("@/lib/demo", () => ({
  ...jest.requireActual("@/lib/demo"),
  useIsDemo: jest.fn(() => false),
}));
jest.mock("expo-sqlite", () => ({ addDatabaseChangeListener: () => ({ remove() {} }) }));

const fixture = detail as Recording;
const addTag = jest.fn(async () => ({ success: true }));
const removeTag = jest.fn(async () => ({ success: true }));
const api = { recordings: { addTag, removeTag } };

const db = () => libraryStore.getState().db!;

function Harness({ id, onSeek }: { id: string; onSeek: (ms: number) => void }) {
  const rec = useRecording(id);
  return rec ? <TimelineTab rec={rec} onSeek={onSeek} /> : null;
}

async function seed(overrides: Partial<Recording> = {}, withTranscript = true) {
  upsertRecordings(db(), [{ ...fixture, ...overrides }], isoSeconds(Date.now()));
  const segments = withTranscript ? (transcript as Transcript) : [];
  setTranscript(db(), fixture.id, segments, isoSeconds(Date.now()));
  library.touch();
}

beforeAll(async () => {
  await libraryReady;
  authStore.setState({ status: "signed-in", token: "pat" });
});

beforeEach(() => {
  jest.clearAllMocks();
  (useGrainClient as jest.Mock).mockImplementation(() => api);
  (useIsDemo as jest.Mock).mockReturnValue(false);
});

describe("TimelineTab", () => {
  it("renders talk-time rows whose percentages sum to 100 with bars sized by segments", async () => {
    await seed();
    await render(<Harness id={fixture.id} onSeek={jest.fn()} />);

    expect(screen.getByText("Talk time")).toBeOnTheScreen();
    expect(
      screen.getByTestId("timeline-pct-3fc8e55c-3a31-44ca-aefc-8defefaf39a9"),
    ).toHaveTextContent("59% · 3m");
    expect(
      screen.getByTestId("timeline-pct-e33fb508-6ef6-4ccc-af24-0e102aeef822"),
    ).toHaveTextContent("29% · 2m");
    expect(
      screen.getByTestId("timeline-pct-2eee6e97-3970-4e63-a0cf-789156230671"),
    ).toHaveTextContent("12% · 39s");
    const pcts = screen
      .getAllByTestId(/^timeline-pct-/)
      .map((n) => Number.parseInt(n.props.children.join("").match(/^(\d+)%/)![1], 10));
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);

    const bar = screen.getByTestId("timeline-bar-e33fb508-6ef6-4ccc-af24-0e102aeef822");
    const first = screen.getByTestId("timeline-bar-e33fb508-6ef6-4ccc-af24-0e102aeef822-seg-4130");
    expect(bar).toContainElement(first);
    expect(first.props.style.left).toMatch(/^0\.156\d*%$/);
    expect(Number.parseFloat(first.props.style.width)).toBeCloseTo(3.16, 1);
    const widths = screen
      .getAllByTestId(/^timeline-bar-e33fb508-6ef6-4ccc-af24-0e102aeef822-seg-/)
      .map((n) => Number.parseFloat(n.props.style.width));
    expect(widths.length).toBeGreaterThan(1);
    expect(widths.every((w) => w >= 0.5)).toBe(true);
    expect(screen.queryByTestId("timeline-talk-empty")).toBeNull();
  });

  it("seeks when a talk-time or screenshare bar segment is tapped", async () => {
    await seed();
    const onSeek = jest.fn();
    await render(<Harness id={fixture.id} onSeek={onSeek} />);

    await fireEvent.press(
      screen.getByTestId("timeline-bar-e33fb508-6ef6-4ccc-af24-0e102aeef822-seg-4130"),
    );
    expect(onSeek).toHaveBeenLastCalledWith(4130);

    expect(screen.getByText("Screenshare")).toBeOnTheScreen();
    expect(screen.getByText("31 min")).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^timeline-bar-screenshare-seg-/)).toHaveLength(1);
    await fireEvent.press(screen.getByTestId("timeline-bar-screenshare-seg-393210"));
    expect(onSeek).toHaveBeenLastCalledWith(393_210);
    expect(onSeek).toHaveBeenCalledTimes(2);
  });

  it("lists participants with scope and role, and explains a missing transcript", async () => {
    await seed({ screenshares: [] }, false);
    await render(<Harness id={fixture.id} onSeek={jest.fn()} />);

    expect(screen.getByTestId("timeline-talk-empty")).toBeOnTheScreen();
    expect(screen.queryByText("Screenshare")).toBeNull();
    expect(screen.getByText("Participants · 4")).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^timeline-participant-/)).toHaveLength(4);
    expect(screen.getByText("acme.example · Attended")).toBeOnTheScreen();
    expect(screen.getByText("marcus.kowalski@treyresearch.example · Host")).toBeOnTheScreen();
    expect(screen.getAllByText("Internal")).toHaveLength(2);
    expect(screen.getAllByText("External")).toHaveLength(1);
    expect(screen.getByText("Tags")).toBeOnTheScreen();
  });

  it("adds a tag through the API and shows it once the row updates", async () => {
    await seed();
    await render(<Harness id={fixture.id} onSeek={jest.fn()} />);
    expect(screen.queryAllByTestId(/^timeline-tag-/)).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("timeline-add-tag"));
    const input = screen.getByTestId("timeline-tag-input");
    await fireEvent.changeText(input, "  Pilot ");
    await fireEvent(input, "submitEditing");

    expect(addTag).toHaveBeenCalledWith(fixture.id, "Pilot");
    expect(await screen.findByTestId("timeline-tag-Pilot")).toBeOnTheScreen();
    expect(getRecording(db(), fixture.id)?.tags).toEqual(["Pilot"]);
    expect(screen.getByTestId("timeline-add-tag")).toBeOnTheScreen();
  });

  it("removes a tag through the API, and skips the network in demo mode", async () => {
    await seed({ tags: ["pilot", "q3"] });
    await render(<Harness id={fixture.id} onSeek={jest.fn()} />);

    await fireEvent.press(screen.getByTestId("timeline-tag-q3"));
    expect(removeTag).toHaveBeenCalledWith(fixture.id, "q3");
    await waitFor(() => expect(screen.queryByTestId("timeline-tag-q3")).toBeNull());
    expect(getRecording(db(), fixture.id)?.tags).toEqual(["pilot"]);

    (useIsDemo as jest.Mock).mockReturnValue(true);
    await seed({ tags: ["pilot"] });
    await render(<Harness id={fixture.id} onSeek={jest.fn()} />);
    await fireEvent.press(screen.getByTestId("timeline-tag-pilot"));
    await waitFor(() => expect(screen.queryByTestId("timeline-tag-pilot")).toBeNull());
    expect(removeTag).toHaveBeenCalledTimes(1);
    expect(getRecording(db(), fixture.id)?.tags).toEqual([]);
  });

  it("keeps the tag and shows an error when the API rejects", async () => {
    addTag.mockRejectedValueOnce(new Error("boom"));
    await seed({ tags: [] });
    await render(<Harness id={fixture.id} onSeek={jest.fn()} />);
    await fireEvent.press(screen.getByTestId("timeline-add-tag"));
    await fireEvent.changeText(screen.getByTestId("timeline-tag-input"), "x");
    await fireEvent(screen.getByTestId("timeline-tag-input"), "submitEditing");
    expect(await screen.findByText(/Couldn't add "x"/)).toBeOnTheScreen();
    expect(getRecording(db(), fixture.id)?.tags).toEqual([]);
  });
});

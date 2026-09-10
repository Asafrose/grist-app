import type { Recording } from "@grist/grain-api";
import detail from "@grist/grain-api/fixtures/recording-with-highlights.json";
import * as WebBrowser from "expo-web-browser";
import { Share } from "react-native";
import { getRecording, type RecordingDetail, upsertRecordings } from "@/lib/db";
import { clipKey, deepLinks } from "@/lib/deep-links";
import { playback, playerStore } from "@/lib/player";
import { testDb } from "@/test/db";
import { act, fireEvent, render, screen } from "@/test/render";
import { ClipsTab } from "./clips-tab";

const params: { clip?: string } = {};
const route = { key: "meeting-1" };

jest.mock("react-native-reanimated", () => require("@/test/mocks/reanimated"));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => params, useRoute: () => route }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(async () => ({ type: "cancel" })),
}));
jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));

const NOW = "2026-09-06T10:00:00Z";
const base = detail as Recording;
const clip = base.highlights![0];

function load(overrides: Partial<Recording> = {}): RecordingDetail {
  const db = testDb();
  upsertRecordings(db, [{ ...base, ...overrides }], NOW);
  return getRecording(db, base.id)!;
}

const loadSpy = jest.spyOn(playback, "load").mockImplementation(async () => {});
const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });

beforeEach(() => {
  jest.clearAllMocks();
  delete params.clip;
  deepLinks.reset();
  route.key = "meeting-1";
  playerStore.setState({ current: null, position: 0, until: null });
});

describe("ClipsTab", () => {
  it("shares the clip's own Grain url from the card", async () => {
    await render(<ClipsTab rec={load()} onSeek={jest.fn()} />);
    expect(clip.url).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`share-clip-card-${clip.id}`));
    expect(share).toHaveBeenCalledWith(
      { url: clip.url, message: clip.text },
      { dialogTitle: clip.text },
    );
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("renders a card per highlight with duration, start time and speakers", async () => {
    await render(<ClipsTab rec={load()} onSeek={jest.fn()} />);
    const card = screen.getByTestId(`clip-card-${clip.id}`);
    expect(card).toBeOnTheScreen();
    expect(card).not.toBeSelected();
    expect(screen.getByText(clip.text)).toBeOnTheScreen();
    expect(screen.getByText("0:46")).toBeOnTheScreen();
    expect(screen.getByText("starts 31:04 · Ravi Peretz")).toBeOnTheScreen();
    expect(screen.queryByTestId("clips-empty")).toBeNull();
  });

  it("plays the clip range in the pinned player on tap and marks the card selected", async () => {
    const rec = load();
    await render(<ClipsTab rec={rec} onSeek={jest.fn()} />);
    await fireEvent.press(screen.getByTestId(`clip-card-${clip.id}`));
    expect(loadSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: rec.id, title: rec.title }),
      { at: 1864.356, until: 1910.443 },
    );
    expect(screen.getByTestId(`clip-card-${clip.id}`)).toBeSelected();
  });

  it("does not start playback for transcript-only recordings", async () => {
    await render(<ClipsTab rec={load({ media_type: "transcript" })} onSeek={jest.fn()} />);
    await fireEvent.press(screen.getByTestId(`clip-card-${clip.id}`));
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("preselects and plays the clip named by ?clip=", async () => {
    params.clip = clip.id;
    const rec = load();
    await render(<ClipsTab rec={rec} onSeek={jest.fn()} />);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).toHaveBeenCalledWith(expect.objectContaining({ id: rec.id }), {
      at: 1864.356,
      until: 1910.443,
    });
    expect(screen.getByTestId(`clip-card-${clip.id}`)).toBeSelected();
  });

  it("consumes the ?clip= deep link so a remount of the same screen cannot replay it", async () => {
    const rec = load();
    params.clip = clip.id;
    await render(<ClipsTab rec={rec} onSeek={jest.fn()} />);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(deepLinks.consume(clipKey("meeting-1", clip.id))).toBe(false);
  });

  it("does not play again on a remount of the screen that already played", async () => {
    const rec = load();
    deepLinks.consume(clipKey("meeting-1", clip.id));
    params.clip = clip.id;
    await render(<ClipsTab rec={rec} onSeek={jest.fn()} />);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("plays again when the same clip is pushed onto a new screen", async () => {
    const rec = load();
    deepLinks.consume(clipKey("meeting-1", clip.id));
    route.key = "meeting-2";
    params.clip = clip.id;
    await render(<ClipsTab rec={rec} onSeek={jest.fn()} />);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).toHaveBeenCalledWith(expect.objectContaining({ id: rec.id }), {
      at: 1864.356,
      until: 1910.443,
    });
  });

  it("plays again when the ?clip= names another clip", async () => {
    const rec = load();
    deepLinks.consume(clipKey("meeting-1", "already-played"));
    params.clip = clip.id;
    await render(<ClipsTab rec={rec} onSeek={jest.fn()} />);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores an unknown ?clip=", async () => {
    params.clip = "nope";
    await render(<ClipsTab rec={load()} onSeek={jest.fn()} />);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("shows clip progress only while the player is inside the clip range", async () => {
    const rec = load();
    await render(<ClipsTab rec={rec} onSeek={jest.fn()} />);
    expect(screen.queryByTestId("clip-progress")).toBeNull();

    await act(async () => {
      playerStore.setState({
        current: {
          id: rec.id,
          title: rec.title,
          mediaType: "video",
          thumbnailUrl: null,
          durationMs: 1,
        },
        position: 1870,
        until: 1910.443,
      });
    });
    expect(screen.getByTestId("clip-progress")).toBeOnTheScreen();

    await act(async () => playerStore.setState({ position: 1911, until: null }));
    expect(screen.queryByTestId("clip-progress")).toBeNull();
  });

  it("links to Grain below the list", async () => {
    const rec = load();
    await render(<ClipsTab rec={rec} onSeek={jest.fn()} />);
    await fireEvent.press(screen.getByTestId("clips-open-grain"));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(rec.url);
  });

  it("shows an empty state whose button opens the recording in Grain", async () => {
    const rec = load({ highlights: [] });
    await render(<ClipsTab rec={rec} onSeek={jest.fn()} />);
    expect(screen.getByTestId("clips-empty")).toBeOnTheScreen();
    expect(screen.getByText("No clips yet")).toBeOnTheScreen();
    expect(screen.queryByTestId(/^clip-card-/)).toBeNull();
    await fireEvent.press(screen.getByTestId("clips-open-grain"));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(rec.url);
    expect(rec.url).toContain("grain.com");
  });
});

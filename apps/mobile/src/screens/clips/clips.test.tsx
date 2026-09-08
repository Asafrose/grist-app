import { router } from "expo-router";
import { authStore } from "@/lib/auth";
import { highlightsQuery, listTeams, listRecordings } from "@/lib/db";
import { demoRecordings } from "@/lib/demo";
import { library, libraryReady, libraryStore } from "@/lib/library";
import { DEMO_ME, resolveMe } from "@/lib/me";
import { queryClient } from "@/lib/query";
import { fireEvent, render, screen, waitFor, within } from "@/test/render";
import { Clips, clipHref } from "./index";

jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", CELLULAR: "CELLULAR" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "CELLULAR" })),
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("drizzle-orm/expo-sqlite", () => ({
  useLiveQuery: (query: { all: () => unknown[] }, deps: unknown[]) => ({
    data: jest.requireActual("react").useMemo(() => query.all(), deps),
  }),
}));

const NOW = Date.parse("2026-09-06T10:00:00Z");

beforeAll(async () => {
  await libraryReady;
  authStore.setState({ status: "signed-in", token: "demo" });
  await library.refresh(true);
});

beforeEach(() => {
  queryClient.setDefaultOptions({ queries: { retry: false } });
  (router.push as jest.Mock).mockClear();
});

const db = () => libraryStore.getState().db!;

describe("Clips", () => {
  it("lists every workspace clip with title, date, creator, source meeting and duration", async () => {
    await render(<Clips />);
    const clips = highlightsQuery(db()).all();
    expect(clips.length).toBeGreaterThan(1);
    expect(screen.getByRole("heading", { name: "Clips" })).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^clip-/)).toHaveLength(clips.length);

    const first = clips[0];
    const card = within(screen.getByTestId(`clip-${first.highlight.id}`));
    expect(card.getByText(first.highlight.text)).toBeOnTheScreen();
    expect(
      card.getByText(new RegExp(`^[A-Z][a-z]{2} \\d{1,2} · ${first.recorders[0].name}$`)),
    ).toBeOnTheScreen();
    expect(card.getByText(first.recordingTitle)).toBeOnTheScreen();
    expect(card.getByText("0:46")).toBeOnTheScreen();
    const creators = new Set(clips.map((c) => c.recorders[0].name));
    expect(creators.size).toBeGreaterThan(1);
  });

  it("offers Workspace, Mine and one chip per team found in the library", async () => {
    await render(<Clips />);
    expect(screen.getByTestId("chip-workspace")).toBeSelected();
    expect(screen.getByTestId("chip-mine")).not.toBeSelected();
    const teams = listTeams(db());
    expect(teams.length).toBeGreaterThan(0);
    for (const t of teams) expect(screen.getByText(t.name)).toBeOnTheScreen();
  });

  it("Mine keeps only clips from meetings the signed-in user attended", async () => {
    await resolveMe(db(), "demo");
    await render(<Clips />);
    await waitFor(() => expect(screen.getByTestId("chip-mine")).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId("chip-mine"));
    expect(screen.getByTestId("chip-mine")).toBeSelected();

    const mine = highlightsQuery(db(), { participantEmail: DEMO_ME.email }).all();
    expect(mine.length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByTestId(/^clip-/)).toHaveLength(mine.length));
    const attended = new Set(
      listRecordings(db(), { participantEmail: DEMO_ME.email }).map((r) => r.id),
    );
    for (const c of mine) expect(attended.has(c.highlight.recordingId)).toBe(true);

    await fireEvent.press(screen.getByTestId("chip-workspace"));
    await waitFor(() =>
      expect(screen.getAllByTestId(/^clip-/)).toHaveLength(highlightsQuery(db()).all().length),
    );
  });

  it("filters by team", async () => {
    await render(<Clips />);
    const team = listTeams(db())[0];
    await fireEvent.press(screen.getByTestId(`chip-team-${team.id}`));
    const expected = highlightsQuery(db(), { teamId: team.id }).all();
    await waitFor(() => expect(screen.getAllByTestId(/^clip-/)).toHaveLength(expected.length));
  });

  it("opens the source meeting on its clips tab with the clip selected", async () => {
    await render(<Clips />);
    const first = highlightsQuery(db()).all()[0];
    await fireEvent.press(screen.getByTestId(`clip-${first.highlight.id}`));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/meeting/[id]",
      params: { id: first.highlight.recordingId, tab: "clips", clip: first.highlight.id },
    });
    expect(clipHref(first).params.clip).toBe(first.highlight.id);
  });

  it("shows an empty state for Mine when the user cannot be resolved", async () => {
    const seeded = demoRecordings(NOW);
    expect(seeded.some((r) => r.highlights?.length)).toBe(true);
    await library.clear();
    authStore.setState({ status: "signed-in", token: "pat" });
    await render(<Clips />);
    await waitFor(() => expect(screen.getByText("No clips yet")).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId("chip-mine"));
    await waitFor(() =>
      expect(screen.getByText("Couldn't tell which meetings are yours")).toBeOnTheScreen(),
    );
  });
});

import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@/test/render";
import { authStore } from "@/lib/auth";
import { countRecordings, listRecordings } from "@/lib/db";
import { formatDayLabel } from "@/lib/format";
import { DEMO_ME, meStore, resetMe, resolveMe } from "@/lib/me";
import { defaultFilters, filters, filtersStore } from "@/lib/filters";
import { library, libraryKey, libraryReady, libraryStore } from "@/lib/library";
import { queryClient } from "@/lib/query";
import { getWorkspace } from "@/lib/workspace";
import { Meetings } from "./index";

jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
}));
jest.mock("expo-image", () => ({ Image: jest.requireActual("react-native").Image }));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
var mockLive = { pending: false };
jest.mock("drizzle-orm/expo-sqlite", () => ({
  useLiveQuery: (query: { all: () => unknown[] }) =>
    mockLive.pending
      ? { data: undefined, updatedAt: undefined }
      : { data: query.all(), updatedAt: new Date() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

beforeAll(async () => {
  await libraryReady;
  authStore.setState({ status: "signed-in", token: "demo" });
  await library.refresh(true);
});

beforeEach(() => {
  mockLive.pending = false;
  mockPush.mockClear();
  filters.reset();
  libraryStore.setState({ offlineHint: false });
});

const db = () => libraryStore.getState().db!;
const refreshing = () => screen.getByTestId("meetings-list").props.refreshControl.props.refreshing;

describe("Meetings", () => {
  it("renders the cached list while the signed-in profile is still idle", async () => {
    resetMe();
    await render(<Meetings />);
    expect(screen.getByTestId("meetings-list")).toBeOnTheScreen();
    const all = listRecordings(db(), {});
    expect(screen.getByTestId(`meeting-${all[0].id}`)).toBeOnTheScreen();

    await act(async () => {
      await resolveMe(db(), "demo");
    });
    const mine = listRecordings(db(), { participantEmail: DEMO_ME.email });
    await waitFor(() => expect(screen.getByTestId(`meeting-${mine[0].id}`)).toBeOnTheScreen());
    const others = all.filter((r) => !mine.some((m) => m.id === r.id));
    expect(others.length).toBeGreaterThan(0);
    for (const r of others) expect(screen.queryByTestId(`meeting-${r.id}`)).toBeNull();
  });

  it("applies the participant filter on the very first render when me is cached", async () => {
    resetMe();
    meStore.setState({ me: DEMO_ME, status: "ready" });
    await render(<Meetings />);
    const mine = listRecordings(db(), { participantEmail: DEMO_ME.email });
    const others = listRecordings(db(), {}).filter((r) => !mine.some((m) => m.id === r.id));
    expect(others.length).toBeGreaterThan(0);
    expect(screen.getByTestId(`meeting-${mine[0].id}`)).toBeOnTheScreen();
    for (const r of others) expect(screen.queryByTestId(`meeting-${r.id}`)).toBeNull();
  });

  it("keeps the meetings on screen while the query key changes", async () => {
    await resolveMe(db(), "demo");
    await render(<Meetings />);
    const mine = listRecordings(db(), { participantEmail: DEMO_ME.email });
    expect(screen.getByTestId(`meeting-${mine[0].id}`)).toBeOnTheScreen();

    mockLive.pending = true;
    await act(async () => filters.setView({ kind: "workspace" }));
    expect(screen.getByTestId(`meeting-${mine[0].id}`)).toBeOnTheScreen();

    mockLive.pending = false;
    await act(async () => filters.setTitle("Roadmap"));
    await waitFor(() => expect(screen.getAllByText(/Roadmap/).length).toBeGreaterThan(0));
  });

  it("groups the signed-in user's meetings by day with row details", async () => {
    await resolveMe(db(), "demo");
    await render(<Meetings />);
    const mine = listRecordings(db(), { participantEmail: DEMO_ME.email });
    expect(mine.length).toBeGreaterThan(0);
    const labels = new Set(mine.map((r) => formatDayLabel(r.startDatetime).toUpperCase()));
    for (const label of labels) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByTestId(`meeting-${mine[0].id}`)).toBeOnTheScreen();
    if (mine.some((r) => r.externalCount > 0)) {
      expect(screen.getAllByText("External").length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(mine[0].recorders[0]!.name).length).toBeGreaterThan(0);
    expect(screen.getByTestId("view-mine")).toBeSelected();
    expect(screen.getByTestId(`view-team-${getWorkspace(db()).teams[0].id}`)).toBeOnTheScreen();
  });

  it("shows rows and a syncing indicator while the sync is still running", async () => {
    await resolveMe(db(), "demo");
    await render(<Meetings />);
    expect(screen.queryByTestId("syncing")).toBeNull();
    let finish!: () => void;
    const pending = queryClient.fetchQuery({
      queryKey: libraryKey("demo"),
      queryFn: () => new Promise<null>((resolve) => (finish = () => resolve(null))),
      staleTime: 0,
    });
    await waitFor(() => expect(screen.getByTestId("syncing")).toBeOnTheScreen());
    expect(screen.getByText("Syncing\u2026")).toBeOnTheScreen();
    expect(
      screen.getByTestId(
        `meeting-${listRecordings(db(), { participantEmail: DEMO_ME.email })[0].id}`,
      ),
    ).toBeOnTheScreen();
    await act(async () => {
      finish();
      await pending;
    });
    await waitFor(() => expect(screen.queryByTestId("syncing")).toBeNull());
  });

  it("leaves the refresh control alone while a background sync runs", async () => {
    await render(<Meetings />);
    let finish!: () => void;
    const pending = queryClient.fetchQuery({
      queryKey: libraryKey("demo"),
      queryFn: () => new Promise<null>((resolve) => (finish = () => resolve(null))),
      staleTime: 0,
    });
    await waitFor(() => expect(screen.getByTestId("syncing")).toBeOnTheScreen());
    expect(refreshing()).toBe(false);
    await act(async () => {
      finish();
      await pending;
    });
    expect(refreshing()).toBe(false);
  });

  it("stops the pull-to-refresh spinner while the query is paused offline", async () => {
    await render(<Meetings />);
    onlineManager.setOnline(false);
    try {
      await act(async () => {
        fireEvent(screen.getByTestId("meetings-list"), "refresh");
      });
      await waitFor(() => expect(refreshing()).toBe(false));
    } finally {
      await queryClient.cancelQueries({ queryKey: libraryKey("demo") });
      onlineManager.setOnline(true);
    }
    await waitFor(() => expect(screen.queryByTestId("syncing")).toBeNull());
    expect(refreshing()).toBe(false);
  });

  it("shows the offline hint after an offline pull and drops it on the next sync", async () => {
    await render(<Meetings />);
    expect(screen.queryByTestId("offline-hint")).toBeNull();
    onlineManager.setOnline(false);
    try {
      await act(async () => {
        fireEvent(screen.getByTestId("meetings-list"), "refresh");
      });
    } finally {
      onlineManager.setOnline(true);
    }
    await waitFor(() =>
      expect(screen.getByTestId("offline-hint")).toHaveTextContent(
        "Offline. Showing saved meetings.",
      ),
    );
    await act(async () => {
      await library.refresh(true);
    });
    await waitFor(() => expect(screen.queryByTestId("offline-hint")).toBeNull());
  });

  it("leaves no stuck pull behind when a background sync follows an offline pull", async () => {
    await render(<Meetings />);
    onlineManager.setOnline(false);
    try {
      await act(async () => {
        fireEvent(screen.getByTestId("meetings-list"), "refresh");
      });
      expect(refreshing()).toBe(false);
    } finally {
      onlineManager.setOnline(true);
    }
    let finish!: () => void;
    const pending = queryClient.fetchQuery({
      queryKey: libraryKey("demo"),
      queryFn: () => new Promise<null>((resolve) => (finish = () => resolve(null))),
      staleTime: 0,
    });
    await waitFor(() => expect(screen.getByTestId("syncing")).toBeOnTheScreen());
    expect(refreshing()).toBe(false);
    await act(async () => {
      finish();
      await pending;
    });
  });

  it("narrows the list as the title filter is typed and clears it again", async () => {
    await render(<Meetings />);
    await fireEvent.changeText(screen.getByTestId("title-filter"), "Fabrikam");
    expect(filtersStore.getState().title).toBe("Fabrikam");
    await waitFor(() => expect(screen.queryAllByText(/Relecloud/).length).toBe(0));
    expect(screen.getAllByText(/Fabrikam/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId("title-filter-clear"));
    expect(filtersStore.getState().title).toBe("");
    await fireEvent.changeText(screen.getByTestId("title-filter"), "zzzz-nothing");
    expect(await screen.findByText("No meetings match")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("reset-filters"));
    expect(filtersStore.getState()).toEqual(defaultFilters);
  });

  it("keeps the list untouched until the title debounce window elapses", async () => {
    await render(<Meetings />);
    expect(screen.queryAllByText(/Relecloud/).length).toBeGreaterThan(0);
    await fireEvent.changeText(screen.getByTestId("title-filter"), "Fabrikam");
    expect(screen.getByTestId("title-filter").props.value).toBe("Fabrikam");
    expect(screen.queryAllByText(/Relecloud/).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryAllByText(/Relecloud/).length).toBe(0));
  });

  it("switches between Mine, Workspace and team views", async () => {
    await render(<Meetings />);
    await fireEvent.press(screen.getByTestId("view-workspace"));
    expect(filtersStore.getState().view).toEqual({ kind: "workspace" });
    expect(screen.getByTestId("view-workspace")).toBeSelected();
    const shared = listRecordings(db(), { workspace: true });
    await waitFor(() => expect(screen.getByTestId(`meeting-${shared[0].id}`)).toBeOnTheScreen());
    const team = getWorkspace(db()).teams[0];
    await fireEvent.press(screen.getByTestId(`view-team-${team.id}`));
    expect(filtersStore.getState().view).toEqual({ kind: "team", id: team.id });
  });

  it("collapses the extra team chips into a picker chip", async () => {
    await render(<Meetings />);
    const teams = getWorkspace(db()).teams;
    expect(teams.length).toBeGreaterThan(4);
    expect(screen.getByText(`+${teams.length - 1}`)).toBeOnTheScreen();
    for (const t of teams.slice(0, 1)) {
      expect(screen.getByTestId(`view-team-${t.id}`)).toBeOnTheScreen();
    }
    for (const t of teams.slice(1)) {
      expect(screen.queryByTestId(`view-team-${t.id}`)).toBeNull();
    }
    await fireEvent.press(screen.getByTestId("view-more"));
    expect(mockPush).toHaveBeenCalledWith("/view-picker");

    const hidden = teams[teams.length - 1];
    await act(async () => filters.setView({ kind: "team", id: hidden.id }));
    expect(await screen.findByTestId(`view-team-${hidden.id}`)).toBeSelected();
    expect(screen.getByText(`+${teams.length - 1}`)).toBeOnTheScreen();
  });

  it("shows active filter chips that open the Filters sheet", async () => {
    await render(<Meetings />);
    expect(screen.queryByTestId("active-scope")).toBeNull();
    act(() => filters.apply({ ...defaultFilters, scope: "external", date: { preset: "30d" } }));
    expect(await screen.findByTestId("active-scope")).toBeOnTheScreen();
    expect(screen.getByText("Last 30 days")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("active-scope"));
    expect(mockPush).toHaveBeenCalledWith("/filters");
    await fireEvent.press(screen.getByTestId("open-filters"));
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(
      countRecordings(db(), { scope: "external", participantEmail: DEMO_ME.email }),
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("External").length).toBeGreaterThan(1);
    expect(screen.queryByText("Internal")).toBeNull();
  });
});

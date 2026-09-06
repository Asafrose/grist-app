import { act, fireEvent, render, screen, waitFor } from "@/test/render";
import { useAuth } from "@/lib/auth";
import { countRecordings, listRecordings } from "@/lib/db";
import { formatDayLabel } from "@/lib/format";
import { defaultFilters, filters, useFilters } from "@/lib/filters";
import { library, libraryReady, useLibrary } from "@/lib/library";
import { getWorkspace } from "@/lib/workspace";
import { Meetings } from "./index";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("expo-video", () => ({
  createVideoPlayer: jest.fn(() => ({ addListener: jest.fn(), replaceAsync: jest.fn() })),
}));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
}));
jest.mock("expo-image", () => ({ Image: jest.requireActual("react-native").Image }));
jest.mock("@/lib/db/open", () => ({
  openDb: jest.fn(async () => jest.requireActual("@/test/db").testDb()),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("drizzle-orm/expo-sqlite", () => ({
  useLiveQuery: (query: { all: () => unknown[] }) => ({ data: query.all(), updatedAt: new Date() }),
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

beforeAll(async () => {
  await libraryReady;
  useAuth.setState({ status: "signed-in", token: "demo" });
  await library.refresh(true);
});

beforeEach(() => {
  mockPush.mockClear();
  filters.reset();
});

const db = () => useLibrary.getState().db!;

describe("Meetings", () => {
  it("groups the signed-in recorder's meetings by day with row details", async () => {
    await render(<Meetings />);
    const me = getWorkspace(db()).meId!;
    const mine = listRecordings(db(), { recorderId: me });
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

  it("narrows the list as the title filter is typed and clears it again", async () => {
    await render(<Meetings />);
    await fireEvent.changeText(screen.getByTestId("title-filter"), "Fabrikam");
    expect(useFilters.getState().title).toBe("Fabrikam");
    await waitFor(() => expect(screen.queryAllByText(/Relecloud/).length).toBe(0));
    expect(screen.getAllByText(/Fabrikam/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId("title-filter-clear"));
    expect(useFilters.getState().title).toBe("");
    await fireEvent.changeText(screen.getByTestId("title-filter"), "zzzz-nothing");
    expect(await screen.findByText("No meetings match")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("reset-filters"));
    expect(useFilters.getState()).toEqual(defaultFilters);
  });

  it("switches between Mine, Workspace and team views", async () => {
    await render(<Meetings />);
    await fireEvent.press(screen.getByTestId("view-workspace"));
    expect(useFilters.getState().view).toEqual({ kind: "workspace" });
    expect(screen.getByTestId("view-workspace")).toBeSelected();
    const shared = listRecordings(db(), { workspace: true });
    await waitFor(() => expect(screen.getByTestId(`meeting-${shared[0].id}`)).toBeOnTheScreen());
    const team = getWorkspace(db()).teams[0];
    await fireEvent.press(screen.getByTestId(`view-team-${team.id}`));
    expect(useFilters.getState().view).toEqual({ kind: "team", id: team.id });
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
      countRecordings(db(), { scope: "external", recorderId: getWorkspace(db()).meId! }),
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("External").length).toBeGreaterThan(1);
    expect(screen.queryByText("Internal")).toBeNull();
  });
});

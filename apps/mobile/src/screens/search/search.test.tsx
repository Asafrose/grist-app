import { fireEvent, render, screen, waitFor, within } from "@/test/render";
import { clearRecentSearches, getRecentSearches } from "@/lib/recent-searches";
import { libraryStore } from "@/lib/library";
import { Search } from "./index";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@shopify/flash-list", () => ({
  FlashList: jest.requireActual("react-native").FlatList,
}));
jest.mock("@/lib/library", () => {
  const { create } = jest.requireActual("zustand");
  const { testDb } = jest.requireActual("@/test/db");
  const { seedDemo } = jest.requireActual("@/lib/demo");
  const db = testDb();
  seedDemo(db);
  const store = create(() => ({ db, version: 0 }));
  return {
    libraryStore: store,
    useDb: () => db,
    useLibraryVersion: () => store((s: { version: number }) => s.version),
    library: {
      touch: () => store.setState((s: { version: number }) => ({ version: s.version + 1 })),
    },
  };
});

const type = async (text: string) => {
  await fireEvent.changeText(screen.getByTestId("search-input"), text);
};

beforeEach(() => {
  mockPush.mockClear();
  clearRecentSearches(libraryStore.getState().db!);
});

describe("Search", () => {
  it("shows the empty hint, the segments and the indexed count with no query", async () => {
    await render(<Search />);
    expect(screen.getByTestId("search-empty")).toBeOnTheScreen();
    expect(screen.getByTestId("index-stats")).toHaveTextContent(
      /^24 of 24 meetings indexed on this device$/,
    );
    expect(screen.getByTestId("segment-titles")).toBeSelected();
    expect(screen.queryByTestId("search-cancel")).toBeNull();
    expect(screen.queryByTestId("search-results")).toBeNull();
  });

  it("filters titles after the debounce and shows the match count", async () => {
    await render(<Search />);
    await type("pricing");
    expect(screen.queryByText(/Pricing review/)).toBeNull();
    const rows = await screen.findAllByText(/Pricing review/);
    expect(rows).toHaveLength(3);
    expect(screen.getAllByTestId(/^result-recording-demo-/)).toHaveLength(3);
    expect(screen.getByTestId("index-stats")).toHaveTextContent(/· \d+ matches$/);
    expect(screen.getByTestId("search-cancel")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("result-recording-demo-0"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/meeting/[id]", params: { id: "demo-0" } });
  });

  it("searches transcripts grouped by meeting and opens the matched segment", async () => {
    await render(<Search />);
    await type("pricing");
    await fireEvent.press(screen.getByTestId("segment-transcripts"));
    const hit = await screen.findByTestId("result-hit-demo-0-0");
    expect(hit).toHaveTextContent(/Marcus Kowalski:/);
    expect(hit).toHaveTextContent(/because we do not price…/);
    expect(hit).toHaveTextContent(/0:04/);
    expect(within(hit).getByText("price").props.className).toContain("font-jakarta-bold");
    expect(screen.getAllByTestId(/^result-recording-demo-/).length).toBeGreaterThan(1);
    expect(screen.getByTestId("index-stats")).toHaveTextContent(/· \d+ matches$/);

    await fireEvent.press(hit);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/meeting/[id]",
      params: { id: "demo-0", tab: "transcript", t: "4130" },
    });
  });

  it("searches clips and opens the meeting's clips tab at the highlight", async () => {
    await render(<Search />);
    await fireEvent.press(screen.getByTestId("segment-clips"));
    await type("endpoint");
    const clips = await screen.findAllByTestId(/^result-clip-/);
    expect(clips.length).toBeGreaterThan(0);
    expect(clips[0]).toHaveTextContent(/endpoint visibility/);

    await fireEvent.press(clips[0]);
    const call = mockPush.mock.calls[0][0];
    expect(call.pathname).toBe("/meeting/[id]");
    expect(call.params.tab).toBe("clips");
    expect(call.params.clip).toMatch(/^demo-\d+-/);
    expect(call.params.id).toMatch(/^demo-\d+$/);
  });

  it("shows a no-results state per segment", async () => {
    await render(<Search />);
    await type("zzzzqq");
    expect(await screen.findByText("No titles for “zzzzqq”")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("segment-clips"));
    expect(await screen.findByText("No clips for “zzzzqq”")).toBeOnTheScreen();
    expect(screen.getByTestId("index-stats")).toHaveTextContent(/· 0 matches$/);
  });

  it("remembers submitted and opened searches, restores and clears them", async () => {
    await render(<Search />);
    await type("onboarding");
    await fireEvent(screen.getByTestId("search-input"), "submitEditing");
    expect(getRecentSearches(libraryStore.getState().db!)).toEqual(["onboarding"]);

    await fireEvent.press(screen.getByTestId("search-cancel"));
    expect(screen.getByTestId("search-input").props.value).toBe("");
    expect(screen.getByTestId("recent-searches")).toBeOnTheScreen();
    expect(screen.getByText("onboarding")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("recent-0"));
    expect(screen.getByTestId("search-input").props.value).toBe("onboarding");
    await waitFor(() => expect(screen.getAllByText(/Onboarding call/).length).toBeGreaterThan(0));

    await fireEvent.press(screen.getByTestId("search-clear"));
    await fireEvent.press(screen.getByTestId("clear-recent"));
    expect(getRecentSearches(libraryStore.getState().db!)).toEqual([]);
    expect(screen.getByTestId("search-empty")).toBeOnTheScreen();
  });
});

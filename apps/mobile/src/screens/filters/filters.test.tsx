import { fireEvent, render, screen, within } from "@/test/render";
import { authStore } from "@/lib/auth";
import { countRecordings, participantOptions, recorderOptions } from "@/lib/db";
import { defaultFilters, filters, sheetFilters, filtersStore } from "@/lib/filters";
import { library, libraryReady, libraryStore } from "@/lib/library";
import { DEMO_ME, resolveMe } from "@/lib/me";
import { getWorkspace } from "@/lib/workspace";
import { Filters } from "./index";

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
jest.mock("@/lib/db/open", () => ({
  openDb: jest.fn(async () => jest.requireActual("@/test/db").testDb()),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }) }));
jest.mock("@/components/native-date-picker", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    NativeDatePicker: ({
      testID,
      value,
      onChange,
    }: {
      testID: string;
      value: Date | null;
      onChange: (d: Date) => void;
    }) => (
      <>
        <Pressable testID={testID} onPress={() => onChange(new Date(2026, 8, 1))}>
          <Text>{value ? value.toISOString() : "Pick a date"}</Text>
        </Pressable>
        <Pressable testID={`${testID}-late`} onPress={() => onChange(new Date(2026, 8, 20))} />
      </>
    ),
  };
});

beforeAll(async () => {
  await libraryReady;
  authStore.setState({ status: "signed-in", token: "demo" });
  await library.refresh(true);
});

beforeEach(async () => {
  mockBack.mockClear();
  filters.reset();
  await resolveMe(db(), "demo");
});

const db = () => libraryStore.getState().db!;
const me = () => DEMO_ME.email;

describe("Filters sheet", () => {
  it("shows a live count that follows the draft and applies on the button", async () => {
    await render(<Filters />);
    const all = countRecordings(db(), { participantEmail: me() });
    expect(screen.getByText(`Show ${all} meetings`)).toBeOnTheScreen();
    expect(screen.getByTestId("scope-all")).toBeSelected();

    await fireEvent.press(screen.getByTestId("scope-external"));
    const external = countRecordings(db(), { participantEmail: me(), scope: "external" });
    expect(external).toBeLessThan(all);
    expect(screen.getByText(`Show ${external} meetings`)).toBeOnTheScreen();
    expect(filtersStore.getState().scope).toBe("all");

    await fireEvent.press(screen.getByTestId("filters-apply"));
    expect(filtersStore.getState().scope).toBe("external");
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("round-trips date presets, custom ranges, meeting type and team", async () => {
    await render(<Filters />);
    await fireEvent.press(screen.getByTestId("date-30d"));
    await fireEvent.press(screen.getByTestId("date-custom"));
    expect(screen.getByTestId("date-from")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("date-from"));
    await fireEvent.press(screen.getByTestId("date-to"));

    const ws = getWorkspace(db());
    const sales = ws.meetingTypes.find((m) => m.name === "Sales")!;
    await fireEvent.press(screen.getByTestId(`type-${sales.id}`));
    await fireEvent.press(screen.getByTestId(`team-${ws.teams[0].id}`));
    await fireEvent.press(screen.getByTestId("filters-apply"));

    const s = filtersStore.getState();
    expect(s.meetingTypeId).toBe(sales.id);
    expect(s.view).toEqual({ kind: "team", id: ws.teams[0].id });
    expect(s.date).toMatchObject({ preset: "custom" });
    expect((s.date as { from: string }).from).toBe(new Date(2026, 8, 1).toISOString());
    expect(screen.getByText(/Show \d+ meeting/)).toBeOnTheScreen();
  });

  it("selects participant, tag and recorder from the More card", async () => {
    await render(<Filters />);
    await fireEvent.press(screen.getByTestId("more-participant"));
    const person = participantOptions(db())[0];
    await fireEvent.press(screen.getByTestId(`participant-${person.id}`));
    expect(within(screen.getByTestId("more-participant")).getByText(person.name)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("more-tag"));
    expect(screen.getByText("No tags on your meetings yet")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("more-recorder"));
    const recorder = recorderOptions(db())[0];
    await fireEvent.press(screen.getByTestId(`recorder-${recorder.id}`));
    expect(within(screen.getByTestId("more-recorder")).getByText(recorder.name)).toBeOnTheScreen();

    const expected = countRecordings(db(), {
      recorderId: recorder.id,
      participant: person.name,
    });
    expect(
      screen.getByText(expected === 1 ? "Show 1 meeting" : `Show ${expected} meetings`),
    ).toBeOnTheScreen();
    if (expected === 0) expect(screen.getByText("Nothing matches these filters")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("filters-apply"));
    expect(filtersStore.getState()).toMatchObject({
      participant: person.name,
      recorderId: recorder.id,
      tag: null,
    });
  });

  it("offers only recorders that appear on meetings, named from the workspace", async () => {
    await render(<Filters />);
    await fireEvent.press(screen.getByTestId("more-recorder"));
    const options = recorderOptions(db());
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) expect(screen.getByTestId(`recorder-${o.id}`)).toBeOnTheScreen();
    const idle = getWorkspace(db()).users.find((u) => !options.some((o) => o.id === u.id));
    if (idle) expect(screen.queryByTestId(`recorder-${idle.id}`)).toBeNull();
  });

  it("keeps the Workspace view when a team chip is turned off again", async () => {
    filters.setView({ kind: "workspace" });
    await render(<Filters />);
    const team = getWorkspace(db()).teams[0];
    await fireEvent.press(screen.getByTestId(`team-${team.id}`));
    await fireEvent.press(screen.getByTestId(`team-${team.id}`));
    await fireEvent.press(screen.getByTestId("filters-apply"));
    expect(filtersStore.getState().view).toEqual({ kind: "workspace" });
  });

  it("clears the other end of a custom range when the range would be inverted", async () => {
    await render(<Filters />);
    await fireEvent.press(screen.getByTestId("date-custom"));
    await fireEvent.press(screen.getByTestId("date-to"));
    expect(screen.getByTestId("date-to")).toHaveTextContent(new Date(2026, 8, 1).toISOString());
    await fireEvent.press(screen.getByTestId("date-from-late"));
    expect(screen.getByTestId("date-to")).toHaveTextContent("Pick a date");
    await fireEvent.press(screen.getByTestId("filters-apply"));
    expect(filtersStore.getState().date).toEqual({
      preset: "custom",
      from: new Date(2026, 8, 20).toISOString(),
      to: null,
    });
  });

  it("reset returns the draft to defaults without touching the store until applied", async () => {
    filters.apply({ ...sheetFilters(defaultFilters), scope: "internal", tag: "vip" });
    await render(<Filters />);
    expect(screen.getByTestId("scope-internal")).toBeSelected();
    await fireEvent.press(screen.getByTestId("filters-reset"));
    expect(screen.getByTestId("scope-all")).toBeSelected();
    expect(filtersStore.getState().scope).toBe("internal");
    await fireEvent.press(screen.getByTestId("filters-apply"));
    expect(sheetFilters(filtersStore.getState())).toEqual(sheetFilters(defaultFilters));
  });
});

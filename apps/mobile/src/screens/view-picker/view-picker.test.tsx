import { fireEvent, render, screen } from "@/test/render";
import { authStore } from "@/lib/auth";
import { filters, filtersStore } from "@/lib/filters";
import { library, libraryReady, libraryStore } from "@/lib/library";
import { getWorkspace } from "@/lib/workspace";
import { ViewPicker } from "./index";

jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
}));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }) }));

beforeAll(async () => {
  await libraryReady;
  authStore.setState({ status: "signed-in", token: "demo" });
  await library.refresh(true);
});

beforeEach(() => {
  mockBack.mockClear();
  filters.reset();
});

const teams = () => getWorkspace(libraryStore.getState().db!).teams;

describe("ViewPicker", () => {
  it("lists every view with the current one checked", async () => {
    filters.setView({ kind: "team", id: teams()[3].id });
    await render(<ViewPicker />);
    expect(screen.getByTestId("picker-view-mine")).toBeOnTheScreen();
    expect(screen.getByTestId("picker-view-workspace")).toBeOnTheScreen();
    for (const t of teams()) {
      expect(screen.getByTestId(`picker-view-team-${t.id}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId(`picker-view-team-${teams()[3].id}`)).toBeSelected();
    expect(screen.getByTestId("picker-view-mine")).not.toBeSelected();
  });

  it("sets the view and dismisses on selection", async () => {
    await render(<ViewPicker />);
    const team = teams()[5];
    await fireEvent.press(screen.getByTestId(`picker-view-team-${team.id}`));
    expect(filtersStore.getState().view).toEqual({ kind: "team", id: team.id });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

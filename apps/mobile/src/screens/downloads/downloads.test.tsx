import { authStore } from "@/lib/auth";
import { listRecordings } from "@/lib/db";
import { downloadsStore, IDLE_DOWNLOAD } from "@/lib/downloads";
import { library, libraryReady, libraryStore } from "@/lib/library";
import { act, render, screen, waitFor } from "@/test/render";
import { Downloads } from "./index";

jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
}));
jest.mock("expo-image", () => ({ Image: jest.requireActual("react-native").Image }));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("drizzle-orm/expo-sqlite", () => ({
  useLiveQuery: (query: { all: () => unknown[] }) => ({ data: query.all(), updatedAt: new Date() }),
}));
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

beforeAll(async () => {
  await libraryReady;
  authStore.setState({ status: "signed-in", token: "demo" });
  await library.refresh(true);
});

afterEach(() => {
  downloadsStore.setState({ byId: {} });
});

const db = () => libraryStore.getState().db!;
const done = (uri: string) => ({ ...IDLE_DOWNLOAD, status: "done" as const, progress: 1, uri });

describe("Downloads", () => {
  it("invites a download when nothing is offline", async () => {
    await render(<Downloads />);
    expect(screen.getByText("Nothing downloaded yet")).toBeOnTheScreen();
  });

  it("lists the downloaded meeting with its offline glyph", async () => {
    const row = listRecordings(db())[0];
    await act(async () => {
      downloadsStore.setState({ byId: { [row.id]: done("file:///one.mp4") } });
    });
    await render(<Downloads />);
    await waitFor(() => expect(screen.getByTestId(`meeting-${row.id}`)).toBeOnTheScreen());
    expect(screen.getByTestId(`downloaded-${row.id}`)).toBeOnTheScreen();
    expect(screen.queryByText("Nothing downloaded yet")).not.toBeOnTheScreen();
  });
});

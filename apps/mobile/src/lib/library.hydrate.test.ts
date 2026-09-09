import { setMeta } from "@/lib/db";
import { openDb } from "@/lib/db/open";
import { META_ME, type Me, meStore } from "@/lib/me";
import { testDb } from "@/test/db";

jest.mock("expo-video", () => require("@/test/mocks/expo-video"));
jest.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI" },
  getNetworkStateAsync: jest.fn(async () => ({ type: "WIFI" })),
}));
jest.mock("@/lib/grain", () => ({ makeClient: jest.fn() }));
jest.mock("@/lib/prewarm", () => ({
  runPrewarm: jest.fn(async () => undefined),
  cancelPrewarm: jest.fn(),
}));

it("hydrates me from cached meta before any network work", async () => {
  const cached: Me = { email: "ada@example.com", name: "Ada", userId: "u1", source: "detected" };
  const db = testDb();
  setMeta(db, META_ME, JSON.stringify(cached));
  (openDb as jest.Mock).mockResolvedValueOnce(db);

  const { libraryReady } = require("@/lib/library") as typeof import("@/lib/library");
  await libraryReady;

  expect(meStore.getState()).toEqual({ me: cached, status: "ready" });
});

jest.mock("expo-secure-store", () => require("@/test/mocks/expo-secure-store"));

jest.mock("expo-haptics", () => require("@/test/mocks/expo-haptics"));

jest.mock("expo-sqlite", () => ({
  addDatabaseChangeListener: () => ({ remove() {} }),
  defaultDatabaseDirectory: "/data/SQLite",
}));

jest.mock("@/lib/db/open", () => ({
  DB_NAME: "grist.db",
  openDb: jest.fn(async () => jest.requireActual("@/test/db").testDb()),
}));

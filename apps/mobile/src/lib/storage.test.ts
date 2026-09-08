import type { Transcript } from "@grist/grain-api";
import transcript from "@grist/grain-api/fixtures/transcript.json";
import { Directory, File } from "expo-file-system";
import { setTranscript } from "@/lib/db";
import { seedDemo } from "@/lib/demo";
import { formatBytes } from "@/lib/format";
import { downloadsDirectory, storageStats } from "@/lib/storage";
import { testDb } from "@/test/db";

jest.mock("expo-file-system", () => {
  const sizes = new Map<string, number>();
  class MockEntry {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts
        .map((p) => (typeof p === "string" ? p : (p as { uri: string }).uri))
        .join("/");
    }
  }
  class MockFile extends MockEntry {
    get exists() {
      return sizes.has(this.uri);
    }
    get size() {
      return sizes.get(this.uri) ?? null;
    }
  }
  class MockDirectory extends MockEntry {
    get exists() {
      return [...sizes.keys()].some((k) => k.startsWith(`${this.uri}/`));
    }
    list() {
      return [...sizes.keys()]
        .filter((k) => k.startsWith(`${this.uri}/`))
        .map((k) => new MockFile(k))
        .concat([new MockDirectory(`${this.uri}/nested`) as unknown as MockFile]);
    }
  }
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: "file:///docs" },
    mockSizes: sizes,
  };
});

const sizes = jest.requireMock("expo-file-system").mockSizes as Map<string, number>;

beforeEach(() => sizes.clear());

describe("storageStats", () => {
  it("reports zero downloads and an empty index on a fresh install", () => {
    const stats = storageStats(testDb());
    expect(stats).toEqual({
      downloads: { count: 0, bytes: 0 },
      index: { meetings: 0, segments: 0, bytes: 0 },
    });
  });

  it("counts indexed meetings and segments and reads the database file size", () => {
    const db = testDb();
    seedDemo(db);
    setTranscript(db, "demo-0", (transcript as Transcript).slice(0, 2), "2026-09-06T00:00:00Z");
    sizes.set("file:///data/SQLite/grist.db", 41 * 1024 * 1024);
    const stats = storageStats(db);
    expect(stats.index.meetings).toBe(24);
    expect(stats.index.segments).toBe(23 * transcript.length + 2);
    expect(stats.index.bytes).toBe(41 * 1024 * 1024);
  });

  it("sums downloaded files under the documents downloads directory", () => {
    const dir = downloadsDirectory();
    expect(dir).toBeInstanceOf(Directory);
    expect(dir.uri).toBe("file:///docs/downloads");
    sizes.set("file:///docs/downloads/a.mp4", 600);
    sizes.set("file:///docs/downloads/b.m4a", 400);
    const stats = storageStats(testDb());
    expect(stats.downloads).toEqual({ count: 2, bytes: 1000 });
    expect(new File("file:///docs/downloads/a.mp4").exists).toBe(true);
  });
});

describe("formatBytes", () => {
  it("picks a unit and rounds sensibly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(41 * 1024 * 1024)).toBe("41 MB");
    expect(formatBytes(890 * 1024 * 1024)).toBe("890 MB");
    expect(formatBytes(1.25 * 1024 ** 3)).toBe("1.3 GB");
    expect(formatBytes(2048 * 1024 ** 3)).toBe("2048 GB");
  });
});

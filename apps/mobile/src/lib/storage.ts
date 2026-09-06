import { Directory, File, Paths } from "expo-file-system";
import { defaultDatabaseDirectory } from "expo-sqlite";
import { type Db, indexSize } from "@/lib/db";
import { DB_NAME } from "@/lib/db/open";

export type StorageStats = {
  downloads: { count: number; bytes: number };
  index: { meetings: number; segments: number; bytes: number };
};

export function downloadsDirectory(): Directory {
  return new Directory(Paths.document, "downloads");
}

function fileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
}

function sizeOf(entry: { exists: boolean; size: number | null }): number {
  return entry.exists ? (entry.size ?? 0) : 0;
}

export function storageStats(db: Db): StorageStats {
  const dir = downloadsDirectory();
  const files = dir.exists ? dir.list().filter((e): e is File => e instanceof File) : [];
  const dbFile = new File(fileUri(String(defaultDatabaseDirectory)), DB_NAME);
  return {
    downloads: { count: files.length, bytes: files.reduce((n, f) => n + sizeOf(f), 0) },
    index: { ...indexSize(db), bytes: sizeOf(dbFile) },
  };
}

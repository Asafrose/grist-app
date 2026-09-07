import { useDownloadsVersion } from "@/lib/downloads";
import { type StorageStats, storageStats } from "@/lib/storage";
import { useSnapshot } from "./live";

export function useStorageStats(): StorageStats {
  const downloadsVersion = useDownloadsVersion();
  return useSnapshot((db) => storageStats(db), [downloadsVersion]);
}

import { type StorageStats, storageStats } from "@/lib/storage";
import { useSnapshot } from "./live";

export function useStorageStats(): StorageStats {
  return useSnapshot((db) => storageStats(db), []);
}

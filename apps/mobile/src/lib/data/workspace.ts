import { getWorkspace, type Workspace } from "@/lib/workspace";
import { useSnapshot } from "./live";

export function useWorkspace(): Workspace {
  return useSnapshot((db) => getWorkspace(db), []);
}

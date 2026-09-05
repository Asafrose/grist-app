import type { GrainHttp } from "../http";
import { Hook, type HookType, HooksResponse, type RecordingInclude, Success } from "../schemas";

export class HooksApi {
  constructor(private readonly http: GrainHttp) {}

  list(filter?: { hook_type?: HookType; state?: "enabled" | "disabled" }) {
    return this.http.post("/hooks", HooksResponse, filter ? { filter } : undefined);
  }

  create(params: { hook_type: HookType; hook_url: string; include?: RecordingInclude }) {
    return this.http.post("/hooks/create", Hook, params);
  }

  delete(id: string) {
    return this.http.delete(`/hooks/${id}`, Success);
  }
}

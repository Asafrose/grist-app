import type { GrainHttp } from "../http";
import {
  Recording,
  type RecordingFilter,
  type RecordingInclude,
  RecordingsPage,
  Success,
  Transcript,
} from "../schemas";

export type ListRecordingsParams = {
  filter?: RecordingFilter;
  include?: RecordingInclude;
  cursor?: string;
};

export type TranscriptFormat = "txt" | "vtt" | "srt";

export class RecordingsApi {
  constructor(private readonly http: GrainHttp) {}

  list(params: ListRecordingsParams = {}) {
    return this.http.post("/recordings", RecordingsPage, params);
  }

  async *iterate(params: Omit<ListRecordingsParams, "cursor"> = {}) {
    let cursor: string | undefined;
    do {
      const page = await this.list({ ...params, cursor });
      yield page;
      cursor = page.cursor ?? undefined;
    } while (cursor);
  }

  get(id: string, include?: RecordingInclude) {
    return this.http.post(`/recordings/${id}`, Recording, include ? { include } : undefined);
  }

  transcript(id: string) {
    return this.http.json(`/recordings/${id}/transcript`, Transcript);
  }

  transcriptText(id: string, format: TranscriptFormat) {
    return this.http.text(`/recordings/${id}/transcript.${format}`);
  }

  downloadUrl(id: string) {
    return this.http.url(`/recordings/${id}/download`);
  }

  async resolveMediaUrl(id: string): Promise<string> {
    const res = await this.http.request(`/recordings/${id}/download`, {
      headers: { Range: "bytes=0-0" },
    });
    await res.body?.cancel().catch(() => {});
    return res.url;
  }

  rename(id: string, title: string) {
    return this.http.patch(`/recordings/${id}`, Success, { title });
  }

  addTag(id: string, tag: string) {
    return this.http.put(`/recordings/${id}/tags`, Success, { tag });
  }

  removeTag(id: string, tag: string) {
    return this.http.delete(`/recordings/${id}/tags/${encodeURIComponent(tag)}`, Success);
  }

  shareWithUser(id: string, userId: string) {
    return this.http.put(`/recordings/${id}/users`, Success, { user_id: userId });
  }

  unshareUser(id: string, userId: string) {
    return this.http.delete(`/recordings/${id}/users/${userId}`, Success);
  }

  shareWithTeam(id: string, teamId: string) {
    return this.http.put(`/recordings/${id}/teams`, Success, { team_id: teamId });
  }

  unshareTeam(id: string, teamId: string) {
    return this.http.delete(`/recordings/${id}/teams/${teamId}`, Success);
  }
}

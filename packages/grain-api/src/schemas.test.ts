import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HooksResponse,
  MeetingTypesResponse,
  Recording,
  RecordingsPage,
  TeamsResponse,
  Transcript,
  UsersResponse,
} from "./schemas";
import { parseWebhookPayload } from "./webhooks";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

describe("schemas against recorded fixtures", () => {
  it("parses a recordings page and keeps unknown fields", () => {
    const page = RecordingsPage.parse(fixture("recordings.json"));
    expect(page.recordings).toHaveLength(5);
    expect(page.cursor).toBeTypeOf("string");
    expect(page.recordings[0]).toHaveProperty("workspace_shared");
  });

  it("parses a full recording with every include", () => {
    const r = Recording.parse(fixture("recording.json"));
    expect(r.participants?.length).toBeGreaterThan(0);
    expect(r.ai_summary?.text).toContain("## ");
    expect(r.ai_action_items?.[0]).toMatchObject({
      status: expect.any(String),
      timestamp: expect.any(Number),
    });
    expect(r.screenshares?.[0]).toMatchObject({
      start: expect.any(Number),
      end: expect.any(Number),
    });
    expect(r.calendar_event?.ical_uid).toBeTypeOf("string");
  });

  it("parses highlights, whose ids are not UUIDs", () => {
    const r = Recording.parse(fixture("recording-with-highlights.json"));
    const clip = r.highlights?.[0];
    expect(clip).toBeDefined();
    expect(clip?.id).not.toMatch(/^[0-9a-f-]{36}$/);
    expect(clip?.recording_id).toBe(r.id);
    expect(clip?.duration).toBeGreaterThan(0);
  });

  it("parses transcript segments", () => {
    const t = Transcript.parse(fixture("transcript.json"));
    expect(t).toHaveLength(40);
    expect(t[0].end).toBeGreaterThan(t[0].start);
  });

  it("parses users, teams, meeting types, hooks", () => {
    expect(UsersResponse.parse(fixture("users.json")).users.length).toBeGreaterThan(0);
    expect(TeamsResponse.parse(fixture("teams.json")).teams.length).toBeGreaterThan(0);
    expect(
      MeetingTypesResponse.parse(fixture("meeting_types.json")).meeting_types.length,
    ).toBeGreaterThan(0);
    expect(HooksResponse.parse(fixture("hooks.json")).hooks[0].hook_type).toBe("recording_added");
  });

  it("accepts unknown enum values without failing", () => {
    const r = Recording.parse({
      ...fixture("recording.json"),
      source: "hologram",
      media_type: "smell",
    });
    expect(r.source).toBe("hologram");
  });

  it("parses webhook payloads by type", () => {
    const rec = fixture("recording.json");
    expect(parseWebhookPayload({ type: "recording_added", user_id: "u1", data: rec }).type).toBe(
      "recording_added",
    );
    expect(parseWebhookPayload({ type: "recording_deleted", data: { id: "x" } }).data.id).toBe("x");
    expect(() => parseWebhookPayload({ type: "nope", data: {} })).toThrow();
  });
});

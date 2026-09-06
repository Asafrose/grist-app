import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GrainClient } from "./client";
import { GRAIN_API_VERSION, GrainApiError, GrainSchemaError } from "./http";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

type Call = { url: string; init: RequestInit };

function mockFetch(responses: Array<() => Response>) {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    return next();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...init.headers },
    ...init,
  });

describe("GrainClient", () => {
  it("sends auth and version headers and posts JSON bodies", async () => {
    const { fetchImpl, calls } = mockFetch([() => json(fixture("recordings.json"))]);
    const client = new GrainClient({ token: "tok", fetch: fetchImpl });
    const page = await client.recordings.list({
      filter: { title_search: "demo" },
      include: { participants: true },
    });
    expect(page.recordings).toHaveLength(5);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(calls[0].url).toBe("https://api.grain.com/_/public-api/v2/recordings");
    expect(calls[0].init.method).toBe("POST");
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Public-Api-Version"]).toBe(GRAIN_API_VERSION);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      filter: { title_search: "demo" },
      include: { participants: true },
    });
  });

  it("iterates pages until the cursor is exhausted", async () => {
    const first = fixture("recordings.json");
    const last = { ...first, cursor: null };
    const { fetchImpl, calls } = mockFetch([() => json(first), () => json(last)]);
    const client = new GrainClient({ token: "tok", fetch: fetchImpl });
    const pages = [];
    for await (const p of client.recordings.iterate()) pages.push(p);
    expect(pages).toHaveLength(2);
    expect(JSON.parse(String(calls[1].init.body)).cursor).toBe(first.cursor);
  });

  it("retries once on 429 using Retry-After, then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl, calls } = mockFetch([
      () => json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "3" } }),
      () => json(fixture("users.json")),
    ]);
    const client = new GrainClient({ token: "tok", fetch: fetchImpl, sleep });
    const users = await client.users.list();
    expect(users.users.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("surfaces API errors with status and code", async () => {
    const { fetchImpl } = mockFetch([() => json(fixture("error-400.json"), { status: 400 })]);
    const client = new GrainClient({ token: "tok", fetch: fetchImpl });
    const err = await client.recordings.get("x", { highlights: true }).catch((e) => e);
    expect(err).toBeInstanceOf(GrainApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("bad_request");
    expect(err.isAuth).toBe(false);
  });

  it("flags 401 as an auth error", async () => {
    const { fetchImpl } = mockFetch([() => json({ error: "unauthorized" }, { status: 401 })]);
    const client = new GrainClient({ token: "bad", fetch: fetchImpl });
    const err = await client.recordings.list().catch((e) => e);
    expect(err.isAuth).toBe(true);
  });

  it("throws a schema error when the response shape drifts", async () => {
    const { fetchImpl } = mockFetch([() => json({ recordings: "nope" })]);
    const client = new GrainClient({ token: "tok", fetch: fetchImpl });
    await expect(client.recordings.list()).rejects.toBeInstanceOf(GrainSchemaError);
  });

  it("reports rate limit headers", async () => {
    const onRateLimit = vi.fn();
    const { fetchImpl } = mockFetch([
      () =>
        json(fixture("teams.json"), {
          headers: { "x-ratelimit-limit": "300", "x-ratelimit-remaining": "287" },
        }),
    ]);
    await new GrainClient({ token: "tok", fetch: fetchImpl, onRateLimit }).teams.list();
    expect(onRateLimit).toHaveBeenCalledWith({ limit: 300, remaining: 287 });
  });

  it("resolves the signed media URL by following the download redirect with a 1-byte range", async () => {
    const signed = fixture("download.json").location as string;
    const { fetchImpl, calls } = mockFetch([
      () => {
        const res = new Response(new Uint8Array([0]), {
          status: 206,
          headers: { "content-range": "bytes 0-0/10" },
        });
        Object.defineProperty(res, "url", { value: signed });
        return res;
      },
    ]);
    const client = new GrainClient({ token: "tok", fetch: fetchImpl });
    const url = await client.recordings.resolveMediaUrl("rec");
    expect(url).toBe(signed);
    expect((calls[0].init.headers as Record<string, string>).Range).toBe("bytes=0-0");
  });

  it("returns transcript text formats untouched", async () => {
    const vtt = readFileSync(new URL("../fixtures/transcript.vtt", import.meta.url), "utf8");
    const { fetchImpl, calls } = mockFetch([() => new Response(vtt, { status: 200 })]);
    const client = new GrainClient({ token: "tok", fetch: fetchImpl });
    expect(await client.recordings.transcriptText("rec", "vtt")).toBe(vtt);
    expect(calls[0].url).toMatch(/\/recordings\/rec\/transcript\.vtt$/);
  });

  it("encodes tags in the delete path", async () => {
    const { fetchImpl, calls } = mockFetch([() => json({ success: true })]);
    await new GrainClient({ token: "tok", fetch: fetchImpl }).recordings.removeTag(
      "rec",
      "my tag/1",
    );
    expect(calls[0].url).toMatch(/\/tags\/my%20tag%2F1$/);
    expect(calls[0].init.method).toBe("DELETE");
  });
});

describe("resource groups", () => {
  const ok = () => json({ success: true });

  it("recordings mutations hit the documented verbs and paths", async () => {
    const { fetchImpl, calls } = mockFetch([ok]);
    const r = new GrainClient({ token: "tok", fetch: fetchImpl }).recordings;
    await r.rename("r1", "New title");
    await r.addTag("r1", "sales");
    await r.removeTag("r1", "a/b");
    await r.shareWithUser("r1", "u1");
    await r.unshareUser("r1", "u1");
    await r.shareWithTeam("r1", "t1");
    await r.unshareTeam("r1", "t1");
    expect(calls.map((c) => [c.init.method, c.url.replace(/^.*\/v2/, "")])).toEqual([
      ["PATCH", "/recordings/r1"],
      ["PUT", "/recordings/r1/tags"],
      ["DELETE", "/recordings/r1/tags/a%2Fb"],
      ["PUT", "/recordings/r1/users"],
      ["DELETE", "/recordings/r1/users/u1"],
      ["PUT", "/recordings/r1/teams"],
      ["DELETE", "/recordings/r1/teams/t1"],
    ]);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ title: "New title" });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ tag: "sales" });
    expect(JSON.parse(String(calls[3].init.body))).toEqual({ user_id: "u1" });
    expect(JSON.parse(String(calls[5].init.body))).toEqual({ team_id: "t1" });
  });

  it("fetches transcripts as JSON and as text formats, and exposes the download url", async () => {
    const { fetchImpl, calls } = mockFetch([
      () => json(fixture("transcript.json")),
      () => new Response("WEBVTT\n", { status: 200 }),
    ]);
    const r = new GrainClient({ token: "tok", fetch: fetchImpl }).recordings;
    const segments = await r.transcript("r1");
    expect(segments[0]).toMatchObject({ speaker: expect.any(String), start: expect.any(Number) });
    expect(await r.transcriptText("r1", "vtt")).toBe("WEBVTT\n");
    expect(calls[1].url).toMatch(/\/recordings\/r1\/transcript\.vtt$/);
    expect(r.downloadUrl("r1")).toBe(
      "https://api.grain.com/_/public-api/v2/recordings/r1/download",
    );
  });

  it("resolves the media url from the redirect target using a 1-byte range request", async () => {
    const { fetchImpl, calls } = mockFetch([
      () => {
        const res = new Response(new Uint8Array([0]), { status: 206 });
        Object.defineProperty(res, "url", { value: "https://media.example/r1.mp4?sig=1" });
        return res;
      },
    ]);
    const r = new GrainClient({ token: "tok", fetch: fetchImpl }).recordings;
    expect(await r.resolveMediaUrl("r1")).toBe("https://media.example/r1.mp4?sig=1");
    expect((calls[0].init.headers as Record<string, string>).Range).toBe("bytes=0-0");
  });

  it("lists, creates and deletes hooks", async () => {
    const hooks = fixture("hooks.json");
    const { fetchImpl, calls } = mockFetch([
      () => json(hooks),
      () => json(hooks),
      () => json(hooks.hooks[0]),
      ok,
    ]);
    const h = new GrainClient({ token: "tok", fetch: fetchImpl }).hooks;
    expect((await h.list()).hooks).toHaveLength(1);
    expect(calls[0].init.body).toBeUndefined();
    expect((await h.list({ state: "enabled" })).hooks).toHaveLength(1);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ filter: { state: "enabled" } });
    const created = await h.create({ hook_type: "recording_added", hook_url: "https://x/y" });
    expect(created.hook_type).toBe("recording_added");
    await h.delete(created.id);
    expect(calls[3].init.method).toBe("DELETE");
    expect(calls[3].url).toMatch(new RegExp(`/hooks/${created.id}$`));
  });

  it("lists workspace resources and creates upload tickets", async () => {
    const { fetchImpl, calls } = mockFetch([
      () => json(fixture("teams.json")),
      () => json(fixture("meeting_types.json")),
      () =>
        json({
          uuid: "u",
          url: "https://upload.example",
          max_duration_sec: 1,
          max_upload_bytes: 2,
        }),
    ]);
    const c = new GrainClient({ token: "tok", fetch: fetchImpl });
    expect((await c.teams.list()).teams.length).toBeGreaterThan(0);
    expect((await c.meetingTypes.list()).meeting_types.length).toBeGreaterThan(0);
    const ticket = await c.uploads.create("call.mp4", "user-1");
    expect(ticket.uuid).toBe("u");
    expect(JSON.parse(String(calls[2].init.body))).toEqual({
      filename: "call.mp4",
      user_id: "user-1",
    });
  });
});

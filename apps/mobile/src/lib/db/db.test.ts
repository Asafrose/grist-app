import type { Recording, Transcript } from "@grist/grain-api";
import page from "@grist/grain-api/fixtures/recordings.json";
import detail from "@grist/grain-api/fixtures/recording.json";
import withClips from "@grist/grain-api/fixtures/recording-with-highlights.json";
import transcript from "@grist/grain-api/fixtures/transcript.json";
import {
  clearAll,
  clearIndex,
  clearPlaybackPosition,
  getPlaybackPosition,
  RESUME_END_MARGIN_SECONDS,
  resumePosition,
  setPlaybackPosition,
  countRecordings,
  deleteMeta,
  deleteRecordings,
  getMeta,
  getRecording,
  getTranscript,
  highlightsQuery,
  indexSize,
  indexStats,
  listRecorders,
  listRecordings,
  listTeams,
  meetingTypeOptions,
  participantOptions,
  pruneRecordingsBefore,
  recorderOptions,
  recordingsMissingTranscript,
  searchHighlights,
  searchRecordings,
  searchTranscripts,
  searchTranscriptsGrouped,
  setMeta,
  setRecordingTags,
  setTranscript,
  tagOptions,
  teamOptions,
  upsertRecordings,
} from "@/lib/db";
import { seedDemo } from "@/lib/demo";
import { testDb } from "@/test/db";

const recs = page.recordings as Recording[];
const first = detail as Recording;
const clips = withClips as Recording;
const NOW = "2026-09-06T10:00:00Z";

describe("recordings", () => {
  it("upserts a page and lists newest first", () => {
    const db = testDb();
    upsertRecordings(db, recs, NOW);
    const rows = listRecordings(db);
    expect(rows).toHaveLength(recs.length);
    const starts = rows.map((r) => r.startDatetime);
    expect(starts).toEqual(starts.toSorted().toReversed());
    expect(rows[0]).toMatchObject({ participantCount: recs[0].participants!.length });
  });

  it("updates in place and keeps children in sync", () => {
    const db = testDb();
    upsertRecordings(db, [first], NOW);
    const renamed: Recording = {
      ...first,
      title: "Renamed",
      participants: first.participants!.slice(0, 1),
    };
    upsertRecordings(db, [renamed], NOW);
    const row = getRecording(db, first.id)!;
    expect(row.title).toBe("Renamed");
    expect(row.participants).toHaveLength(1);
    expect(listRecordings(db)).toHaveLength(1);
  });

  it("does not wipe children when an include is absent", () => {
    const db = testDb();
    upsertRecordings(db, [first], NOW);
    const { participants, ai_action_items, ai_summary, ...bare } = first;
    upsertRecordings(db, [bare as Recording], NOW);
    const row = getRecording(db, first.id)!;
    expect(row.participants.length).toBe(participants!.length);
    expect(row.actionItems.length).toBe(ai_action_items!.length);
    expect(row.summary).toBe(ai_summary!.text);
  });

  it("returns detail with ordered sections, action items and highlights", () => {
    const db = testDb();
    upsertRecordings(db, [first, clips], NOW);
    const row = getRecording(db, first.id)!;
    expect(row.sections.map((s) => s.title)[0]).toBe("Demo highlights");
    expect(row.actionItems.map((a) => a.position)).toEqual(row.actionItems.map((_, i) => i));
    const c = getRecording(db, clips.id)!;
    expect(c.highlights.length).toBe(clips.highlights!.length);
    expect(c.highlightCount).toBe(clips.highlights!.length);
    expect(highlightsQuery(db).all()[0].recordingTitle).toBe(clips.title);
  });

  it("lists clips newest first with their recording's title and recorders, filtered by team and recorder", () => {
    const db = testDb();
    const other: Recording = {
      ...clips,
      id: "other",
      teams: [{ id: "team-x", name: "X team" }],
      recorders: [{ id: "rec-x", name: "Xavier" }],
      highlights: clips.highlights!.map((h) => ({
        ...h,
        id: `x-${h.id}`,
        recording_id: "other",
        created_datetime: "2027-01-01T00:00:00Z",
      })),
    };
    upsertRecordings(db, [...recs, clips, other], NOW);
    const all = highlightsQuery(db).all();
    expect(all).toHaveLength(clips.highlights!.length * 2);
    expect(all[0].highlight.recordingId).toBe("other");
    expect(all[0]).toMatchObject({ recordingTitle: clips.title, recorders: other.recorders });
    expect(highlightsQuery(db, { limit: 1 }).all()).toHaveLength(1);
    expect(
      highlightsQuery(db, { teamId: "team-x" })
        .all()
        .map((c) => c.highlight.recordingId),
    ).toEqual(["other"]);
    expect(highlightsQuery(db, { recorderId: clips.recorders[0].id }).all()).toHaveLength(
      clips.highlights!.length,
    );
    expect(highlightsQuery(db, { recorderId: "nobody" }).all()).toEqual([]);
  });

  it("lists the distinct teams across recordings", () => {
    const db = testDb();
    expect(listTeams(db)).toEqual([]);
    upsertRecordings(db, [...recs, { ...clips, teams: [{ id: "team-x", name: "A team" }] }], NOW);
    const teams = listTeams(db);
    expect(teams[0]).toEqual({ id: "team-x", name: "A team" });
    expect(new Set(teams.map((t) => t.id)).size).toBe(teams.length);
    expect(teams.map((t) => t.id)).toContain(recs[0].teams[0].id);
  });

  it("filters by scope, team and meeting type", () => {
    const db = testDb();
    upsertRecordings(db, recs, NOW);
    const external = listRecordings(db, { scope: "external" });
    const internal = listRecordings(db, { scope: "internal" });
    expect(external.length + internal.length).toBe(recs.length);
    expect(external.every((r) => r.externalCount > 0)).toBe(true);
    const team = recs.find((r) => r.teams.length)?.teams[0];
    if (team) expect(listRecordings(db, { teamId: team.id }).length).toBeGreaterThan(0);
    const mt = recs.find((r) => r.meeting_type)?.meeting_type;
    if (mt) expect(listRecordings(db, { meetingTypeId: mt.id }).length).toBeGreaterThan(0);
  });

  it("filters by the after and before bounds a date filter produces", () => {
    const db = testDb();
    upsertRecordings(db, recs, NOW);
    const starts = recs.map((r) => r.start_datetime).toSorted();
    const cut = starts[1];

    expect(listRecordings(db, { after: cut }).every((r) => r.startDatetime >= cut)).toBe(true);
    expect(listRecordings(db, { before: cut }).map((r) => r.startDatetime)).toEqual([starts[0]]);
    expect(countRecordings(db, { after: starts[0], before: cut })).toBe(1);
    expect(listRecordings(db, { after: starts.at(-1), before: starts[0] })).toEqual([]);
    expect(countRecordings(db, { after: starts[0] })).toBe(recs.length);
  });

  it("filters by title, participant, tag, recorder and workspace sharing, and counts", () => {
    const db = testDb();
    const tagged: Recording = { ...recs[1], tags: ["vip", "q3"], workspace_shared: true };
    upsertRecordings(db, [recs[0], tagged, ...recs.slice(2)], NOW);

    expect(listRecordings(db, { title: "pricing" }).map((r) => r.id)).toEqual([recs[0].id]);
    expect(listRecordings(db, { title: "  PRICING  " })).toHaveLength(1);
    expect(listRecordings(db, { title: "100%" })).toEqual([]);
    expect(listRecordings(db, { title: "   " })).toHaveLength(recs.length);

    const name = recs[0].participants![1].name;
    const withName = listRecordings(db, { participant: name });
    expect(withName.map((r) => r.id)).toContain(recs[0].id);
    expect(withName.length).toBe(
      recs.filter((r) => r.participants!.some((p) => p.name === name)).length,
    );

    expect(listRecordings(db, { tag: "vip" }).map((r) => r.id)).toEqual([recs[1].id]);
    expect(listRecordings(db, { tag: "nope" })).toEqual([]);
    expect(listRecordings(db, { workspace: true }).map((r) => r.id)).toEqual([recs[1].id]);

    const recorder = recs[0].recorders[0];
    const byRecorder = listRecordings(db, { recorderId: recorder.id });
    expect(byRecorder.length).toBe(
      recs.filter((r) => r.recorders.some((x) => x.id === recorder.id)).length,
    );
    expect(countRecordings(db, { recorderId: recorder.id })).toBe(byRecorder.length);
    expect(countRecordings(db)).toBe(recs.length);
    expect(countRecordings(db, { scope: "external", tag: "vip" })).toBe(1);
  });

  it("carries external participant emails on list rows", () => {
    const db = testDb();
    upsertRecordings(db, recs, NOW);
    const row = listRecordings(db).find((r) => r.id === recs[0].id)!;
    expect(JSON.parse(row.externalEmails)).toEqual(
      recs[0].participants!.filter((p) => p.scope === "external" && p.email).map((p) => p.email),
    );
    const noExternal = listRecordings(db).find((r) => r.externalCount === 0);
    if (noExternal) expect(JSON.parse(noExternal.externalEmails)).toEqual([]);
  });

  it("lists filter options with counts, most frequent first", () => {
    const db = testDb();
    const tagged: Recording = { ...recs[1], tags: ["vip"] };
    upsertRecordings(db, [recs[0], tagged, ...recs.slice(2)], NOW);

    const people = participantOptions(db);
    expect(people[0].count).toBeGreaterThanOrEqual(people.at(-1)!.count);
    expect(people.map((p) => p.name)).toContain(recs[0].participants![0].name);

    expect(tagOptions(db)).toEqual([{ id: "vip", name: "vip", count: 1 }]);

    const recorders = recorderOptions(db);
    expect(recorders[0]).toMatchObject({
      id: recs[0].recorders[0].id,
      name: recs[0].recorders[0].name,
    });
    expect(recorders[0].email).toBe(recs[0].recorders[0].email);
    expect(recorders[0].count).toBeGreaterThan(1);

    expect(teamOptions(db)).toEqual([
      { id: recs[0].teams[0].id, name: recs[0].teams[0].name, count: recs.length },
    ]);

    const types = meetingTypeOptions(db);
    expect(types.find((t) => t.name === "Sales")).toMatchObject({ scope: "external" });
    expect(types.reduce((n, t) => n + t.count, 0)).toBe(recs.filter((r) => r.meeting_type).length);
  });

  it("filters recordings and highlights by an attendee email, case-insensitively", () => {
    const db = testDb();
    upsertRecordings(db, [...recs, clips], NOW);
    const email = recs[0].participants![0].email!;
    const mine = listRecordings(db, { participantEmail: email.toUpperCase() });
    expect(mine.length).toBeGreaterThan(0);
    for (const r of mine) {
      const detail = getRecording(db, r.id)!;
      expect(detail.participants.some((p) => p.email?.toLowerCase() === email.toLowerCase())).toBe(
        true,
      );
    }
    expect(listRecordings(db, { participantEmail: "nobody@nowhere.example" })).toEqual([]);
    const clipEmail = clips.participants![0].email!;
    const hits = highlightsQuery(db, { participantEmail: clipEmail }).all();
    expect(hits.length).toBe(clips.highlights!.length);
    expect(highlightsQuery(db, { participantEmail: "nobody@nowhere.example" }).all()).toEqual([]);
  });

  it("deletes and prunes with children and search rows", () => {
    const db = testDb();
    upsertRecordings(db, recs, NOW);
    setTranscript(db, recs[0].id, transcript as Transcript, NOW);
    deleteRecordings(db, [recs[0].id]);
    expect(getRecording(db, recs[0].id)).toBeUndefined();
    expect(getTranscript(db, recs[0].id)).toEqual([]);
    expect(searchRecordings(db, recs[0].title.split(" ")[0])).not.toContainEqual(
      expect.objectContaining({ id: recs[0].id }),
    );
    const cutoff = listRecordings(db)[1].startDatetime;
    const pruned = pruneRecordingsBefore(db, cutoff);
    expect(pruned.length).toBe(recs.length - 3);
    expect(listRecordings(db)).toHaveLength(2);
  });

  it("replaces a recording's tags and keeps search in step", () => {
    const db = testDb();
    upsertRecordings(db, [first], NOW);
    setRecordingTags(db, first.id, ["pilot", "q3"]);
    expect(getRecording(db, first.id)?.tags).toEqual(["pilot", "q3"]);
    expect(searchRecordings(db, "pilot")).toContainEqual(expect.objectContaining({ id: first.id }));
    setRecordingTags(db, first.id, []);
    expect(getRecording(db, first.id)?.tags).toEqual([]);
    expect(searchRecordings(db, "pilot")).toEqual([]);
  });

  it("stores, reads and deletes meta keys", () => {
    const db = testDb();
    expect(getMeta(db, "k")).toBeNull();
    setMeta(db, "k", "v1");
    setMeta(db, "k", "v2");
    expect(getMeta(db, "k")).toBe("v2");
    deleteMeta(db, "k");
    expect(getMeta(db, "k")).toBeNull();
  });

  it("clears everything on sign-out", () => {
    const db = testDb();
    upsertRecordings(db, recs, NOW);
    setMeta(db, "k", "v");
    setPlaybackPosition(db, recs[0].id, 42);
    clearAll(db);
    expect(listRecordings(db)).toEqual([]);
    expect(getMeta(db, "k")).toBeNull();
    expect(getPlaybackPosition(db, recs[0].id)).toBeNull();
  });
});

describe("playback positions", () => {
  it("upserts, reads back whole seconds and clears", () => {
    const db = testDb();
    expect(getPlaybackPosition(db, "r1")).toBeNull();
    setPlaybackPosition(db, "r1", 42.6);
    expect(getPlaybackPosition(db, "r1")).toBe(43);
    setPlaybackPosition(db, "r1", -5);
    expect(getPlaybackPosition(db, "r1")).toBe(0);
    setPlaybackPosition(db, "r1", 120);
    expect(getPlaybackPosition(db, "r1")).toBe(120);
    clearPlaybackPosition(db, "r1");
    expect(getPlaybackPosition(db, "r1")).toBeNull();
  });

  it("drops the row when the recording is deleted by the prune", () => {
    const db = testDb();
    upsertRecordings(db, recs, NOW);
    setPlaybackPosition(db, recs[0].id, 42);
    deleteRecordings(db, [recs[0].id]);
    expect(getPlaybackPosition(db, recs[0].id)).toBeNull();
  });

  it("resumes a partially played recording but not one played to the end", () => {
    const db = testDb();
    expect(resumePosition(db, "r1", 600)).toBe(0);
    setPlaybackPosition(db, "r1", 300);
    expect(resumePosition(db, "r1", 600)).toBe(300);
    expect(resumePosition(db, "r1", 0)).toBe(300);
    setPlaybackPosition(db, "r1", 600 - RESUME_END_MARGIN_SECONDS);
    expect(resumePosition(db, "r1", 600)).toBe(0);
    setPlaybackPosition(db, "r1", 0);
    expect(resumePosition(db, "r1", 600)).toBe(0);
  });
});

describe("transcripts", () => {
  it("stores segments, reports missing ones, and searches with snippets", () => {
    const db = testDb();
    upsertRecordings(db, recs, NOW);
    const missing = recordingsMissingTranscript(db, "2000-01-01T00:00:00Z");
    expect(missing).toHaveLength(recs.length);
    setTranscript(db, recs[0].id, transcript as Transcript, NOW);
    expect(recordingsMissingTranscript(db, "2000-01-01T00:00:00Z")).not.toContain(recs[0].id);
    const segs = getTranscript(db, recs[0].id);
    expect(segs).toHaveLength(transcript.length);
    expect(segs[0]).toMatchObject({
      idx: 0,
      start: transcript[0].start,
      speaker: transcript[0].speaker,
    });

    const hits = searchTranscripts(db, "ingestion cost");
    expect(hits[0]).toMatchObject({ recordingId: recs[0].id, idx: 0, start: transcript[0].start });
    expect(hits[0].snippet).toContain("[ingestion]");
    expect(searchTranscripts(db, "ingestion", { recordingId: "nope" })).toEqual([]);
  });

  it("counts indexed recordings against the window", () => {
    const db = testDb();
    expect(indexStats(db)).toEqual({ indexed: 0, total: 0 });
    upsertRecordings(db, recs, NOW);
    expect(indexStats(db)).toEqual({ indexed: 0, total: recs.length });
    setTranscript(db, recs[0].id, transcript as Transcript, NOW);
    setTranscript(db, recs[1].id, transcript as Transcript, NOW);
    expect(indexStats(db)).toEqual({ indexed: 2, total: recs.length });
    const newest = listRecordings(db)[0];
    expect(indexStats(db, newest.startDatetime).total).toBe(1);
    expect(indexStats(db, "2999-01-01T00:00:00Z")).toEqual({ indexed: 0, total: 0 });
  });

  it("groups transcript hits per recording in rank order, sorted by time within", () => {
    const db = testDb();
    upsertRecordings(db, recs, NOW);
    setTranscript(db, recs[0].id, transcript as Transcript, NOW);
    setTranscript(db, recs[1].id, (transcript as Transcript).slice(0, 5), NOW);
    const groups = searchTranscriptsGrouped(db, "ingestion");
    expect(groups.map((g) => g.recording.id).toSorted()).toEqual(
      [recs[0].id, recs[1].id].toSorted(),
    );
    for (const g of groups) {
      expect(g.hits.every((h) => h.recordingId === g.recording.id)).toBe(true);
      expect(g.hits.map((h) => h.start)).toEqual(
        g.hits.map((h) => h.start).toSorted((a, b) => a - b),
      );
      expect(g.hits[0].snippet).toContain("[ingestion]");
    }
    expect(groups.reduce((n, g) => n + g.hits.length, 0)).toBe(
      searchTranscripts(db, "ingestion", { limit: 100 }).length,
    );
    expect(searchTranscriptsGrouped(db, "")).toEqual([]);
    expect(searchTranscriptsGrouped(db, "zzzzzz")).toEqual([]);
  });

  it("reports index size and clears every transcript table", () => {
    const db = testDb();
    upsertRecordings(db, recs, NOW);
    expect(indexSize(db)).toEqual({ meetings: 0, segments: 0 });
    setTranscript(db, recs[0].id, transcript as Transcript, NOW);
    setTranscript(db, recs[1].id, (transcript as Transcript).slice(0, 3), NOW);
    expect(indexSize(db)).toEqual({ meetings: 2, segments: transcript.length + 3 });
    clearIndex(db);
    expect(indexSize(db)).toEqual({ meetings: 0, segments: 0 });
    expect(getTranscript(db, recs[0].id)).toEqual([]);
    expect(searchTranscripts(db, "ingestion")).toEqual([]);
    expect(listRecordings(db)).toHaveLength(recs.length);
    expect(recordingsMissingTranscript(db, "2000-01-01T00:00:00Z")).toHaveLength(recs.length);
  });

  it("lists recorders across all cached recordings", () => {
    const db = testDb();
    expect(listRecorders(db)).toEqual([]);
    upsertRecordings(db, recs, NOW);
    const all = listRecorders(db);
    expect(all).toHaveLength(recs.reduce((n, r) => n + r.recorders.length, 0));
    expect(all[0]).toMatchObject({ id: recs[0].recorders[0].id, name: recs[0].recorders[0].name });
  });

  it("replaces a transcript on refetch", () => {
    const db = testDb();
    upsertRecordings(db, [first], NOW);
    setTranscript(db, first.id, transcript as Transcript, NOW);
    setTranscript(db, first.id, (transcript as Transcript).slice(0, 2), NOW);
    expect(getTranscript(db, first.id)).toHaveLength(2);
    expect(searchTranscripts(db, "ingestion")).toHaveLength(1);
  });
});

describe("search", () => {
  it("matches title, participants and summary with prefix terms", () => {
    const db = testDb();
    upsertRecordings(db, recs, NOW);
    const byTitle = searchRecordings(db, recs[0].title.split(/[\s/:]+/)[0].slice(0, 4));
    expect(byTitle.map((r) => r.id)).toContain(recs[0].id);
    const name = recs[0].participants![0].name.split(" ")[0];
    expect(searchRecordings(db, name).map((r) => r.id)).toContain(recs[0].id);
    expect(searchRecordings(db, '"; drop table')).toEqual([]);
    expect(searchRecordings(db, "   ")).toEqual([]);
  });

  it("matches titles, participants and tags but not summaries, titles first", () => {
    const db = testDb();
    seedDemo(db);
    const titles = searchRecordings(db, "pricing").map((r) => r.title);
    expect(titles).toHaveLength(3);
    expect(titles.every((t) => /Pricing review/.test(t))).toBe(true);
    const byPerson = searchRecordings(db, "Zara").map((r) => r.title);
    expect(byPerson.length).toBeGreaterThan(0);
    expect(byPerson.some((t) => /Zara/.test(t))).toBe(false);
  });

  it("finds clips by highlight text or transcript with a marked snippet", () => {
    const db = testDb();
    upsertRecordings(db, [clips, first], NOW);
    const h = clips.highlights![0];
    const word = h.text.split(" ").find((w) => w.length > 5)!;
    const byText = searchHighlights(db, word.slice(0, 4).toUpperCase());
    expect(byText).toHaveLength(1);
    expect(byText[0].highlight.id).toBe(h.id);
    expect(byText[0].recording.id).toBe(clips.id);
    expect(byText[0].snippet).toContain(`[${word}]`);

    const fromTranscript = h
      .transcript!.split(" ")
      .find((w) => w.length > 6 && !h.text.includes(w))!;
    const byTranscript = searchHighlights(db, fromTranscript);
    expect(byTranscript).toHaveLength(1);
    expect(byTranscript[0].snippet).toContain(`[${fromTranscript}`);

    expect(searchHighlights(db, `${word} zzzz`)).toEqual([]);
    expect(searchHighlights(db, "%")).toEqual([]);
    expect(searchHighlights(db, "_")).toEqual([]);
    expect(searchHighlights(db, "")).toEqual([]);
  });
});

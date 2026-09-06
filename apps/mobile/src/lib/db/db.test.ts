import type { Recording, Transcript } from "@grist/grain-api";
import page from "@grist/grain-api/fixtures/recordings.json";
import detail from "@grist/grain-api/fixtures/recording.json";
import withClips from "@grist/grain-api/fixtures/recording-with-highlights.json";
import transcript from "@grist/grain-api/fixtures/transcript.json";
import {
  clearAll,
  countRecordings,
  deleteMeta,
  deleteRecordings,
  getMeta,
  getRecording,
  getTranscript,
  highlightsQuery,
  listRecordings,
  meetingTypeOptions,
  participantOptions,
  pruneRecordingsBefore,
  recorderOptions,
  recordingsMissingTranscript,
  searchRecordings,
  searchTranscripts,
  setMeta,
  setTranscript,
  tagOptions,
  teamOptions,
  upsertRecordings,
} from "@/lib/db";
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
    clearAll(db);
    expect(listRecordings(db)).toEqual([]);
    expect(getMeta(db, "k")).toBeNull();
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
});

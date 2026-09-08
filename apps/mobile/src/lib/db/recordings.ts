import { type Recording, splitSummarySections } from "@grist/grain-api";
import {
  and,
  type AnyColumn,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Db } from "./index";
import {
  actionItems,
  highlights,
  meta,
  participants,
  playbackPositions,
  recordings,
  summarySections,
  transcriptSegments,
  transcripts,
} from "./schema";

export type RecordingsFilter = {
  after?: string;
  before?: string;
  scope?: "internal" | "external";
  teamId?: string;
  meetingTypeId?: string;
  title?: string;
  participant?: string;
  participantEmail?: string;
  tag?: string;
  recorderId?: string;
  ids?: readonly string[];
  workspace?: boolean;
  limit?: number;
};

export function upsertRecordings(db: Db, recs: Recording[], syncedAt: string): void {
  db.transaction((tx) => {
    for (const r of recs) {
      const row: typeof recordings.$inferInsert = {
        id: r.id,
        title: r.title,
        source: r.source,
        mediaType: r.media_type,
        shareState: r.share_state,
        workspaceShared: r.workspace_shared ?? null,
        url: r.url,
        thumbnailUrl: r.thumbnail_url ?? null,
        startDatetime: r.start_datetime,
        endDatetime: r.end_datetime ?? null,
        durationMs: r.duration_ms,
        meetingType: r.meeting_type ?? null,
        tags: r.tags,
        teams: r.teams,
        recorders: r.recorders,
        summary: r.ai_summary === undefined ? undefined : (r.ai_summary?.text ?? null),
        privateNotes: r.private_notes === undefined ? undefined : (r.private_notes?.text ?? null),
        calendarEvent: r.calendar_event === undefined ? undefined : (r.calendar_event ?? null),
        screenshares: r.screenshares,
        participantCount: r.participants?.length,
        externalCount: r.participants?.filter((p) => p.scope === "external").length,
        actionItemCount: r.ai_action_items?.length,
        highlightCount: r.highlights?.length,
        syncedAt,
      };
      const { id, ...set } = row;
      tx.insert(recordings).values(row).onConflictDoUpdate({ target: recordings.id, set }).run();

      if (r.participants) {
        tx.delete(participants).where(eq(participants.recordingId, id)).run();
        if (r.participants.length) {
          tx.insert(participants)
            .values(
              r.participants.map((p) => ({
                recordingId: id,
                id: p.id,
                name: p.name,
                email: p.email ?? null,
                scope: p.scope,
                confirmedAttendee: p.confirmed_attendee,
                observedJoinTime: p.observed_join_time ?? null,
                observedLeaveTime: p.observed_leave_time ?? null,
              })),
            )
            .run();
        }
      }

      if (r.ai_action_items) {
        tx.delete(actionItems).where(eq(actionItems.recordingId, id)).run();
        if (r.ai_action_items.length) {
          tx.insert(actionItems)
            .values(
              r.ai_action_items.map((a, position) => ({
                recordingId: id,
                position,
                status: a.status,
                timestamp: a.timestamp,
                text: a.text,
                assignee: a.assignee ?? null,
              })),
            )
            .run();
        }
      }

      if (r.highlights) {
        tx.delete(highlights).where(eq(highlights.recordingId, id)).run();
        if (r.highlights.length) {
          tx.insert(highlights)
            .values(
              r.highlights.map((h) => ({
                id: h.id,
                recordingId: id,
                text: h.text,
                transcript: h.transcript ?? null,
                speakers: h.speakers?.map((s) => s.name) ?? null,
                timestamp: h.timestamp,
                duration: h.duration,
                tags: h.tags,
                url: h.url,
                thumbnailUrl: h.thumbnail_url ?? null,
                createdDatetime: h.created_datetime,
              })),
            )
            .run();
        }
      }

      if (r.ai_summary !== undefined) {
        tx.delete(summarySections).where(eq(summarySections.recordingId, id)).run();
        const sections = r.ai_summary ? splitSummarySections(r.ai_summary.text) : [];
        if (sections.length) {
          tx.insert(summarySections)
            .values(sections.map((s, position) => ({ recordingId: id, position, ...s })))
            .run();
        }
      }

      const names = tx
        .select({ name: participants.name })
        .from(participants)
        .where(eq(participants.recordingId, id))
        .all()
        .map((p) => p.name)
        .join(" ");
      const summary =
        tx
          .select({ summary: recordings.summary })
          .from(recordings)
          .where(eq(recordings.id, id))
          .get()?.summary ?? "";
      tx.run(sql`DELETE FROM recordings_fts WHERE id = ${id}`);
      tx.run(
        sql`INSERT INTO recordings_fts (id, title, summary, participants, tags)
            VALUES (${id}, ${r.title}, ${summary}, ${names}, ${r.tags.join(" ")})`,
      );
    }
  });
}

export function setRecordingTags(db: Db, id: string, tags: string[]): void {
  db.transaction((tx) => {
    tx.update(recordings).set({ tags }).where(eq(recordings.id, id)).run();
    tx.run(sql`UPDATE recordings_fts SET tags = ${tags.join(" ")} WHERE id = ${id}`);
  });
}

export function renameRecording(db: Db, id: string, title: string): void {
  db.transaction((tx) => {
    tx.update(recordings).set({ title }).where(eq(recordings.id, id)).run();
    tx.run(sql`UPDATE recordings_fts SET title = ${title} WHERE id = ${id}`);
  });
}

export function deleteRecordings(db: Db, ids: string[]): void {
  if (!ids.length) return;
  db.transaction((tx) => {
    for (const table of [
      participants,
      actionItems,
      highlights,
      summarySections,
      transcripts,
      transcriptSegments,
      playbackPositions,
    ]) {
      tx.delete(table).where(inArray(table.recordingId, ids)).run();
    }
    tx.delete(recordings).where(inArray(recordings.id, ids)).run();
    tx.run(sql`DELETE FROM recordings_fts WHERE id IN ${ids}`);
    tx.run(sql`DELETE FROM transcript_fts WHERE recording_id IN ${ids}`);
  });
}

export function pruneRecordingsBefore(db: Db, iso: string): string[] {
  const ids = db
    .select({ id: recordings.id })
    .from(recordings)
    .where(lt(recordings.startDatetime, iso))
    .all()
    .map((r) => r.id);
  deleteRecordings(db, ids);
  return ids;
}

export function recordingIds(db: Db, after?: string): string[] {
  return db
    .select({ id: recordings.id })
    .from(recordings)
    .where(after ? gte(recordings.startDatetime, after) : undefined)
    .all()
    .map((r) => r.id);
}

function escapeLike(text: string): string {
  return text.replaceAll(/[\\%_]/g, (c) => `\\${c}`);
}

function filterClauses(f: RecordingsFilter): (SQL | undefined)[] {
  return [
    f.after ? gte(recordings.startDatetime, f.after) : undefined,
    f.before ? lt(recordings.startDatetime, f.before) : undefined,
    f.scope === "external" ? sql`${recordings.externalCount} > 0` : undefined,
    f.scope === "internal" ? eq(recordings.externalCount, 0) : undefined,
    f.teamId ? jsonHasId(recordings.teams, f.teamId) : undefined,
    f.meetingTypeId
      ? sql`json_extract(${recordings.meetingType}, '$.id') = ${f.meetingTypeId}`
      : undefined,
    f.title?.trim()
      ? sql`${recordings.title} LIKE ${`%${escapeLike(f.title.trim())}%`} ESCAPE '\\'`
      : undefined,
    f.participant
      ? sql`EXISTS (SELECT 1 FROM ${participants} WHERE ${participants.recordingId} = ${recordings.id} AND ${participants.name} = ${f.participant})`
      : undefined,
    f.tag
      ? sql`EXISTS (SELECT 1 FROM json_each(${recordings.tags}) WHERE value = ${f.tag})`
      : undefined,
    f.recorderId
      ? sql`EXISTS (SELECT 1 FROM json_each(${recordings.recorders}) WHERE json_extract(value, '$.id') = ${f.recorderId})`
      : undefined,
    f.participantEmail ? attendedBy(f.participantEmail) : undefined,
    f.ids ? (f.ids.length ? inArray(recordings.id, [...f.ids]) : sql`0`) : undefined,
    f.workspace ? eq(recordings.workspaceShared, true) : undefined,
  ];
}

const attendedBy = (email: string) =>
  sql`EXISTS (SELECT 1 FROM ${participants} WHERE ${participants.recordingId} = ${recordings.id} AND lower(${participants.email}) = ${email.toLowerCase()})`;

const externalEmails = sql<string>`(SELECT json_group_array(p.email) FROM participants p
  WHERE p.recording_id = recordings.id AND p.scope = 'external' AND p.email IS NOT NULL)`.as(
  "external_emails",
);

const highlightThumbnailUrl = sql<string | null>`(SELECT h.thumbnail_url FROM highlights h
  WHERE h.recording_id = recordings.id AND h.thumbnail_url IS NOT NULL
  ORDER BY h.timestamp LIMIT 1)`.as("highlight_thumbnail_url");

export function recordingsQuery(db: Db, f: RecordingsFilter = {}) {
  return db
    .select({ ...getTableColumns(recordings), externalEmails, highlightThumbnailUrl })
    .from(recordings)
    .where(and(...filterClauses(f)))
    .orderBy(desc(recordings.startDatetime))
    .limit(f.limit ?? 500);
}

export type RecordingListRow = ReturnType<typeof recordingsQuery>["_"]["result"][number];

export function countRecordings(db: Db, f: RecordingsFilter = {}): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(recordings)
      .where(and(...filterClauses(f)))
      .get()?.n ?? 0
  );
}

export type Option = { id: string; name: string; count: number };

export function participantOptions(db: Db): Option[] {
  return db
    .select({
      id: participants.name,
      name: participants.name,
      count: sql<number>`count(DISTINCT ${participants.recordingId})`,
    })
    .from(participants)
    .groupBy(participants.name)
    .orderBy(sql`count(DISTINCT ${participants.recordingId}) DESC`, participants.name)
    .all();
}

export function tagOptions(db: Db): Option[] {
  return db.all<Option>(sql`
    SELECT value AS id, value AS name, count(*) AS count
    FROM ${recordings}, json_each(${recordings.tags})
    GROUP BY value ORDER BY count DESC, value
  `);
}

export function recorderOptions(db: Db): (Option & { email: string | null })[] {
  return db.all<Option & { email: string | null }>(sql`
    SELECT json_extract(value, '$.id') AS id, min(json_extract(value, '$.name')) AS name,
           min(json_extract(value, '$.email')) AS email, count(*) AS count
    FROM ${recordings}, json_each(${recordings.recorders})
    GROUP BY json_extract(value, '$.id') ORDER BY count DESC, name
  `);
}

export function teamOptions(db: Db): Option[] {
  return db.all<Option>(sql`
    SELECT json_extract(value, '$.id') AS id, min(json_extract(value, '$.name')) AS name, count(*) AS count
    FROM ${recordings}, json_each(${recordings.teams})
    GROUP BY json_extract(value, '$.id') ORDER BY count DESC, name
  `);
}

export function meetingTypeOptions(db: Db): (Option & { scope: string })[] {
  return db.all<Option & { scope: string }>(sql`
    SELECT json_extract(${recordings.meetingType}, '$.id') AS id,
           min(json_extract(${recordings.meetingType}, '$.name')) AS name,
           min(json_extract(${recordings.meetingType}, '$.scope')) AS scope,
           count(*) AS count
    FROM ${recordings} WHERE ${recordings.meetingType} IS NOT NULL
    GROUP BY json_extract(${recordings.meetingType}, '$.id') ORDER BY count DESC, name
  `);
}

export function listRecordings(db: Db, f?: RecordingsFilter) {
  return recordingsQuery(db, f).all();
}

export function recordingQuery(db: Db, id: string) {
  return db.query.recordings.findFirst({
    where: eq(recordings.id, id),
    with: {
      participants: true,
      actionItems: { orderBy: (t, { asc }) => [asc(t.position)] },
      highlights: { orderBy: (t, { asc }) => [asc(t.timestamp)] },
      sections: { orderBy: (t, { asc }) => [asc(t.position)] },
      transcript: true,
    },
  });
}

export function getRecording(db: Db, id: string) {
  return recordingQuery(db, id).sync();
}

export type RecordingDetail = NonNullable<ReturnType<typeof getRecording>>;

export type HighlightsFilter = {
  teamId?: string;
  recorderId?: string;
  participantEmail?: string;
  limit?: number;
};

const jsonHasId = (column: SQL | AnyColumn, id: string) =>
  sql`EXISTS (SELECT 1 FROM json_each(${column}) WHERE json_extract(value, '$.id') = ${id})`;

export function highlightsQuery(db: Db, f: HighlightsFilter = {}) {
  const clauses: (SQL | undefined)[] = [
    f.teamId ? jsonHasId(recordings.teams, f.teamId) : undefined,
    f.recorderId ? jsonHasId(recordings.recorders, f.recorderId) : undefined,
    f.participantEmail ? attendedBy(f.participantEmail) : undefined,
  ];
  return db
    .select({
      highlight: highlights,
      recordingTitle: recordings.title,
      recordingStart: recordings.startDatetime,
      recorders: recordings.recorders,
    })
    .from(highlights)
    .innerJoin(recordings, eq(highlights.recordingId, recordings.id))
    .where(and(...clauses))
    .orderBy(desc(highlights.createdDatetime), desc(recordings.startDatetime), highlights.timestamp)
    .limit(f.limit ?? 200);
}

export type ClipRow = ReturnType<ReturnType<typeof highlightsQuery>["all"]>[number];

export type TeamRow = { id: string; name: string };

export function teamsQuery(db: Db) {
  return db
    .selectDistinct({
      id: sql<string>`json_extract(value, '$.id')`.as("id"),
      name: sql<string>`json_extract(value, '$.name')`.as("name"),
    })
    .from(recordings)
    .innerJoin(sql`json_each(${recordings.teams})`, sql`1 = 1`)
    .orderBy(sql`name`);
}

export function listTeams(db: Db): TeamRow[] {
  return teamsQuery(db).all();
}

export function clearAll(db: Db): void {
  db.transaction((tx) => {
    for (const table of [
      participants,
      actionItems,
      highlights,
      summarySections,
      transcripts,
      transcriptSegments,
      playbackPositions,
      recordings,
      meta,
    ]) {
      tx.delete(table).run();
    }
    tx.run(sql`DELETE FROM recordings_fts`);
    tx.run(sql`DELETE FROM transcript_fts`);
  });
}

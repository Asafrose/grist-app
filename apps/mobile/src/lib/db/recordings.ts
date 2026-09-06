import { type Recording, splitSummarySections } from "@grist/grain-api";
import { and, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import type { Db } from "./index";
import {
  actionItems,
  highlights,
  meta,
  participants,
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

export function recordingsQuery(db: Db, f: RecordingsFilter = {}) {
  const clauses: (SQL | undefined)[] = [
    f.after ? gte(recordings.startDatetime, f.after) : undefined,
    f.before ? lt(recordings.startDatetime, f.before) : undefined,
    f.scope === "external" ? sql`${recordings.externalCount} > 0` : undefined,
    f.scope === "internal" ? eq(recordings.externalCount, 0) : undefined,
    f.teamId
      ? sql`EXISTS (SELECT 1 FROM json_each(${recordings.teams}) WHERE json_extract(value, '$.id') = ${f.teamId})`
      : undefined,
    f.meetingTypeId
      ? sql`json_extract(${recordings.meetingType}, '$.id') = ${f.meetingTypeId}`
      : undefined,
  ];
  return db
    .select()
    .from(recordings)
    .where(and(...clauses))
    .orderBy(desc(recordings.startDatetime))
    .limit(f.limit ?? 500);
}

export function listRecordings(db: Db, f?: RecordingsFilter) {
  return recordingsQuery(db, f).all();
}

export function getRecording(db: Db, id: string) {
  return db.query.recordings
    .findFirst({
      where: eq(recordings.id, id),
      with: {
        participants: true,
        actionItems: { orderBy: (t, { asc }) => [asc(t.position)] },
        highlights: { orderBy: (t, { asc }) => [asc(t.timestamp)] },
        sections: { orderBy: (t, { asc }) => [asc(t.position)] },
        transcript: true,
      },
    })
    .sync();
}

export type RecordingDetail = NonNullable<ReturnType<typeof getRecording>>;

export function highlightsQuery(db: Db, limit = 200) {
  return db
    .select({ highlight: highlights, recordingTitle: recordings.title })
    .from(highlights)
    .innerJoin(recordings, eq(highlights.recordingId, recordings.id))
    .orderBy(desc(highlights.createdDatetime))
    .limit(limit);
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
      recordings,
      meta,
    ]) {
      tx.delete(table).run();
    }
    tx.run(sql`DELETE FROM recordings_fts`);
    tx.run(sql`DELETE FROM transcript_fts`);
  });
}

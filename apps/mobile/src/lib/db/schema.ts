import type { ActionItem, Recording } from "@grist/grain-api";
import { relations } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const json = <T>() => text({ mode: "json" }).$type<T>();

export const meta = sqliteTable("meta", {
  key: text().primaryKey(),
  value: text().notNull(),
});

export const recordings = sqliteTable(
  "recordings",
  {
    id: text().primaryKey(),
    title: text().notNull(),
    source: text().notNull(),
    mediaType: text().notNull(),
    shareState: text().notNull(),
    workspaceShared: integer({ mode: "boolean" }),
    url: text().notNull(),
    thumbnailUrl: text(),
    startDatetime: text().notNull(),
    endDatetime: text(),
    durationMs: integer().notNull(),
    meetingType: json<Recording["meeting_type"]>(),
    tags: json<string[]>().notNull(),
    teams: json<Recording["teams"]>().notNull(),
    recorders: json<Recording["recorders"]>().notNull(),
    summary: text(),
    privateNotes: text(),
    calendarEvent: json<Recording["calendar_event"]>(),
    screenshares: json<Recording["screenshares"]>(),
    participantCount: integer().notNull().default(0),
    externalCount: integer().notNull().default(0),
    actionItemCount: integer().notNull().default(0),
    highlightCount: integer().notNull().default(0),
    syncedAt: text().notNull(),
  },
  (t) => [index("recordings_start_idx").on(t.startDatetime)],
);

export const participants = sqliteTable(
  "participants",
  {
    recordingId: text().notNull(),
    id: text().notNull(),
    name: text().notNull(),
    email: text(),
    scope: text().notNull(),
    confirmedAttendee: integer({ mode: "boolean" }).notNull(),
    observedJoinTime: text(),
    observedLeaveTime: text(),
  },
  (t) => [primaryKey({ columns: [t.recordingId, t.id] })],
);

export const actionItems = sqliteTable(
  "action_items",
  {
    recordingId: text().notNull(),
    position: integer().notNull(),
    status: text().notNull(),
    timestamp: integer().notNull(),
    text: text().notNull(),
    assignee: json<ActionItem["assignee"]>(),
  },
  (t) => [primaryKey({ columns: [t.recordingId, t.position] })],
);

export const highlights = sqliteTable(
  "highlights",
  {
    id: text().primaryKey(),
    recordingId: text().notNull(),
    text: text().notNull(),
    transcript: text(),
    speakers: json<string[]>(),
    timestamp: integer().notNull(),
    duration: integer().notNull(),
    tags: json<string[]>().notNull(),
    url: text().notNull(),
    thumbnailUrl: text(),
    createdDatetime: text().notNull(),
  },
  (t) => [
    index("highlights_recording_idx").on(t.recordingId),
    index("highlights_created_idx").on(t.createdDatetime),
  ],
);

export const summarySections = sqliteTable(
  "summary_sections",
  {
    recordingId: text().notNull(),
    position: integer().notNull(),
    title: text().notNull(),
    markdown: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.recordingId, t.position] })],
);

export const transcripts = sqliteTable("transcripts", {
  recordingId: text().primaryKey(),
  fetchedAt: text().notNull(),
  segmentCount: integer().notNull(),
});

export const transcriptSegments = sqliteTable(
  "transcript_segments",
  {
    recordingId: text().notNull(),
    idx: integer().notNull(),
    participantId: text(),
    speaker: text().notNull(),
    start: integer().notNull(),
    end: integer().notNull(),
    text: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.recordingId, t.idx] })],
);

export const playbackPositions = sqliteTable("playback_positions", {
  recordingId: text().primaryKey(),
  positionSeconds: integer().notNull(),
  updatedAt: text().notNull(),
});

export const recordingOpens = sqliteTable("recording_opens", {
  recordingId: text().primaryKey(),
  openedAt: text().notNull(),
});

export const recordingsRelations = relations(recordings, ({ many, one }) => ({
  participants: many(participants),
  actionItems: many(actionItems),
  highlights: many(highlights),
  sections: many(summarySections),
  transcript: one(transcripts, {
    fields: [recordings.id],
    references: [transcripts.recordingId],
  }),
}));

export const participantsRelations = relations(participants, ({ one }) => ({
  recording: one(recordings, { fields: [participants.recordingId], references: [recordings.id] }),
}));
export const actionItemsRelations = relations(actionItems, ({ one }) => ({
  recording: one(recordings, { fields: [actionItems.recordingId], references: [recordings.id] }),
}));
export const highlightsRelations = relations(highlights, ({ one }) => ({
  recording: one(recordings, { fields: [highlights.recordingId], references: [recordings.id] }),
}));
export const summarySectionsRelations = relations(summarySections, ({ one }) => ({
  recording: one(recordings, {
    fields: [summarySections.recordingId],
    references: [recordings.id],
  }),
}));

export type RecordingRow = typeof recordings.$inferSelect;
export type ParticipantRow = typeof participants.$inferSelect;
export type ActionItemRow = typeof actionItems.$inferSelect;
export type HighlightRow = typeof highlights.$inferSelect;
export type SummarySectionRow = typeof summarySections.$inferSelect;
export type TranscriptSegmentRow = typeof transcriptSegments.$inferSelect;
export type PlaybackPositionRow = typeof playbackPositions.$inferSelect;
export type RecordingOpenRow = typeof recordingOpens.$inferSelect;

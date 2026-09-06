import { z } from "zod";

const knownOr = <T extends [string, ...string[]]>(values: T) => z.enum(values).or(z.string());

export const Source = knownOr([
  "aircall",
  "local_capture",
  "meet",
  "teams",
  "upload",
  "webex",
  "zoom",
  "other",
]);
export const MediaType = knownOr(["audio", "transcript", "video"]);
export const ShareState = knownOr(["public", "workspace", "restricted"]);
export const ParticipantScope = knownOr(["internal", "external", "unknown"]);
export const ActionItemStatus = knownOr(["pending", "completed"]);

export const Team = z.object({ id: z.string(), name: z.string() });
export const User = z.object({ id: z.string(), name: z.string(), email: z.string() });
export const MeetingType = z.object({ id: z.string(), name: z.string(), scope: ParticipantScope });

export const Recorder = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullish(),
  participant_id: z.string().nullish(),
});

export const Participant = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullish(),
  scope: ParticipantScope,
  confirmed_attendee: z.boolean(),
  observed_join_time: z.string().nullish(),
  observed_leave_time: z.string().nullish(),
});

export const Highlight = z.object({
  id: z.string(),
  recording_id: z.string(),
  text: z.string(),
  transcript: z.string().nullish(),
  speakers: z.array(z.object({ name: z.string() }).loose()).nullish(),
  timestamp: z.number(),
  duration: z.number(),
  tags: z.array(z.string()),
  url: z.string(),
  thumbnail_url: z.string().nullish(),
  created_datetime: z.string(),
});

export const ActionItem = z.object({
  status: ActionItemStatus,
  timestamp: z.number(),
  text: z.string(),
  assignee: z.object({ id: z.string(), name: z.string(), user_id: z.string().nullish() }).nullish(),
});

export const TemplateSection = z.object({ title: z.string().optional() }).loose();

export const CalendarEvent = z.object({
  ical_uid: z.string().nullish(),
  scheduled_start_datetime: z.string().nullish(),
  scheduled_end_datetime: z.string().nullish(),
});

export const Screenshare = z.object({
  start: z.number(),
  end: z.number(),
  participant_id: z.string().nullish(),
});

export const Recording = z
  .object({
    id: z.string(),
    title: z.string(),
    source: Source,
    media_type: MediaType,
    share_state: ShareState,
    workspace_shared: z.boolean().optional(),
    url: z.string(),
    thumbnail_url: z.string().nullish(),
    tags: z.array(z.string()),
    start_datetime: z.string(),
    end_datetime: z.string().nullish(),
    duration_ms: z.number(),
    teams: z.array(Team),
    recorders: z.array(Recorder),
    meeting_type: MeetingType.nullish(),
    participants: z.array(Participant).optional(),
    highlights: z.array(Highlight).optional(),
    ai_action_items: z.array(ActionItem).optional(),
    ai_summary: z.object({ text: z.string() }).nullish(),
    ai_template_sections: z.array(TemplateSection).optional(),
    private_notes: z.object({ text: z.string() }).nullish(),
    calendar_event: CalendarEvent.nullish(),
    hubspot: z
      .object({
        hubspot_company_ids: z.array(z.string()),
        hubspot_deal_ids: z.array(z.string()),
      })
      .nullish(),
    screenshares: z.array(Screenshare).optional(),
  })
  .loose();

export const RecordingsPage = z.object({
  cursor: z.string().nullish(),
  recordings: z.array(Recording),
});

export const TranscriptSegment = z.object({
  participant_id: z.string().nullish(),
  speaker: z.string(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
});
export const Transcript = z.array(TranscriptSegment);

export const UsersResponse = z.object({ users: z.array(User) });
export const TeamsResponse = z.object({ teams: z.array(Team) });
export const MeetingTypesResponse = z.object({ meeting_types: z.array(MeetingType) });

export const HookType = knownOr([
  "recording_added",
  "recording_updated",
  "recording_deleted",
  "highlight_added",
  "highlight_updated",
  "highlight_deleted",
  "story_added",
  "story_updated",
  "story_deleted",
  "upload_status",
]);

export const Hook = z.object({
  id: z.string(),
  enabled: z.boolean(),
  hook_url: z.string(),
  hook_type: HookType,
  include: z.record(z.string(), z.unknown()).default({}),
  inserted_at: z.string(),
});
export const HooksResponse = z.object({ hooks: z.array(Hook) });

export const UploadTicket = z.object({
  uuid: z.string(),
  url: z.string(),
  max_duration_sec: z.number(),
  max_upload_bytes: z.number(),
});

export const Success = z.object({ success: z.literal(true) });

export const RecordingFilter = z
  .object({
    before_datetime: z.string(),
    after_datetime: z.string(),
    attendance: z.enum(["hosted", "attended"]),
    participant_scope: z.enum(["internal", "external"]),
    title_search: z.string(),
    team: z.string(),
    meeting_type: z.string(),
  })
  .partial();

export const RecordingInclude = z
  .object({
    highlights: z.boolean(),
    participants: z.boolean(),
    ai_action_items: z.boolean(),
    ai_summary: z.boolean(),
    private_notes: z.boolean(),
    calendar_event: z.boolean(),
    hubspot: z.boolean(),
    screenshares: z.boolean(),
    ai_template_sections: z.object({
      format: z.enum(["json", "markdown", "text"]).optional(),
      allowed_sections: z.array(z.string()).optional(),
    }),
  })
  .partial();

export type Recording = z.infer<typeof Recording>;
export type RecordingsPage = z.infer<typeof RecordingsPage>;
export type Participant = z.infer<typeof Participant>;
export type Recorder = z.infer<typeof Recorder>;
export type Highlight = z.infer<typeof Highlight>;
export type ActionItem = z.infer<typeof ActionItem>;
export type Screenshare = z.infer<typeof Screenshare>;
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;
export type Transcript = z.infer<typeof Transcript>;
export type User = z.infer<typeof User>;
export type Team = z.infer<typeof Team>;
export type MeetingType = z.infer<typeof MeetingType>;
export type Hook = z.infer<typeof Hook>;
export type HookType = z.infer<typeof HookType>;
export type UploadTicket = z.infer<typeof UploadTicket>;
export type RecordingFilter = z.infer<typeof RecordingFilter>;
export type RecordingInclude = z.infer<typeof RecordingInclude>;

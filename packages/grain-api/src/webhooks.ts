import { z } from "zod";
import { Highlight, Recording } from "./schemas";

const Deleted = z.object({ id: z.string() }).loose();
const Story = z.object({ id: z.string() }).loose();
const UploadStatus = z.object({ uuid: z.string() }).loose();

const base = { user_id: z.string().nullish() };

export const WebhookPayload = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("recording_added"), data: Recording }),
  z.object({ ...base, type: z.literal("recording_updated"), data: Recording }),
  z.object({ ...base, type: z.literal("recording_deleted"), data: Deleted }),
  z.object({ ...base, type: z.literal("highlight_added"), data: Highlight }),
  z.object({ ...base, type: z.literal("highlight_updated"), data: Highlight }),
  z.object({ ...base, type: z.literal("highlight_deleted"), data: Deleted }),
  z.object({ ...base, type: z.literal("story_added"), data: Story }),
  z.object({ ...base, type: z.literal("story_updated"), data: Story }),
  z.object({ ...base, type: z.literal("story_deleted"), data: Deleted }),
  z.object({ ...base, type: z.literal("upload_status"), data: UploadStatus }),
]);

export type WebhookPayload = z.infer<typeof WebhookPayload>;

export function parseWebhookPayload(input: unknown): WebhookPayload {
  return WebhookPayload.parse(input);
}

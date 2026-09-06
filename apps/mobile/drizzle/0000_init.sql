CREATE TABLE `action_items` (
	`recording_id` text NOT NULL,
	`position` integer NOT NULL,
	`status` text NOT NULL,
	`timestamp` integer NOT NULL,
	`text` text NOT NULL,
	`assignee` text,
	PRIMARY KEY(`recording_id`, `position`)
);
--> statement-breakpoint
CREATE TABLE `highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`text` text NOT NULL,
	`transcript` text,
	`speakers` text,
	`timestamp` integer NOT NULL,
	`duration` integer NOT NULL,
	`tags` text NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`created_datetime` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `highlights_recording_idx` ON `highlights` (`recording_id`);--> statement-breakpoint
CREATE INDEX `highlights_created_idx` ON `highlights` (`created_datetime`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`recording_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`scope` text NOT NULL,
	`confirmed_attendee` integer NOT NULL,
	`observed_join_time` text,
	`observed_leave_time` text,
	PRIMARY KEY(`recording_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`media_type` text NOT NULL,
	`share_state` text NOT NULL,
	`workspace_shared` integer,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`start_datetime` text NOT NULL,
	`end_datetime` text,
	`duration_ms` integer NOT NULL,
	`meeting_type` text,
	`tags` text NOT NULL,
	`teams` text NOT NULL,
	`recorders` text NOT NULL,
	`summary` text,
	`private_notes` text,
	`calendar_event` text,
	`screenshares` text,
	`participant_count` integer DEFAULT 0 NOT NULL,
	`external_count` integer DEFAULT 0 NOT NULL,
	`action_item_count` integer DEFAULT 0 NOT NULL,
	`highlight_count` integer DEFAULT 0 NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recordings_start_idx` ON `recordings` (`start_datetime`);--> statement-breakpoint
CREATE TABLE `summary_sections` (
	`recording_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`markdown` text NOT NULL,
	PRIMARY KEY(`recording_id`, `position`)
);
--> statement-breakpoint
CREATE TABLE `transcript_segments` (
	`recording_id` text NOT NULL,
	`idx` integer NOT NULL,
	`participant_id` text,
	`speaker` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`text` text NOT NULL,
	PRIMARY KEY(`recording_id`, `idx`)
);
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`recording_id` text PRIMARY KEY NOT NULL,
	`fetched_at` text NOT NULL,
	`segment_count` integer NOT NULL
);

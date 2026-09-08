CREATE TABLE `playback_positions` (
	`recording_id` text PRIMARY KEY NOT NULL,
	`position_seconds` integer NOT NULL,
	`updated_at` text NOT NULL
);

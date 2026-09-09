CREATE TABLE `recording_opens` (
	`recording_id` text PRIMARY KEY NOT NULL,
	`opened_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `recording_opens` (`recording_id`, `opened_at`)
	SELECT `recording_id`, `updated_at` FROM `playback_positions`;

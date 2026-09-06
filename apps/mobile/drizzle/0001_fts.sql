CREATE VIRTUAL TABLE `recordings_fts` USING fts5(
  `id` UNINDEXED, `title`, `summary`, `participants`, `tags`,
  tokenize = 'porter unicode61'
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `transcript_fts` USING fts5(
  `recording_id` UNINDEXED, `idx` UNINDEXED, `text`,
  tokenize = 'porter unicode61'
);

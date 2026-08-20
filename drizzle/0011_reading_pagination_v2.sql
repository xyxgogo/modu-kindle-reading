PRAGMA foreign_keys = ON;

-- Version 1 page numbers were generated with much smaller text and much
-- larger page payloads. The Worker converts each saved position once when a
-- reader resumes, so existing progress remains near the same text offset.
ALTER TABLE reading_progress
  ADD COLUMN pagination_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS reading_progress_pagination_idx
  ON reading_progress(user_id, pagination_version, updated_at);

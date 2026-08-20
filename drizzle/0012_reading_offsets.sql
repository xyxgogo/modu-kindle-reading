PRAGMA foreign_keys = ON;

-- Page numbers change when a different Kindle viewport, font size or line
-- spacing is used. Keep an approximate chapter text offset so the reader can
-- reconstruct the closest page without resetting existing progress.
ALTER TABLE reading_progress
  ADD COLUMN text_offset INTEGER NOT NULL DEFAULT 0;

ALTER TABLE reading_progress
  ADD COLUMN pagination_target INTEGER;

CREATE INDEX IF NOT EXISTS reading_progress_offset_idx
  ON reading_progress(user_id, book_id, chapter_id, text_offset);

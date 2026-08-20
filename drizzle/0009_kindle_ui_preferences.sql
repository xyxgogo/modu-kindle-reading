PRAGMA foreign_keys = ON;

-- UI preferences remain attached to the existing user_id so one shared Kindle
-- never leaks display or weather choices between family members.
ALTER TABLE user_preferences
  ADD COLUMN reading_line_spacing TEXT NOT NULL DEFAULT 'comfortable'
  CHECK(reading_line_spacing IN ('compact','standard','comfortable'));
ALTER TABLE user_preferences
  ADD COLUMN weather_city_name TEXT NOT NULL DEFAULT '昆明';
ALTER TABLE user_preferences
  ADD COLUMN weather_latitude REAL NOT NULL DEFAULT 25.0389;
ALTER TABLE user_preferences
  ADD COLUMN weather_longitude REAL NOT NULL DEFAULT 102.7183;

-- Historical accounts deliberately remain NULL until a real login or product
-- action occurs; this avoids inventing activity timestamps for migrated users.
ALTER TABLE accounts ADD COLUMN last_active_at TEXT;
CREATE INDEX IF NOT EXISTS accounts_last_active_idx
  ON accounts(status, last_active_at);

ALTER TABLE books ADD COLUMN cover_original_key TEXT;
ALTER TABLE books ADD COLUMN cover_thumbnail_key TEXT;
ALTER TABLE books ADD COLUMN cover_media_type TEXT;
ALTER TABLE books ADD COLUMN cover_updated_at TEXT;

CREATE TABLE IF NOT EXISTS user_book_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, book_id)
);
CREATE INDEX IF NOT EXISTS user_book_favorites_idx
  ON user_book_preferences(user_id, is_favorite, updated_at);


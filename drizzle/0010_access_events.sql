PRAGMA foreign_keys = ON;

-- Lightweight page-view history for the administrator. We intentionally do
-- not store IP addresses; source, device class and optional account identity
-- are sufficient for basic product usage checks.
CREATE TABLE IF NOT EXISTS access_events (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '直接访问',
  client_type TEXT NOT NULL DEFAULT '未知设备',
  user_agent TEXT,
  country TEXT,
  visited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS access_events_time_idx
  ON access_events(visited_at DESC);
CREATE INDEX IF NOT EXISTS access_events_account_time_idx
  ON access_events(account_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS access_events_path_time_idx
  ON access_events(path, visited_at DESC);

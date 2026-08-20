PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN profile_type TEXT NOT NULL DEFAULT 'child';
ALTER TABLE user_preferences ADD COLUMN reading_font_scale TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE reading_progress ADD COLUMN reading_font_scale TEXT NOT NULL DEFAULT 'standard';

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  normalized_username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 120000,
  role TEXT NOT NULL DEFAULT 'child' CHECK (role IN ('child', 'parent', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX accounts_role_status_idx ON accounts(role, status);

CREATE TABLE account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX account_sessions_account_idx ON account_sessions(account_id, expires_at);

CREATE TABLE parent_applications (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  review_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX parent_applications_status_idx ON parent_applications(status, created_at);

CREATE TABLE parent_child_bindings (
  id TEXT PRIMARY KEY,
  parent_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  child_identifier TEXT NOT NULL COLLATE NOCASE,
  child_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  bound_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_account_id, child_identifier)
);

CREATE INDEX parent_child_identifier_idx ON parent_child_bindings(child_identifier);

CREATE TABLE assessment_libraries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  question_types_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'approved', 'disabled')),
  created_by_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE parent_child_assessment_assignments (
  id TEXT PRIMARY KEY,
  parent_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  child_identifier TEXT NOT NULL COLLATE NOCASE,
  assessment_library_id TEXT NOT NULL REFERENCES assessment_libraries(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_account_id, child_identifier, assessment_library_id)
);

CREATE INDEX assessment_assignments_child_idx ON parent_child_assessment_assignments(child_identifier, status);

ALTER TABLE books ADD COLUMN uploader_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE books ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE books ADD COLUMN review_notes TEXT;
ALTER TABLE books ADD COLUMN reviewed_by TEXT;
ALTER TABLE books ADD COLUMN submitted_at TEXT;
ALTER TABLE books ADD COLUMN reviewed_at TEXT;

UPDATE books
SET review_status = CASE WHEN status = 'published' THEN 'approved' ELSE 'pending' END,
    reviewed_by = CASE WHEN status = 'published' THEN 'legacy_admin' ELSE NULL END,
    reviewed_at = CASE WHEN status = 'published' THEN updated_at ELSE NULL END;

-- Kindle 正式练习只保留无需输入法的选择、判断类题型。
UPDATE questions
SET verification_status = 'disabled', updated_at = datetime('now')
WHERE question_type IN (
  'en_zh', 'fill_zh', 'morphology', 'passage_fill',
  'sentence_correction', 'spell_zh_en', 'zh_en'
);

INSERT INTO assessment_libraries
  (id, title, description, question_types_json, status, reviewed_by, reviewed_at, created_at, updated_at)
VALUES
  ('assessment_default_kindle', 'Kindle 基础单词考核',
   '系统预留的无输入法考核库，仅包含选择和判断题。',
   '["choice_en_zh","choice_zh_en","grammar_choice","phrase_choice","sentence_fill","tense_choice","true_false"]',
   'approved', 'legacy_admin', datetime('now'), datetime('now'), datetime('now'));

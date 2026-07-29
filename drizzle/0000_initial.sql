PRAGMA foreign_keys = ON;

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  household_id TEXT REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT,
  firmware_version TEXT,
  token_hash TEXT UNIQUE,
  token_hint TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'disabled')),
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX devices_household_status_idx ON devices(household_id, status);

CREATE TABLE device_sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  current_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX device_sessions_device_idx ON device_sessions(device_id, expires_at);

CREATE TABLE device_profiles (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
  user_agent TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  orientation TEXT,
  recommended_font_size INTEGER,
  target_chinese_chars INTEGER,
  target_english_words INTEGER,
  cookie_supported INTEGER,
  javascript_supported INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(household_id, normalized_name)
);

CREATE INDEX users_household_status_idx ON users(household_id, status);

CREATE TABLE user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  reading_font_size TEXT NOT NULL DEFAULT 'medium' CHECK (reading_font_size IN ('small', 'medium', 'large')),
  part_c_enabled INTEGER NOT NULL DEFAULT 0,
  extension_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE books (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  summary TEXT,
  language TEXT,
  recommended_grade TEXT,
  cover_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'preview', 'published', 'disabled')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  total_chapters INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL DEFAULT 0,
  source_notes TEXT,
  rights_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX books_household_status_idx ON books(household_id, status, sort_order);

CREATE TABLE book_files (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  checksum TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  parsing_warnings TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(book_id, sort_order)
);

CREATE TABLE chapter_pages (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  font_size TEXT NOT NULL CHECK (font_size IN ('small', 'medium', 'large')),
  page_number INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chapter_id, font_size, page_number)
);

CREATE TABLE reading_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  page INTEGER NOT NULL DEFAULT 1,
  font_size TEXT NOT NULL DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large')),
  last_read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, book_id)
);

CREATE INDEX reading_progress_user_idx ON reading_progress(user_id, last_read_at);

CREATE TABLE textbook_series (
  id TEXT PRIMARY KEY,
  publisher TEXT NOT NULL,
  series_name TEXT NOT NULL,
  starting_grade TEXT NOT NULL,
  curriculum_standard TEXT NOT NULL,
  version_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(publisher, series_name, version_label)
);

CREATE TABLE textbooks (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES textbook_series(id) ON DELETE RESTRICT,
  grade INTEGER NOT NULL CHECK (grade BETWEEN 3 AND 6),
  semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
  publication_year INTEGER,
  isbn TEXT,
  data_source TEXT,
  verification_status TEXT NOT NULL DEFAULT 'draft' CHECK (verification_status IN ('draft', 'pending', 'verified', 'rejected', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(series_id, grade, semester)
);

CREATE TABLE units (
  id TEXT PRIMARY KEY,
  textbook_id TEXT NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  unit_code TEXT NOT NULL,
  title TEXT NOT NULL,
  theme TEXT,
  is_revision INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(textbook_id, unit_code)
);

CREATE TABLE vocabulary (
  id TEXT PRIMARY KEY,
  lemma TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_form TEXT NOT NULL,
  meaning_zh TEXT,
  part_of_speech TEXT,
  phonetic TEXT,
  plural_form TEXT,
  third_person_singular TEXT,
  present_participle TEXT,
  past_tense TEXT,
  past_participle TEXT,
  comparative_form TEXT,
  superlative_form TEXT,
  irregular INTEGER NOT NULL DEFAULT 0,
  synonyms TEXT,
  antonyms TEXT,
  usage_notes TEXT,
  verification_status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vocabulary_occurrences (
  id TEXT PRIMARY KEY,
  vocabulary_id TEXT NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  textbook_id TEXT NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  learning_level TEXT NOT NULL CHECK (learning_level IN ('required_spell', 'required_recognize', 'required_expression', 'grammar_core', 'phonics_core', 'optional_part_c', 'extension')),
  textbook_section TEXT,
  source_page TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_core INTEGER NOT NULL DEFAULT 0,
  required_spell INTEGER NOT NULL DEFAULT 0,
  required_recognize INTEGER NOT NULL DEFAULT 0,
  data_source TEXT,
  verification_status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vocabulary_id, textbook_id, unit_id, textbook_section)
);

CREATE INDEX vocabulary_occurrences_scope_idx ON vocabulary_occurrences(textbook_id, unit_id, learning_level, verification_status);

CREATE TABLE phrases (
  id TEXT PRIMARY KEY,
  textbook_id TEXT REFERENCES textbooks(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
  content_en TEXT NOT NULL,
  meaning_zh TEXT,
  content_type TEXT,
  core_lemma TEXT,
  usage_structure TEXT,
  replaceable_part TEXT,
  original_example TEXT,
  translation_zh TEXT,
  common_error TEXT,
  learning_level TEXT NOT NULL DEFAULT 'required_expression',
  verification_status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE grammar_points (
  id TEXT PRIMARY KEY,
  textbook_id TEXT REFERENCES textbooks(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  explanation TEXT,
  structure TEXT,
  usage_condition TEXT,
  affirmative_form TEXT,
  negative_form TEXT,
  general_question TEXT,
  special_question TEXT,
  original_examples TEXT,
  common_errors TEXT,
  prerequisites TEXT,
  next_knowledge TEXT,
  verification_status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE phonics_points (
  id TEXT PRIMARY KEY,
  textbook_id TEXT REFERENCES textbooks(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  explanation TEXT,
  examples TEXT,
  verification_status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE content_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_grade INTEGER,
  source_semester INTEGER,
  source_unit TEXT,
  source_section TEXT,
  source_page TEXT,
  generated_flag INTEGER NOT NULL DEFAULT 0,
  verified_by TEXT,
  verified_at TEXT,
  verification_status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE content_reviews (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  reviewer TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  textbook_id TEXT REFERENCES textbooks(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  content_id TEXT,
  difficulty INTEGER NOT NULL DEFAULT 1,
  question_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options_json TEXT,
  correct_answer TEXT NOT NULL,
  acceptable_answers_json TEXT,
  explanation TEXT,
  is_original INTEGER NOT NULL DEFAULT 1,
  verification_status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  include_previous INTEGER NOT NULL DEFAULT 1,
  daily_new_words INTEGER NOT NULL DEFAULT 10,
  daily_review_words INTEGER NOT NULL DEFAULT 20,
  daily_phrases INTEGER NOT NULL DEFAULT 5,
  daily_grammar INTEGER NOT NULL DEFAULT 5,
  weekend_enabled INTEGER NOT NULL DEFAULT 1,
  mistakes_only INTEGER NOT NULL DEFAULT 0,
  part_c_enabled INTEGER NOT NULL DEFAULT 0,
  extension_enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_plan_scopes (
  id TEXT PRIMARY KEY,
  study_plan_id TEXT NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  textbook_id TEXT REFERENCES textbooks(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE practice_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  study_plan_id TEXT REFERENCES study_plans(id) ON DELETE SET NULL,
  scope_json TEXT,
  current_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX practice_sessions_user_status_idx ON practice_sessions(user_id, status);

CREATE TABLE practice_session_items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  sequence_number INTEGER NOT NULL,
  submission_token_hash TEXT NOT NULL UNIQUE,
  answered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, sequence_number)
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  session_item_id TEXT NOT NULL UNIQUE REFERENCES practice_session_items(id) ON DELETE CASCADE,
  answer TEXT,
  is_correct INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX attempts_user_created_idx ON attempts(user_id, created_at);

CREATE TABLE mistakes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
  question_type TEXT NOT NULL,
  wrong_answer TEXT,
  correct_answer TEXT,
  first_wrong_at TEXT NOT NULL,
  last_wrong_at TEXT NOT NULL,
  error_count INTEGER NOT NULL DEFAULT 1,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  mastery_status TEXT NOT NULL DEFAULT 'learning',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, content_id, question_type)
);

CREATE INDEX mistakes_user_priority_idx ON mistakes(user_id, mastery_status, last_wrong_at, error_count);

CREATE TABLE mastery_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  mastery_status TEXT NOT NULL DEFAULT 'learning',
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, content_type, content_id)
);

CREATE TABLE daily_user_stats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date TEXT NOT NULL,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  reading_pages INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, stat_date)
);

CREATE TABLE weather_cache (
  id TEXT PRIMARY KEY,
  provider TEXT,
  location TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL,
  fetched_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  file_key TEXT,
  format TEXT NOT NULL,
  status TEXT NOT NULL,
  summary_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE import_errors (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER,
  content TEXT,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_identifier TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_flashes (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO households (id, name, status)
VALUES ('household_default', '墨读家庭', 'active');

INSERT INTO textbook_series
  (id, publisher, series_name, starting_grade, curriculum_standard, version_label, status)
VALUES
  ('pep_new_2022', '人民教育出版社', '义务教育英语 PEP', '三年级起点', '义务教育英语课程标准 2022 年版', '新版', 'draft');

INSERT INTO textbooks
  (id, series_id, grade, semester, data_source, verification_status)
VALUES
  ('pep_new_g3_s1', 'pep_new_2022', 3, 1, '待录入并审核', 'draft'),
  ('pep_new_g3_s2', 'pep_new_2022', 3, 2, '待录入并审核', 'draft'),
  ('pep_new_g4_s1', 'pep_new_2022', 4, 1, '待录入并审核', 'draft'),
  ('pep_new_g4_s2', 'pep_new_2022', 4, 2, '待录入并审核', 'draft'),
  ('pep_new_g5_s1', 'pep_new_2022', 5, 1, '待录入并审核', 'draft'),
  ('pep_new_g5_s2', 'pep_new_2022', 5, 2, '待录入并审核', 'draft'),
  ('pep_new_g6_s1', 'pep_new_2022', 6, 1, '优先使用用户提供的同版本教材与整理材料', 'pending'),
  ('pep_new_g6_s2', 'pep_new_2022', 6, 2, '仅建立册次记录，禁止在无可靠数据时标记已审核', 'draft');

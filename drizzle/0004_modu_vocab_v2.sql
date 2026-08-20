PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS modu_vocab_sources (
  source_id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, version TEXT,
  license TEXT, official_url TEXT, status TEXT NOT NULL, metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS modu_vocab_lexemes (
  word_id TEXT PRIMARY KEY, lemma TEXT NOT NULL, display_form TEXT NOT NULL, meaning_zh TEXT NOT NULL,
  part_of_speech_json TEXT, ipa TEXT, simple_definition_en TEXT, frequency_rank INTEGER,
  editorial_status TEXT, metadata_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_modu_vocab_lemma ON modu_vocab_lexemes(lemma);
CREATE TABLE IF NOT EXISTS modu_vocab_collections (
  collection_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, collection_type TEXT NOT NULL,
  requires_spelling INTEGER NOT NULL DEFAULT 0, source_id TEXT, metadata_json TEXT,
  FOREIGN KEY(source_id) REFERENCES modu_vocab_sources(source_id)
);
CREATE TABLE IF NOT EXISTS modu_vocab_collection_members (
  collection_id TEXT NOT NULL, word_id TEXT NOT NULL, sort_order INTEGER NOT NULL,
  PRIMARY KEY(collection_id, word_id),
  FOREIGN KEY(collection_id) REFERENCES modu_vocab_collections(collection_id),
  FOREIGN KEY(word_id) REFERENCES modu_vocab_lexemes(word_id)
);
CREATE INDEX IF NOT EXISTS idx_modu_vocab_members_order ON modu_vocab_collection_members(collection_id, sort_order);
CREATE TABLE IF NOT EXISTS modu_vocab_examples (
  example_id TEXT PRIMARY KEY, word_id TEXT NOT NULL, text_en TEXT NOT NULL, translation_zh TEXT,
  source_id TEXT NOT NULL, difficulty_hint TEXT, metadata_json TEXT,
  FOREIGN KEY(word_id) REFERENCES modu_vocab_lexemes(word_id),
  FOREIGN KEY(source_id) REFERENCES modu_vocab_sources(source_id)
);
CREATE INDEX IF NOT EXISTS idx_modu_vocab_examples_word ON modu_vocab_examples(word_id);
CREATE TABLE IF NOT EXISTS modu_vocab_relations (
  relation_id TEXT PRIMARY KEY, from_word_id TEXT NOT NULL, to_word_id TEXT NOT NULL,
  relation_type TEXT NOT NULL, source_id TEXT NOT NULL, note_zh TEXT,
  FOREIGN KEY(from_word_id) REFERENCES modu_vocab_lexemes(word_id),
  FOREIGN KEY(to_word_id) REFERENCES modu_vocab_lexemes(word_id),
  FOREIGN KEY(source_id) REFERENCES modu_vocab_sources(source_id)
);
CREATE INDEX IF NOT EXISTS idx_modu_vocab_rel_from ON modu_vocab_relations(from_word_id);
CREATE TABLE IF NOT EXISTS modu_vocab_field_evidence (
  evidence_id TEXT PRIMARY KEY, word_id TEXT NOT NULL, field_name TEXT NOT NULL,
  source_id TEXT NOT NULL, source_value_json TEXT, normalized_value_json TEXT,
  confidence REAL, note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(word_id) REFERENCES modu_vocab_lexemes(word_id),
  FOREIGN KEY(source_id) REFERENCES modu_vocab_sources(source_id)
);
CREATE TABLE IF NOT EXISTS modu_vocab_user_settings (
  user_id TEXT PRIMARY KEY, batch_size INTEGER NOT NULL DEFAULT 14 CHECK(batch_size IN (7,14,21,28)),
  active_collection_id TEXT NOT NULL DEFAULT 'modu_core_500', spelling_mode INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS modu_vocab_sessions (
  session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, collection_id TEXT NOT NULL,
  batch_size INTEGER NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_modu_vocab_sessions_user ON modu_vocab_sessions(user_id, started_at);
CREATE TABLE IF NOT EXISTS modu_vocab_progress (
  user_id TEXT NOT NULL, word_id TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'new',
  first_seen_at TEXT, last_seen_at TEXT, due_at TEXT, active_success_count INTEGER NOT NULL DEFAULT 0,
  active_failure_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, word_id), FOREIGN KEY(word_id) REFERENCES modu_vocab_lexemes(word_id)
);
CREATE INDEX IF NOT EXISTS idx_modu_vocab_progress_due ON modu_vocab_progress(user_id, due_at);
CREATE TABLE IF NOT EXISTS modu_vocab_learning_events (
  event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, word_id TEXT NOT NULL, session_id TEXT NOT NULL,
  activity_type TEXT NOT NULL, success INTEGER NOT NULL, validated INTEGER NOT NULL DEFAULT 0,
  event_at TEXT NOT NULL, source_context TEXT, payload_json TEXT,
  FOREIGN KEY(word_id) REFERENCES modu_vocab_lexemes(word_id)
);
CREATE INDEX IF NOT EXISTS idx_modu_vocab_events_user_word ON modu_vocab_learning_events(user_id, word_id, event_at);
CREATE TABLE IF NOT EXISTS modu_vocab_reading_exposures (
  exposure_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, word_id TEXT NOT NULL, reading_id TEXT NOT NULL,
  exposure_at TEXT NOT NULL, validated INTEGER NOT NULL DEFAULT 0, validation_event_id TEXT,
  FOREIGN KEY(word_id) REFERENCES modu_vocab_lexemes(word_id)
);
CREATE INDEX IF NOT EXISTS idx_modu_vocab_reading_user ON modu_vocab_reading_exposures(user_id, reading_id);

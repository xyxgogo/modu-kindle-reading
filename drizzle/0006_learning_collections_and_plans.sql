PRAGMA foreign_keys = ON;

-- 学习计划归属：孩子自主，或由绑定家长管理。旧设置默认保持孩子自主。
ALTER TABLE modu_vocab_user_settings ADD COLUMN plan_name TEXT NOT NULL DEFAULT '我的学习计划';
ALTER TABLE modu_vocab_user_settings ADD COLUMN plan_owner TEXT NOT NULL DEFAULT 'child' CHECK(plan_owner IN ('child','parent'));
ALTER TABLE modu_vocab_user_settings ADD COLUMN managed_by_parent_account_id TEXT;

CREATE TABLE IF NOT EXISTS modu_vocab_parent_plans (
  plan_id TEXT PRIMARY KEY,
  parent_account_id TEXT NOT NULL,
  child_identifier TEXT NOT NULL,
  plan_name TEXT NOT NULL DEFAULT '家长制定计划',
  batch_size INTEGER NOT NULL DEFAULT 14 CHECK(batch_size IN (7,14,21,28)),
  collection_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_account_id, child_identifier),
  FOREIGN KEY(collection_id) REFERENCES modu_vocab_collections(collection_id)
);
CREATE INDEX IF NOT EXISTS idx_modu_vocab_parent_plans_child
  ON modu_vocab_parent_plans(child_identifier, active, updated_at);

-- 六年级上册旧词库仍以 vocabulary/vocabulary_occurrences 为源；这里只建立新引擎索引。
INSERT INTO modu_vocab_sources(
  source_id, name, category, version, license, official_url, status, metadata_json
) VALUES (
  'legacy_pep_g6s1', '墨读原六年级上册词库', 'LEGACY_TEXTBOOK', 'v1',
  'user-provided and modu-authored fields; retain original provenance', NULL,
  'INGESTED_FROM_EXISTING_PROJECT', '{"textbook_id":"pep_new_g6_s1","migration":"additive_index_only"}'
) ON CONFLICT(source_id) DO NOTHING;

INSERT INTO modu_vocab_lexemes(
  word_id, lemma, display_form, meaning_zh, part_of_speech_json, ipa,
  simple_definition_en, frequency_rank, editorial_status, metadata_json
)
SELECT
  'legacy_' || v.id,
  lower(trim(v.lemma)),
  v.display_form,
  COALESCE(v.meaning_zh, v.display_form),
  CASE WHEN v.part_of_speech IS NULL OR trim(v.part_of_speech) = '' THEN NULL
       ELSE json_array(v.part_of_speech) END,
  v.phonetic,
  NULL,
  NULL,
  'legacy_verified',
  json_object('legacy_vocabulary_id', v.id, 'textbook_id', 'pep_new_g6_s1')
FROM vocabulary v
JOIN vocabulary_occurrences vo ON vo.vocabulary_id = v.id
WHERE vo.textbook_id = 'pep_new_g6_s1'
  AND vo.verification_status = 'verified'
  AND v.verification_status = 'verified'
  AND NOT EXISTS (
    SELECT 1 FROM modu_vocab_lexemes current
    WHERE lower(trim(current.lemma)) = lower(trim(v.lemma))
  )
GROUP BY v.id
ON CONFLICT(word_id) DO NOTHING;

INSERT INTO modu_vocab_collections(
  collection_id, name, description, collection_type, requires_spelling, source_id, metadata_json
) VALUES (
  'pep_new_g6_s1', '六年级上册 · 全册', '保留的原六年级上册正式词库，共六个单元',
  'textbook', 0, 'legacy_pep_g6s1', '{"grade":6,"semester":1,"legacy_preserved":true}'
) ON CONFLICT(collection_id) DO NOTHING;

INSERT INTO modu_vocab_collections(
  collection_id, name, description, collection_type, requires_spelling, source_id, metadata_json
)
SELECT
  u.id,
  '六年级上册 · ' || u.unit_code,
  u.title,
  'textbook_unit',
  0,
  'legacy_pep_g6s1',
  json_object('grade', 6, 'semester', 1, 'unit_id', u.id, 'legacy_preserved', 1)
FROM units u
WHERE u.textbook_id = 'pep_new_g6_s1' AND u.is_revision = 0 AND u.verification_status = 'verified'
ON CONFLICT(collection_id) DO NOTHING;

-- 整册集合：同一词跨单元出现时只保留最早位置。
INSERT INTO modu_vocab_collection_members(collection_id, word_id, sort_order)
SELECT
  'pep_new_g6_s1',
  l.word_id,
  MIN(u.sort_order * 1000 + vo.sort_order)
FROM vocabulary_occurrences vo
JOIN vocabulary v ON v.id = vo.vocabulary_id
JOIN units u ON u.id = vo.unit_id
JOIN modu_vocab_lexemes l ON lower(trim(l.lemma)) = lower(trim(v.lemma))
WHERE vo.textbook_id = 'pep_new_g6_s1'
  AND vo.verification_status = 'verified'
  AND v.verification_status = 'verified'
  AND u.is_revision = 0
GROUP BY l.word_id
ON CONFLICT(collection_id, word_id) DO NOTHING;

-- 单元集合。
INSERT INTO modu_vocab_collection_members(collection_id, word_id, sort_order)
SELECT
  vo.unit_id,
  l.word_id,
  MIN(vo.sort_order)
FROM vocabulary_occurrences vo
JOIN vocabulary v ON v.id = vo.vocabulary_id
JOIN units u ON u.id = vo.unit_id
JOIN modu_vocab_lexemes l ON lower(trim(l.lemma)) = lower(trim(v.lemma))
WHERE vo.textbook_id = 'pep_new_g6_s1'
  AND vo.verification_status = 'verified'
  AND v.verification_status = 'verified'
  AND u.is_revision = 0
GROUP BY vo.unit_id, l.word_id
ON CONFLICT(collection_id, word_id) DO NOTHING;

-- 原 usage_notes 作为已有例句接入；不改写旧表。
INSERT INTO modu_vocab_examples(
  example_id, word_id, text_en, translation_zh, source_id, difficulty_hint, metadata_json
)
SELECT
  'legacy_example_' || v.id,
  l.word_id,
  trim(v.usage_notes),
  NULL,
  'legacy_pep_g6s1',
  'grade6',
  json_object('legacy_vocabulary_id', v.id)
FROM vocabulary v
JOIN vocabulary_occurrences vo ON vo.vocabulary_id = v.id
JOIN modu_vocab_lexemes l ON lower(trim(l.lemma)) = lower(trim(v.lemma))
WHERE vo.textbook_id = 'pep_new_g6_s1'
  AND vo.verification_status = 'verified'
  AND v.verification_status = 'verified'
  AND v.usage_notes IS NOT NULL
  AND trim(v.usage_notes) != ''
GROUP BY v.id, l.word_id
ON CONFLICT(example_id) DO NOTHING;

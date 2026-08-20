ALTER TABLE modu_vocab_user_settings
  ADD COLUMN IF NOT EXISTS plan_name TEXT NOT NULL DEFAULT '我的学习计划',
  ADD COLUMN IF NOT EXISTS plan_owner TEXT NOT NULL DEFAULT 'child' CHECK(plan_owner IN ('child','parent')),
  ADD COLUMN IF NOT EXISTS managed_by_parent_account_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_configured INTEGER NOT NULL DEFAULT 0 CHECK(plan_configured IN (0,1));

CREATE TABLE IF NOT EXISTS modu_vocab_parent_plans (
  plan_id TEXT PRIMARY KEY,
  parent_account_id TEXT NOT NULL,
  child_identifier TEXT NOT NULL,
  plan_name TEXT NOT NULL DEFAULT '家长制定计划',
  batch_size INTEGER NOT NULL DEFAULT 14 CHECK(batch_size IN (7,14,21,28)),
  collection_id TEXT NOT NULL REFERENCES modu_vocab_collections(collection_id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_account_id, child_identifier)
);

CREATE INDEX IF NOT EXISTS idx_modu_vocab_parent_plans_child
  ON modu_vocab_parent_plans(child_identifier, active, updated_at);

INSERT INTO modu_vocab_collections(
  collection_id, name, description, collection_type, requires_spelling, source_id, metadata_json
) VALUES
  ('modu_core_500_stage_1', '墨读核心500 · 第1阶段', '高频顺序第 1–100 词', 'frequency_stage', 0, 'ngsl_1_2', '{"parent_collection_id":"modu_core_500","from":1,"to":100}'),
  ('modu_core_500_stage_2', '墨读核心500 · 第2阶段', '高频顺序第 101–200 词', 'frequency_stage', 0, 'ngsl_1_2', '{"parent_collection_id":"modu_core_500","from":101,"to":200}'),
  ('modu_core_500_stage_3', '墨读核心500 · 第3阶段', '高频顺序第 201–300 词', 'frequency_stage', 0, 'ngsl_1_2', '{"parent_collection_id":"modu_core_500","from":201,"to":300}'),
  ('modu_core_500_stage_4', '墨读核心500 · 第4阶段', '高频顺序第 301–400 词', 'frequency_stage', 0, 'ngsl_1_2', '{"parent_collection_id":"modu_core_500","from":301,"to":400}'),
  ('modu_core_500_stage_5', '墨读核心500 · 第5阶段', '高频顺序第 401–500 词', 'frequency_stage', 0, 'ngsl_1_2', '{"parent_collection_id":"modu_core_500","from":401,"to":500}')
ON CONFLICT (collection_id) DO NOTHING;

INSERT INTO modu_vocab_collection_members(collection_id, word_id, sort_order)
SELECT
  'modu_core_500_stage_' || (((m.sort_order - 1) / 100) + 1)::INTEGER,
  m.word_id,
  ((m.sort_order - 1) % 100) + 1
FROM modu_vocab_collection_members m
WHERE m.collection_id = 'modu_core_500' AND m.sort_order BETWEEN 1 AND 500
ON CONFLICT (collection_id, word_id) DO NOTHING;

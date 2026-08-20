PRAGMA foreign_keys = ON;

INSERT INTO modu_vocab_collections(
  collection_id, name, description, collection_type, requires_spelling, source_id, metadata_json
) VALUES
  ('modu_core_500_stage_1', '墨读核心500 · 第1阶段', '高频顺序第 1–100 词', 'frequency_stage', 0, 'ngsl_1_2', '{"parent_collection_id":"modu_core_500","from":1,"to":100}'),
  ('modu_core_500_stage_2', '墨读核心500 · 第2阶段', '高频顺序第 101–200 词', 'frequency_stage', 0, 'ngsl_1_2', '{"parent_collection_id":"modu_core_500","from":101,"to":200}'),
  ('modu_core_500_stage_3', '墨读核心500 · 第3阶段', '高频顺序第 201–300 词', 'frequency_stage', 0, 'ngsl_1_2', '{"parent_collection_id":"modu_core_500","from":201,"to":300}'),
  ('modu_core_500_stage_4', '墨读核心500 · 第4阶段', '高频顺序第 301–400 词', 'frequency_stage', 0, 'ngsl_1_2', '{"parent_collection_id":"modu_core_500","from":301,"to":400}'),
  ('modu_core_500_stage_5', '墨读核心500 · 第5阶段', '高频顺序第 401–500 词', 'frequency_stage', 0, 'ngsl_1_2', '{"parent_collection_id":"modu_core_500","from":401,"to":500}')
ON CONFLICT(collection_id) DO NOTHING;

INSERT INTO modu_vocab_collection_members(collection_id, word_id, sort_order)
SELECT
  'modu_core_500_stage_' || CAST(((m.sort_order - 1) / 100 + 1) AS INTEGER),
  m.word_id,
  ((m.sort_order - 1) % 100) + 1
FROM modu_vocab_collection_members m
WHERE m.collection_id = 'modu_core_500' AND m.sort_order BETWEEN 1 AND 500
ON CONFLICT(collection_id, word_id) DO NOTHING;

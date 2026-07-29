PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO content_sources
  (id, source_type, source_title, source_grade, source_semester, generated_flag,
   verified_by, verified_at, verification_status, notes, created_at, updated_at)
VALUES
  ('source_modu_original_questions', 'original_exercise', '墨读原创练习题（六年级上册首批）',
   6, 1, 0, '墨读内容核对', '2026-07-26', 'verified',
   '依据用户提供的新版 PEP 六年级上册词汇、词组和语法结构原创编写，不复制教材原题。',
   datetime('now'), datetime('now'));

INSERT OR IGNORE INTO questions
  (id, textbook_id, unit_id, content_type, content_id, difficulty, question_type,
   prompt, options_json, correct_answer, acceptable_answers_json, explanation,
   is_original, verification_status, created_at, updated_at)
VALUES
  ('q_verified_choice_en_zh', 'pep_new_g6_s1', 'pep_new_g6_s1_u1', 'vocabulary', 'v_3d637fc604995b51', 1,
   'choice_en_zh', '选择 see 的中文意思。', '["看见","跑","拍照","旅行"]', '看见', '["看见了"]',
   'see 表示“看见”，过去式是 saw。', 1, 'verified', datetime('now'), datetime('now')),
  ('q_verified_choice_zh_en', 'pep_new_g6_s1', 'pep_new_g6_s1_u1', 'vocabulary', 'v_1ec558a60b5dda24', 1,
   'choice_zh_en', '选择“去”的英文。', '["go","see","take","run"]', 'go', NULL,
   'go 表示“去”，过去式是 went。', 1, 'verified', datetime('now'), datetime('now')),
  ('q_verified_spell_zh_en', 'pep_new_g6_s1', 'pep_new_g6_s1_u1', 'vocabulary', 'v_53bd7d992ed7edf9', 1,
   'spell_zh_en', '请完整拼写“拿；拍”的英文原形。', NULL, 'take', NULL,
   'take 的过去式是 took。', 1, 'verified', datetime('now'), datetime('now')),
  ('q_verified_fill_zh', 'pep_new_g6_s1', 'pep_new_g6_s1_u1', 'vocabulary', 'v_173d9168467e6c36', 1,
   'fill_zh', '请填写 energy 的中文意思。', NULL, '能源', NULL,
   'energy 表示“能源”。', 1, 'verified', datetime('now'), datetime('now')),
  ('q_verified_morphology', 'pep_new_g6_s1', 'pep_new_g6_s1_u1', 'vocabulary', 'v_df6ad19037c97987', 2,
   'morphology', '填写 run 的一般过去式。', NULL, 'ran', NULL,
   'run 是不规则动词，过去式为 ran。', 1, 'verified', datetime('now'), datetime('now')),
  ('q_verified_phrase_choice', 'pep_new_g6_s1', 'pep_new_g6_s1_u1', 'phrase', 'p_12fab3cd74b43021', 1,
   'phrase_choice', '选择“拍照”的正确固定搭配。', '["take photos","take books","see photos","run photos"]', 'take photos', NULL,
   '“拍照”使用固定搭配 take photos。', 1, 'verified', datetime('now'), datetime('now')),
  ('q_verified_sentence_fill', 'pep_new_g6_s1', 'pep_new_g6_s1_u3', 'phrase', 'p_86f22101a2bd497b', 2,
   'sentence_fill', 'You have a fever. You should ____ a doctor.', '["see","saw","seeing","sees"]', 'see', NULL,
   'should 后面使用动词原形 see。', 1, 'verified', datetime('now'), datetime('now')),
  ('q_verified_zh_en', 'pep_new_g6_s1', 'pep_new_g6_s1_u3', 'grammar', 'p_86f22101a2bd497b', 2,
   'zh_en', '把“你应该去看医生”翻译成英文。', NULL, 'You should see a doctor.', '["You should see a doctor","you should see a doctor."]',
   'should 后接动词原形。', 1, 'verified', datetime('now'), datetime('now')),
  ('q_verified_en_zh', 'pep_new_g6_s1', 'pep_new_g6_s1_u1', 'phrase', 'p_12fab3cd74b43021', 2,
   'en_zh', '把“I took many photos.”翻译成中文。', NULL, '我拍了很多照片。', '["我拍了很多照片","我照了很多照片。","我照了很多照片"]',
   'took photos 表示“拍了照片”。', 1, 'verified', datetime('now'), datetime('now')),
  ('q_verified_passage_fill', 'pep_new_g6_s1', 'pep_new_g6_s1_u1', 'grammar', 'v_1ec558a60b5dda24', 3,
   'passage_fill', '短文填空：Last summer, I ____ to Xi’an with my family. We saw the Terracotta Warriors.', NULL, 'went', NULL,
   'Last summer 表示过去时间，go 的过去式是 went。', 1, 'verified', datetime('now'), datetime('now')),
  ('q_verified_true_false_extra', 'pep_new_g6_s1', 'pep_new_g6_s1_u3', 'grammar', 'p_86f22101a2bd497b', 1,
   'true_false', '判断正误：You should to see a doctor.', '["正确","错误"]', '错误', NULL,
   'should 后直接接动词原形，不加 to。', 1, 'verified', datetime('now'), datetime('now')),
  ('q_verified_correction_extra', 'pep_new_g6_s1', 'pep_new_g6_s1_u1', 'grammar', 'v_1ec558a60b5dda24', 2,
   'sentence_correction', '改正句子：Where did you went last summer?', NULL, 'Where did you go last summer?', '["Where did you go last summer"]',
   'did 后面的动词应使用原形 go。', 1, 'verified', datetime('now'), datetime('now'));

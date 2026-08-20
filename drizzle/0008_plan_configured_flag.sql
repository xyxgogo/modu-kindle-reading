PRAGMA foreign_keys = ON;

ALTER TABLE modu_vocab_user_settings
  ADD COLUMN plan_configured INTEGER NOT NULL DEFAULT 0 CHECK(plan_configured IN (0,1));

-- 已由家长制定且正在生效的计划应视为已完成配置。
UPDATE modu_vocab_user_settings
SET plan_configured = 1
WHERE plan_owner = 'parent';

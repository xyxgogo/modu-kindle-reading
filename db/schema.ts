/**
 * 墨读本地数据结构说明。
 *
 * 可执行的 SQLite 迁移位于 drizzle/。此文件只记录服务端路由使用的
 * 逻辑资源名和核心数据表，不引入运行时 ORM 依赖。
 */
export const bindings = {
  database: "DB",
  files: "BUCKET",
} as const;

export const coreTables = [
  "admins",
  "households",
  "devices",
  "device_sessions",
  "device_profiles",
  "users",
  "accounts",
  "account_sessions",
  "parent_applications",
  "parent_child_bindings",
  "user_preferences",
  "books",
  "book_files",
  "chapters",
  "chapter_pages",
  "reading_progress",
  "textbook_series",
  "textbooks",
  "units",
  "vocabulary",
  "vocabulary_occurrences",
  "phrases",
  "grammar_points",
  "phonics_points",
  "content_sources",
  "content_reviews",
  "questions",
  "assessment_libraries",
  "parent_child_assessment_assignments",
  "study_plans",
  "study_plan_scopes",
  "practice_sessions",
  "practice_session_items",
  "attempts",
  "mistakes",
  "mastery_records",
  "daily_user_stats",
  "weather_cache",
  "settings",
  "import_jobs",
  "import_errors",
  "audit_logs",
] as const;

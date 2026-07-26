/**
 * 墨读 D1 schema contract.
 *
 * The executable migration lives in drizzle/0000_initial.sql so the Sites
 * platform can apply it before the Worker starts. This file documents the
 * logical bindings and the tables used by server-only route handlers without
 * adding a client or runtime ORM dependency to the buildless Worker.
 */
export const bindings = {
  d1: "DB",
  r2: "BUCKET",
} as const;

export const coreTables = [
  "admins",
  "households",
  "devices",
  "device_sessions",
  "device_profiles",
  "users",
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

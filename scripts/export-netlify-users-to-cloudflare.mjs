import { DatabaseSync } from "node:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(process.argv[2] || resolve(projectRoot, ".tmp/netlify-production/kindle.sqlite"));
const outputPath = resolve(projectRoot, ".tmp", "netlify-users-to-cloudflare.sql");
const tables = [
  "households",
  "users",
  "user_preferences",
  "accounts",
  "parent_applications",
  "parent_child_bindings",
  "assessment_libraries",
  "parent_child_assessment_assignments",
  "study_plans",
  "study_plan_scopes",
  "books",
  "book_files",
  "chapters",
  "chapter_pages",
  "devices",
  "reading_progress",
  "practice_sessions",
  "practice_session_items",
  "attempts",
  "mistakes",
  "mastery_records",
  "daily_user_stats",
];

function identifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function valueSql(value) {
  if (value === null || value === undefined) return "NULL";
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `X'${Buffer.from(value).toString("hex")}'`;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const database = new DatabaseSync(sourcePath, { readOnly: true });
const available = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map((row) => row.name));
const statements = ["PRAGMA defer_foreign_keys = TRUE;"];
const counts = {};

for (const table of tables) {
  if (!available.has(table)) continue;
  const columns = database.prepare(`PRAGMA table_info(${identifier(table)})`).all().map((column) => column.name);
  const rows = database.prepare(`SELECT * FROM ${identifier(table)}`).all();
  counts[table] = rows.length;
  if (!rows.length) continue;
  const columnSql = columns.map(identifier).join(", ");
  for (const row of rows) {
    statements.push(`INSERT OR IGNORE INTO ${identifier(table)} (${columnSql}) VALUES (${columns.map((column) => valueSql(row[column])).join(", ")});`);
  }
}

database.close();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${statements.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ source: sourcePath, output: outputPath, counts }));

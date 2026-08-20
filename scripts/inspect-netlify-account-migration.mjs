import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const databasePath = resolve(process.argv[2] || ".tmp/netlify-production/kindle.sqlite");
const database = new DatabaseSync(databasePath, { readOnly: true });

const accounts = database.prepare(`
  SELECT a.id, a.user_id, a.username, a.normalized_username, a.password_iterations,
         a.role, a.status, a.created_at, u.display_name, u.status AS user_status
    FROM accounts a
    LEFT JOIN users u ON u.id = a.user_id
   ORDER BY a.created_at, a.username
`).all();
const availableTables = new Set(database.prepare(`SELECT name FROM sqlite_schema WHERE type = 'table'`).all().map((row) => row.name));
const count = (table) => availableTables.has(table) ? database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count : null;
const counts = Object.fromEntries([
  "users", "accounts", "parent_applications", "parent_child_bindings",
  "reading_progress", "user_preferences", "study_plans", "attempts", "mistakes",
  "mastery_records", "daily_user_stats", "modu_vocab_user_settings", "modu_vocab_user_progress",
].map((table) => [table, count(table)]));
const integrity = database.prepare("PRAGMA integrity_check").get();
const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();

database.close();
console.log(JSON.stringify({
  databasePath,
  tables: [...availableTables].sort(),
  counts,
  accounts: accounts.map((account) => ({
    username: account.username,
    role: account.role,
    status: account.status,
    userStatus: account.user_status,
    passwordIterations: account.password_iterations,
    createdAt: account.created_at,
  })),
  integrity,
  foreignKeyErrors: foreignKeys.length,
}, null, 2));

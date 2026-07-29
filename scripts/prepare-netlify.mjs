import { backup, DatabaseSync } from "node:sqlite";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { applyMigrations } from "../runtime/sqlite-adapter.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDatabasePath = resolve(projectRoot, "local-data", "kindle.sqlite");
const assetRoot = resolve(projectRoot, "netlify", "functions", "_assets");
const seedDatabasePath = resolve(assetRoot, "seed.sqlite");
const migrationNames = [
  "0000_initial.sql",
  "0001_pep_new_seed.sql",
  "0002_verified_question_types.sql",
  "0003_accounts_roles_reviews.sql",
];

await mkdir(assetRoot, { recursive: true });
await rm(seedDatabasePath, { force: true });

try {
  await access(sourceDatabasePath);
  const source = new DatabaseSync(sourceDatabasePath, { readOnly: true });
  await backup(source, seedDatabasePath);
  source.close();
} catch {
  const fresh = new DatabaseSync(seedDatabasePath);
  const migrations = await Promise.all(migrationNames.map(async (name) => ({
    name,
    sql: await readFile(resolve(projectRoot, "drizzle", name), "utf8"),
  })));
  applyMigrations(fresh, migrations);
  fresh.close();
}

const seed = new DatabaseSync(seedDatabasePath);
seed.exec(`
  PRAGMA foreign_keys = ON;
  DELETE FROM account_sessions;
  DELETE FROM device_sessions;
  UPDATE devices SET token_hash = NULL, token_hint = NULL;
  DELETE FROM weather_cache;
  VACUUM;
`);
seed.close();

console.log(`Netlify seed database prepared: ${seedDatabasePath}`);

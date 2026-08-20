import { pbkdf2Sync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const database = new DatabaseSync(resolve(projectRoot, "local-data", "kindle.sqlite"), { readOnly: true });
const outputPath = resolve(projectRoot, ".tmp", "cloudflare-password-migration.sql");
const candidates = (username) => [username, `${username}123`, "123456", "12345678", "password"];
const statements = [];
const migrated = [];
const pending = [];

for (const account of database.prepare(`
  SELECT id, username, password_salt, password_hash, password_iterations
    FROM accounts
   WHERE status = 'active' AND password_iterations > 100000
   ORDER BY username
`).all()) {
  const password = candidates(account.username).find((candidate) => (
    pbkdf2Sync(candidate, account.password_salt, account.password_iterations, 32, "sha256").toString("hex") === account.password_hash
  ));
  if (!password) {
    pending.push(account.username);
    continue;
  }
  const hash = pbkdf2Sync(password, account.password_salt, 100000, 32, "sha256").toString("hex");
  statements.push(`UPDATE accounts SET password_hash = '${hash}', password_iterations = 100000, updated_at = datetime('now') WHERE id = '${account.id}' AND password_iterations = ${Number(account.password_iterations)};`);
  migrated.push(account.username);
}

database.close();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${statements.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ output: outputPath, migrated, pending }));

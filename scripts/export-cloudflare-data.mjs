import { DatabaseSync } from "node:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = resolve(projectRoot, "local-data", "kindle.sqlite");
const outputPath = resolve(projectRoot, ".tmp", "cloudflare-data.sql");
const excludedTables = new Set([
  "_local_migrations",
  "account_sessions",
  "device_sessions",
  "admin_flashes",
  "weather_cache",
]);

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `X'${Buffer.from(value).toString("hex")}'`;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function orderedTables(database) {
  const names = database.prepare(`
    SELECT name FROM sqlite_schema
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name
  `).all().map((row) => row.name).filter((name) => !excludedTables.has(name));
  const available = new Set(names);
  const dependencies = new Map(names.map((name) => [name, new Set()]));
  for (const name of names) {
    for (const foreignKey of database.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(name)})`).all()) {
      if (available.has(foreignKey.table) && foreignKey.table !== name) dependencies.get(name).add(foreignKey.table);
    }
  }
  const result = [];
  const remaining = new Set(names);
  while (remaining.size) {
    const ready = [...remaining].filter((name) => [...dependencies.get(name)].every((parent) => !remaining.has(parent))).sort();
    if (!ready.length) {
      result.push(...[...remaining].sort());
      break;
    }
    for (const name of ready) {
      result.push(name);
      remaining.delete(name);
    }
  }
  return result;
}

const database = new DatabaseSync(databasePath, { readOnly: true });
const tables = orderedTables(database);
const statements = ["PRAGMA defer_foreign_keys = TRUE;"];
let totalRows = 0;

for (const table of tables) {
  const tableInfo = database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
  const columns = tableInfo.map((column) => column.name);
  const primaryKey = tableInfo.filter((column) => column.pk > 0).sort((left, right) => left.pk - right.pk).map((column) => column.name);
  const rows = database.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all();
  totalRows += rows.length;
  if (!rows.length || !columns.length) continue;
  const columnSql = columns.map(quoteIdentifier).join(", ");
  const mutableColumns = columns.filter((column) => !primaryKey.includes(column));
  const conflictSql = primaryKey.length
    ? ` ON CONFLICT (${primaryKey.map(quoteIdentifier).join(", ")}) ${mutableColumns.length
      ? `DO UPDATE SET ${mutableColumns.map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(", ")}`
      : "DO NOTHING"}`
    : "";
  for (const row of rows) {
    const values = columns.map((column) => sqlValue(row[column])).join(", ");
    statements.push(`${primaryKey.length ? "INSERT" : "INSERT OR IGNORE"} INTO ${quoteIdentifier(table)} (${columnSql}) VALUES (${values})${conflictSql};`);
  }
}

statements.push("");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, statements.join("\n"), { encoding: "utf8", mode: 0o600 });
database.close();
console.log(JSON.stringify({ output: outputPath, tables: tables.length, rows: totalRows }));

import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import worker from "../worker/index.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localDataRoot = resolve(projectRoot, "local-data");
const r2Root = resolve(localDataRoot, "r2");
const port = Number(process.env.LOCAL_PORT || 8787);

await mkdir(r2Root, { recursive: true });

const sqlite = new DatabaseSync(resolve(localDataRoot, "kindle.sqlite"));
sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
sqlite.exec("CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");

for (const migration of ["0000_initial.sql", "0001_pep_new_seed.sql", "0002_verified_question_types.sql"]) {
  const applied = sqlite.prepare("SELECT 1 FROM _local_migrations WHERE name = ?").get(migration);
  if (applied) continue;
  const sql = await readFile(resolve(projectRoot, "drizzle", migration), "utf8");
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    sqlite.exec(sql);
    sqlite.prepare("INSERT INTO _local_migrations (name) VALUES (?)").run(migration);
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

class LocalD1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new LocalD1Statement(this.database, this.sql, values);
  }

  async first(column) {
    const row = this.database.prepare(this.sql).get(...this.values);
    if (column !== undefined) return row?.[column] ?? null;
    return row ?? null;
  }

  async all() {
    const results = this.database.prepare(this.sql).all(...this.values);
    return { success: true, results, meta: {} };
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: result.lastInsertRowid == null ? null : Number(result.lastInsertRowid),
      },
    };
  }
}

class LocalD1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new LocalD1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

const bucket = {
  async put(key, value, options = {}) {
    const safeSegments = String(key).split("/").filter(Boolean).map((segment) => encodeURIComponent(segment));
    const target = resolve(r2Root, ...safeSegments);
    if (!target.startsWith(r2Root)) throw new Error("Invalid local R2 key");
    await mkdir(dirname(target), { recursive: true });
    const bytes = typeof value === "string" ? value : Buffer.from(value);
    await writeFile(target, bytes);
    if (options.httpMetadata) {
      await writeFile(`${target}.metadata.json`, JSON.stringify(options.httpMetadata, null, 2));
    }
    return { key };
  },
};

const env = {
  DB: new LocalD1Database(sqlite),
  BUCKET: bucket,
  SESSION_SECRET: process.env.SESSION_SECRET || "local-dev-session-secret",
  CSRF_SECRET: process.env.CSRF_SECRET || "local-dev-csrf-secret",
  DEVICE_TOKEN_SECRET: process.env.DEVICE_TOKEN_SECRET || "local-dev-device-secret",
  WEATHER_API_BASE_URL: process.env.WEATHER_API_BASE_URL || "",
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) for (const item of value) headers.append(name, item);
      else if (value !== undefined) headers.set(name, value);
    }

    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://localhost:${port}${incoming.url || "/"}`, {
      method: incoming.method,
      headers,
      body: ["GET", "HEAD"].includes(incoming.method || "GET") ? undefined : body,
    });
    const response = await worker.fetch(request, env, { waitUntil() {} });

    outgoing.statusCode = response.status;
    for (const [name, value] of response.headers) {
      if (name.toLowerCase() !== "set-cookie") outgoing.setHeader(name, value);
    }
    // Production cookies are Secure. Strip that flag only in the localhost
    // adapter so sessions also work over local HTTP.
    const cookies = (response.headers.getSetCookie?.() || []).map((cookie) => cookie.replace(/;\s*Secure/giu, ""));
    if (cookies.length) outgoing.setHeader("set-cookie", cookies);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.statusCode = 500;
    outgoing.setHeader("content-type", "text/plain; charset=utf-8");
    outgoing.end(`Local server error: ${error.message}`);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`LOCAL_URL=http://localhost:${port}/k`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { applyMigrations, SqliteDatabase } from "../runtime/sqlite-adapter.mjs";
import worker from "../worker/index.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  loadEnvFile(resolve(projectRoot, ".env"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const localDataRoot = resolve(projectRoot, "local-data");
const uploadRoot = resolve(localDataRoot, "uploads");
const port = Number(process.env.LOCAL_PORT || 8787);

function localSecret(name) {
  return process.env[name] || randomBytes(32).toString("base64url");
}

await mkdir(uploadRoot, { recursive: true });

const sqlite = new DatabaseSync(resolve(localDataRoot, "kindle.sqlite"));
sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
const migrationNames = [
  "0000_initial.sql",
  "0001_pep_new_seed.sql",
  "0002_verified_question_types.sql",
  "0003_accounts_roles_reviews.sql",
];
applyMigrations(sqlite, await Promise.all(migrationNames.map(async (name) => ({
  name,
  sql: await readFile(resolve(projectRoot, "drizzle", name), "utf8"),
}))));

const bucket = {
  async put(key, value, options = {}) {
    const safeSegments = String(key).split("/").filter(Boolean).map((segment) => encodeURIComponent(segment));
    const target = resolve(uploadRoot, ...safeSegments);
    if (!target.startsWith(uploadRoot)) throw new Error("Invalid local upload key");
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
  DB: new SqliteDatabase(sqlite),
  BUCKET: bucket,
  SESSION_SECRET: localSecret("SESSION_SECRET"),
  CSRF_SECRET: localSecret("CSRF_SECRET"),
  DEVICE_TOKEN_SECRET: localSecret("DEVICE_TOKEN_SECRET"),
  WEATHER_API_BASE_URL: process.env.WEATHER_API_BASE_URL || "",
  WEATHER_API_KEY: process.env.WEATHER_API_KEY || "",
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
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

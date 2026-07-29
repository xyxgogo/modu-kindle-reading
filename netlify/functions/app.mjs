import { getDeployStore, getStore } from "@netlify/blobs";
import { DatabaseSync } from "node:sqlite";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { applyMigrations, SqliteDatabase } from "../../runtime/sqlite-adapter.mjs";
import application from "../../worker/index.js";

const DATABASE_KEY = "runtime/kindle.sqlite";
const MIGRATION_NAMES = [
  "0000_initial.sql",
  "0001_pep_new_seed.sql",
  "0002_verified_question_types.sql",
  "0003_accounts_roles_reviews.sql",
];

let invocationQueue = Promise.resolve();
let migrationPromise;

function runtimeValue(key) {
  return globalThis.Netlify?.env?.get?.(key) || process.env[key] || "";
}

function runtimeStore(name) {
  const context = globalThis.Netlify?.context?.deploy?.context || process.env.CONTEXT || "";
  if (context === "production") return getStore({ name, consistency: "strong" });
  return getDeployStore({ name, consistency: "strong" });
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next packaged location.
    }
  }
  throw new Error(`Packaged file missing: ${candidates.join(", ")}`);
}

async function loadMigrations() {
  if (!migrationPromise) {
    migrationPromise = Promise.all(MIGRATION_NAMES.map(async (name) => {
      const path = await firstExistingPath([
        resolve(process.cwd(), "drizzle", name),
        resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle", name),
      ]);
      return { name, sql: await readFile(path, "utf8") };
    }));
  }
  return migrationPromise;
}

async function seedDatabase(target) {
  const seedPath = await firstExistingPath([
    resolve(process.cwd(), "netlify/functions/_assets/seed.sqlite"),
    resolve(dirname(fileURLToPath(import.meta.url)), "_assets/seed.sqlite"),
  ]);
  await writeFile(target, await readFile(seedPath));
}

async function handleRequest(request) {
  const databaseStore = runtimeStore("modu-database");
  const uploadStore = runtimeStore("modu-uploads");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "modu-netlify-"));
  const databasePath = join(temporaryRoot, "kindle.sqlite");
  let sqlite;

  try {
    const stored = await databaseStore.get(DATABASE_KEY, { type: "arrayBuffer" });
    if (stored) await writeFile(databasePath, Buffer.from(stored));
    else await seedDatabase(databasePath);

    sqlite = new DatabaseSync(databasePath);
    sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;");
    applyMigrations(sqlite, await loadMigrations());

    const bucket = {
      async put(key, value, options = {}) {
        const bytes = typeof value === "string" ? value : Buffer.from(value);
        await uploadStore.set(String(key), bytes, {
          metadata: {
            contentType: options.httpMetadata?.contentType || "application/octet-stream",
          },
        });
        return { key };
      },
    };

    const response = await application.fetch(request, {
      DB: new SqliteDatabase(sqlite),
      BUCKET: bucket,
      SESSION_SECRET: runtimeValue("SESSION_SECRET"),
      CSRF_SECRET: runtimeValue("CSRF_SECRET"),
      DEVICE_TOKEN_SECRET: runtimeValue("DEVICE_TOKEN_SECRET"),
      WEATHER_API_BASE_URL: runtimeValue("WEATHER_API_BASE_URL"),
      WEATHER_API_KEY: runtimeValue("WEATHER_API_KEY"),
      ADMIN_USERNAME: runtimeValue("ADMIN_USERNAME"),
      ADMIN_PASSWORD: runtimeValue("ADMIN_PASSWORD"),
    }, { waitUntil() {} });

    sqlite.exec("PRAGMA optimize;");
    sqlite.close();
    sqlite = null;
    await databaseStore.set(DATABASE_KEY, await readFile(databasePath), {
      metadata: { format: "sqlite", updatedAt: new Date().toISOString() },
    });
    return response;
  } finally {
    if (sqlite) sqlite.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export default async (request) => {
  const current = invocationQueue.then(() => handleRequest(request));
  invocationQueue = current.catch(() => {});
  try {
    return await current;
  } catch (error) {
    console.error("netlify_runtime_failed", error);
    return new Response("墨读暂时无法读取持久化数据，请稍后重试。", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
};

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { applyMigrations, SqliteDatabase } from "../runtime/sqlite-adapter.mjs";
import { MIGRATION_NAMES } from "../runtime/migrations.mjs";
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
applyMigrations(sqlite, await Promise.all(MIGRATION_NAMES.map(async (name) => ({
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
  async get(key) {
    const safeSegments = String(key).split("/").filter(Boolean).map((segment) => encodeURIComponent(segment));
    const target = resolve(uploadRoot, ...safeSegments);
    if (!target.startsWith(uploadRoot)) throw new Error("Invalid local upload key");
    try {
      const bytes = await readFile(target);
      let httpMetadata = {};
      try { httpMetadata = JSON.parse(await readFile(`${target}.metadata.json`, "utf8")); } catch { /* optional metadata */ }
      return {
        body: bytes,
        httpMetadata,
        async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
      };
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  },
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      const safeSegments = String(key).split("/").filter(Boolean).map((segment) => encodeURIComponent(segment));
      const target = resolve(uploadRoot, ...safeSegments);
      if (!target.startsWith(uploadRoot)) throw new Error("Invalid local upload key");
      await rm(target, { force: true });
      await rm(`${target}.metadata.json`, { force: true });
    }
  },
};

const assetContentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
});

const localAssets = {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const relative = pathname.replace(/^\/+/, "");
    const target = resolve(projectRoot, "public", relative);
    const publicRoot = resolve(projectRoot, "public");
    if (!target.startsWith(publicRoot)) return new Response("Not found", { status: 404 });
    try {
      const bytes = await readFile(target);
      const extension = target.slice(target.lastIndexOf(".")).toLocaleLowerCase("en-US");
      return new Response(request.method === "HEAD" ? null : bytes, {
        headers: {
          "cache-control": "public, max-age=3600",
          "content-type": assetContentTypes[extension] || "application/octet-stream",
          "x-content-type-options": "nosniff",
        },
      });
    } catch (error) {
      if (error?.code === "ENOENT") return new Response("Not found", { status: 404 });
      throw error;
    }
  },
};

const env = {
  DB: new SqliteDatabase(sqlite),
  BUCKET: bucket,
  ASSETS: localAssets,
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
    const background = [];
    const response = await worker.fetch(request, env, { waitUntil(promise) { background.push(Promise.resolve(promise)); } });
    await Promise.allSettled(background);

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

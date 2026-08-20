import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "local-data", "legacy-migration-secret.txt");
const secret = randomBytes(48).toString("base64url");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, secret, { encoding: "utf8", mode: 0o600 });
process.stdout.write(secret);

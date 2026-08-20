import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const credentialPath = resolve(projectRoot, "local-data", "cloudflare-admin-credentials.txt");
const adminUsername = "admin";
const adminPassword = randomBytes(18).toString("base64url");
const secrets = {
  SESSION_SECRET: randomBytes(48).toString("base64url"),
  CSRF_SECRET: randomBytes(48).toString("base64url"),
  DEVICE_TOKEN_SECRET: randomBytes(48).toString("base64url"),
  ADMIN_USERNAME: adminUsername,
  ADMIN_PASSWORD: adminPassword,
};

await mkdir(dirname(credentialPath), { recursive: true });
await writeFile(credentialPath, `Cloudflare 管理员账号：${adminUsername}\nCloudflare 管理员密码：${adminPassword}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
process.stdout.write(JSON.stringify(secrets));
process.stderr.write(`Cloudflare 管理员凭据已保存到：${credentialPath}\n`);

import assert from "node:assert/strict";
import { pbkdf2 } from "node:crypto";
import test from "node:test";
import { promisify } from "node:util";

const derive = promisify(pbkdf2);

test("Node crypto PBKDF2 uses the Cloudflare-compatible 100000-iteration format", async () => {
  const result = await derive("sample-password", "sample-salt", 100000, 32, "sha256");
  assert.equal(result.toString("hex"), "b5fff2c241030c70ceff10f95a4d36a0d1a39316444c0fba664c2e5b40858188");
});

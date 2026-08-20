import assert from "node:assert/strict";
import test from "node:test";

import { PostgresRepository } from "../src/platform/postgres-repository.mjs";
import { assertModuRepository } from "../src/platform/modu-repository.mjs";

test("Postgres 备用适配器满足统一仓储契约且不绑定 SDK", () => {
  const repository = new PostgresRepository({ async query() { return { rows: [] }; } });
  assert.equal(assertModuRepository(repository), repository);
});

test("仓储契约会拒绝不完整实现", () => {
  assert.throws(() => assertModuRepository({}), /missing listLexemes/);
});

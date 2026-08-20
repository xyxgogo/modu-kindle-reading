import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import test from "node:test";

import { applyMigrations, SqliteDatabase } from "../runtime/sqlite-adapter.mjs";
import { D1Repository } from "../src/platform/d1-repository.mjs";
import { assertModuRepository } from "../src/platform/modu-repository.mjs";
import { planSession } from "../src/domain/learning-engine.mjs";

async function createRepository() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const names = ["0004_modu_vocab_v2.sql", "0005_seed_modu_core_500.sql", "0007_core_learning_stages.sql"];
  const migrations = await Promise.all(names.map(async (name) => ({
    name,
    sql: await readFile(resolve("drizzle", name), "utf8"),
  })));
  applyMigrations(sqlite, migrations);
  const repository = assertModuRepository(new D1Repository(new SqliteDatabase(sqlite)));
  return { sqlite, repository, migrations };
}

test("正式核心词集可按固定顺序读取 500 词", async (context) => {
  const { sqlite, repository } = await createRepository();
  context.after(() => sqlite.close());
  const words = await repository.listLexemes("modu_core_500", 500);
  assert.equal(words.length, 500);
  assert.equal(words[0].id, "en_the");
  assert.equal(words[0].meaningZh, "这/那；该（定冠词）");
  assert.equal(words.at(-1).id.length > 0, true);
});

test("词条详情按数据能力返回例句，不在仓储层生成内容", async (context) => {
  const { sqlite, repository } = await createRepository();
  context.after(() => sqlite.close());
  const words = await repository.listLexemes("modu_core_500", 500);
  let found = null;
  for (const word of words) {
    const candidate = await repository.getLexeme(word.id);
    if (candidate.examples.length) {
      found = candidate;
      break;
    }
  }
  assert.ok(found);
  assert.ok(found.examples[0].text);
  assert.ok(found.examples[0].source.sourceId);
});

test("学习事件写入、进度重建和 eventId 幂等", async (context) => {
  const { sqlite, repository } = await createRepository();
  context.after(() => sqlite.close());
  const event = {
    eventId: "test_event_1",
    wordId: "en_good",
    sessionId: "test_session_1",
    at: "2026-08-13T00:00:00.000Z",
    activity: "recognize",
    success: true,
  };
  await repository.saveEvent("existing-user-id", event);
  await repository.saveEvent("existing-user-id", event);

  const progress = await repository.getProgress("existing-user-id", "en_good");
  assert.equal(progress.stage, "initial");
  assert.equal(progress.events.length, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM modu_vocab_learning_events").get().count, 1);
  assert.equal((await repository.listProgress("existing-user-id")).length, 1);
});

test("真实 500 词候选可交给学习引擎生成 7 词微单元", async (context) => {
  const { sqlite, repository } = await createRepository();
  context.after(() => sqlite.close());
  const words = await repository.listLexemes("modu_core_500", 28);
  const plan = planSession({
    batchSize: 14,
    nowIso: "2026-08-13T00:00:00.000Z",
    progresses: await repository.listProgress("existing-user-id"),
    candidateNewWordIds: words.map((word) => word.id),
  });
  assert.equal(plan.newWordIds.length, 14);
  assert.deepEqual(plan.microUnits.map((unit) => unit.length), [7, 7]);
});

test("schema 与种子迁移可以重复应用", async (context) => {
  const { sqlite, migrations } = await createRepository();
  context.after(() => sqlite.close());
  for (const migration of migrations) sqlite.exec(migration.sql);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM modu_vocab_lexemes").get().count, 500);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM modu_vocab_collection_members WHERE collection_id = 'modu_core_500'").get().count, 500);
  assert.equal(sqlite.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("核心500可以按五个真实词频阶段选择", async (context) => {
  const { sqlite, repository } = await createRepository();
  context.after(() => sqlite.close());
  for (let stage = 1; stage <= 5; stage += 1) {
    const words = await repository.listLexemes(`modu_core_500_stage_${stage}`, 500);
    assert.equal(words.length, 100);
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLearningEvent,
  createProgress,
  evaluateStage,
  planSession,
} from "../src/domain/learning-engine.mjs";
import { availableActivities } from "../src/domain/lexicon.mjs";

const word = {
  id: "en_good",
  lemma: "good",
  meaningZh: "好的；有益的",
  examples: [{ text: "This is good." }],
  collectionIds: ["modu_core_500"],
  requiresSpelling: false,
  sources: [],
};

test("每日学习量仅接受 7/14/21/28，并按 7 词拆分", () => {
  for (const batchSize of [7, 14, 21, 28]) {
    const plan = planSession({
      batchSize,
      nowIso: "2026-08-13T00:00:00.000Z",
      progresses: [],
      candidateNewWordIds: Array.from({ length: 28 }, (_, index) => `word_${index}`),
    });
    assert.equal(plan.newWordIds.length, batchSize);
    assert.deepEqual(plan.microUnits.map((unit) => unit.length), Array(batchSize / 7).fill(7));
  }
  assert.throws(() => planSession({
    batchSize: 10,
    nowIso: "2026-08-13T00:00:00.000Z",
    progresses: [],
    candidateNewWordIds: [],
  }), /Unsupported batch size/);
});

test("初次成功只进入初识", () => {
  const progress = applyLearningEvent(createProgress(word.id), word, {
    eventId: "event_1",
    wordId: word.id,
    sessionId: "session_1",
    at: "2026-08-01T00:00:00.000Z",
    activity: "recognize",
    success: true,
  });
  assert.equal(progress.stage, "initial");
});

test("熟悉需要跨成功会话、主动回忆和语境成功", () => {
  let progress = createProgress(word.id);
  const events = [
    ["session_1", "2026-08-01T00:00:00.000Z", "recognize"],
    ["session_2", "2026-08-02T00:00:00.000Z", "recall"],
    ["session_2", "2026-08-02T00:05:00.000Z", "context"],
  ];
  events.forEach(([sessionId, at, activity], index) => {
    progress = applyLearningEvent(progress, word, {
      eventId: `event_${index}`,
      wordId: word.id,
      sessionId,
      at,
      activity,
      success: true,
    });
  });
  assert.equal(evaluateStage(progress, word, "2026-08-02T00:05:00.000Z"), "familiar");
});

test("失败事件不会被计为掌握所需的跨会话", () => {
  let progress = createProgress(word.id);
  for (let index = 0; index < 5; index += 1) {
    progress = applyLearningEvent(progress, word, {
      eventId: `failure_${index}`,
      wordId: word.id,
      sessionId: `failed_session_${index}`,
      at: `2026-08-0${index + 1}T00:00:00.000Z`,
      activity: "recall",
      success: false,
    });
  }
  assert.equal(evaluateStage(progress, word, "2026-08-13T00:00:00.000Z"), "initial");
});

test("掌握不能靠同一天、同一会话刷题获得", () => {
  let progress = createProgress(word.id);
  for (let index = 0; index < 8; index += 1) {
    progress = applyLearningEvent(progress, word, {
      eventId: `same_day_${index}`,
      wordId: word.id,
      sessionId: "same_session",
      at: `2026-08-01T0${index}:00:00.000Z`,
      activity: index % 2 ? "recall" : "context",
      success: true,
    });
  }
  assert.notEqual(evaluateStage(progress, word, "2026-08-01T09:00:00.000Z"), "mastered");
});

test("复习压力受上限约束，并自动减少新词", () => {
  const progresses = Array.from({ length: 60 }, (_, index) => ({
    wordId: `due_${index}`,
    stage: "initial",
    dueAt: "2026-08-01T00:00:00.000Z",
    events: [],
  }));
  const plan = planSession({
    batchSize: 14,
    nowIso: "2026-08-13T00:00:00.000Z",
    progresses,
    candidateNewWordIds: Array.from({ length: 28 }, (_, index) => `new_${index}`),
  });
  assert.equal(plan.reviewWordIds.length, 28);
  assert.equal(plan.newWordIds.length, 7);
});

test("活动由词条真实字段决定", () => {
  assert.deepEqual(availableActivities(word), ["recognize", "meaning", "recall", "context", "use"]);
});

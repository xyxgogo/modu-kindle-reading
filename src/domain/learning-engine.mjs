export const BATCH_SIZES = Object.freeze([7, 14, 21, 28]);
export const VISIBLE_STAGES = Object.freeze(["new", "initial", "familiar", "mastered"]);

export const DEFAULT_ENGINE_CONFIG = Object.freeze({
  batchSizes: BATCH_SIZES,
  microUnitSize: 7,
  reviewStepsDays: Object.freeze([1, 2, 4, 7, 14, 30]),
  maxReviewItemsPerSession: 28,
});

const DAY = 86_400_000;

function utcMs(value) {
  const result = new Date(value).getTime();
  if (!Number.isFinite(result)) throw new TypeError(`Invalid ISO date: ${value}`);
  return result;
}

function addDaysIso(value, days) {
  return new Date(utcMs(value) + days * DAY).toISOString();
}

function successful(progress, activity) {
  return progress.events.filter((event) => event.success && (!activity || event.activity === activity));
}

function distinctSuccessfulSessions(progress) {
  return new Set(successful(progress).map((event) => event.sessionId)).size;
}

function hasContextSuccess(progress) {
  return successful(progress, "context").length > 0
    || successful(progress, "reading").some((event) => event.validated);
}

function recentActiveFailures(progress, count = 3) {
  return progress.events
    .filter((event) => ["recall", "context", "use", "spelling"].includes(event.activity))
    .slice(-count)
    .filter((event) => !event.success)
    .length;
}

export function evaluateStage(progress, word, nowIso) {
  if (!progress.firstSeenAt || progress.events.length === 0) return "new";

  const successCount = successful(progress).length;
  const sessions = distinctSuccessfulSessions(progress);
  const recallOk = successful(progress, "recall").length > 0;
  const contextOk = hasContextSuccess(progress);
  const spellingOk = !word.requiresSpelling || successful(progress, "spelling").length > 0;
  const ageDays = Math.floor((utcMs(nowIso) - utcMs(progress.firstSeenAt)) / DAY);

  if (
    successCount >= 5
    && sessions >= 4
    && ageDays >= 7
    && recallOk
    && contextOk
    && spellingOk
    && recentActiveFailures(progress, 3) < 2
  ) return "mastered";

  if (successCount >= 3 && sessions >= 2 && recallOk && contextOk) return "familiar";
  return "initial";
}

function nextIntervalDays(progress, success, config) {
  if (!success) return 1;
  const activeSuccesses = progress.events.filter((event) => (
    event.success && ["recall", "context", "reading", "use", "spelling"].includes(event.activity)
  )).length;
  return config.reviewStepsDays[Math.min(activeSuccesses, config.reviewStepsDays.length - 1)];
}

export function applyLearningEvent(current, word, event, config = DEFAULT_ENGINE_CONFIG) {
  const firstSeenAt = current.firstSeenAt ?? event.at;
  const events = [...current.events, event];
  const draft = {
    ...current,
    firstSeenAt,
    lastSeenAt: event.at,
    events,
    dueAt: addDaysIso(event.at, nextIntervalDays({ ...current, events }, event.success, config)),
  };
  return { ...draft, stage: evaluateStage(draft, word, event.at) };
}

export function createProgress(wordId) {
  return { wordId, stage: "new", events: [] };
}

function reviewPriority(progress, nowIso) {
  if (!progress.dueAt) return Number.NEGATIVE_INFINITY;
  const overdueDays = (utcMs(nowIso) - utcMs(progress.dueAt)) / DAY;
  const failures = recentActiveFailures(progress, 5);
  const stageWeight = progress.stage === "initial" ? 30 : progress.stage === "familiar" ? 20 : 10;
  return overdueDays * 5 + failures * 20 + stageWeight;
}

/**
 * 无复习债务：只挑选当前最值得复现的有限数量，其余留在调度池，不显示待办欠账。
 */
export function planSession({ batchSize, nowIso, progresses, candidateNewWordIds, config = DEFAULT_ENGINE_CONFIG }) {
  if (!config.batchSizes.includes(batchSize)) throw new RangeError("Unsupported batch size");

  const reviewWordIds = progresses
    .filter((progress) => progress.dueAt && utcMs(progress.dueAt) <= utcMs(nowIso))
    .sort((left, right) => reviewPriority(right, nowIso) - reviewPriority(left, nowIso))
    .slice(0, config.maxReviewItemsPerSession)
    .map((progress) => progress.wordId);

  const reviewPressure = Math.min(1, reviewWordIds.length / config.maxReviewItemsPerSession);
  const newAllowance = Math.max(0, Math.round(batchSize * (1 - 0.5 * reviewPressure)));
  const newWordIds = candidateNewWordIds.slice(0, newAllowance);
  const microUnits = [];
  for (let index = 0; index < newWordIds.length; index += config.microUnitSize) {
    microUnits.push(newWordIds.slice(index, index + config.microUnitSize));
  }

  return { batchSize, reviewWordIds, newWordIds, microUnits };
}

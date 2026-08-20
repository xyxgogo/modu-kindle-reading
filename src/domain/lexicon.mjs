export const ACTIVITY_TYPES = Object.freeze([
  "recognize",
  "meaning",
  "recall",
  "context",
  "association",
  "reading",
  "use",
  "spelling",
]);

/**
 * 数据能力驱动学习：字段缺失时跳过对应活动，不在运行时编造内容。
 */
export function availableActivities(word) {
  const activities = ["recognize", "meaning", "recall"];
  if (word.examples?.length) activities.push("context");
  if (word.collocations?.length || word.wordFamily?.length || word.synonyms?.length || word.antonyms?.length) {
    activities.push("association");
  }
  if (word.examples?.length || word.collocations?.length) activities.push("use");
  if (word.requiresSpelling) activities.push("spelling");
  return [...new Set(activities)];
}

export function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

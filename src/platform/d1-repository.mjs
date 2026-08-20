import { applyLearningEvent, createProgress } from "../domain/learning-engine.mjs";
import { parseJsonArray } from "../domain/lexicon.mjs";

function rows(result) {
  return result?.results ?? [];
}

function toBoolean(value) {
  return value === true || value === 1 || value === "1";
}

function toLexeme(row, examples = []) {
  return {
    id: row.word_id,
    lemma: row.lemma,
    displayForm: row.display_form,
    meaningZh: row.meaning_zh,
    partOfSpeech: parseJsonArray(row.part_of_speech_json),
    ipa: row.ipa || undefined,
    simpleDefinitionEn: row.simple_definition_en || undefined,
    examples,
    collectionIds: row.collection_id ? [row.collection_id] : [],
    frequencyRank: row.frequency_rank ?? undefined,
    requiresSpelling: toBoolean(row.requires_spelling),
    sources: row.source_id ? [{ sourceId: row.source_id }] : [],
  };
}

function toEvent(row) {
  return {
    eventId: row.event_id,
    wordId: row.word_id,
    sessionId: row.session_id,
    at: row.event_at,
    activity: row.activity_type,
    success: toBoolean(row.success),
    validated: toBoolean(row.validated),
  };
}

export class D1Repository {
  constructor(database) {
    if (!database?.prepare) throw new TypeError("D1Repository requires a D1-compatible database binding");
    this.database = database;
  }

  async listLexemes(collectionId, limit = 100) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const result = await this.database.prepare(`
      SELECT l.*, m.collection_id, c.requires_spelling, c.source_id
      FROM modu_vocab_collection_members m
      JOIN modu_vocab_lexemes l ON l.word_id = m.word_id
      JOIN modu_vocab_collections c ON c.collection_id = m.collection_id
      WHERE m.collection_id = ?
      ORDER BY m.sort_order
      LIMIT ?
    `).bind(collectionId, safeLimit).all();
    return rows(result).map((row) => toLexeme(row));
  }

  async getLexeme(wordId) {
    const row = await this.database.prepare(`
      SELECT l.*, m.collection_id, c.requires_spelling, c.source_id
      FROM modu_vocab_lexemes l
      LEFT JOIN modu_vocab_collection_members m ON m.word_id = l.word_id
      LEFT JOIN modu_vocab_collections c ON c.collection_id = m.collection_id
      WHERE l.word_id = ?
      ORDER BY m.sort_order
      LIMIT 1
    `).bind(wordId).first();
    if (!row) return null;

    const exampleResult = await this.database.prepare(`
      SELECT text_en, translation_zh, source_id
      FROM modu_vocab_examples
      WHERE word_id = ?
      ORDER BY example_id
    `).bind(wordId).all();
    const examples = rows(exampleResult).map((example) => ({
      text: example.text_en,
      translationZh: example.translation_zh || undefined,
      source: { sourceId: example.source_id },
    }));
    return toLexeme(row, examples);
  }

  async getProgress(userId, wordId) {
    const row = await this.database.prepare(`
      SELECT * FROM modu_vocab_progress WHERE user_id = ? AND word_id = ?
    `).bind(userId, wordId).first();
    if (!row) return null;
    return this.#hydrateProgress(row);
  }

  async listProgress(userId) {
    const [progressResult, eventResult] = await Promise.all([
      this.database.prepare(`
        SELECT * FROM modu_vocab_progress WHERE user_id = ? ORDER BY updated_at, word_id
      `).bind(userId).all(),
      this.database.prepare(`
        SELECT * FROM modu_vocab_learning_events
        WHERE user_id = ? ORDER BY event_at, event_id
      `).bind(userId).all(),
    ]);
    const eventsByWord = new Map();
    for (const row of rows(eventResult)) {
      const events = eventsByWord.get(row.word_id) || [];
      events.push(toEvent(row));
      eventsByWord.set(row.word_id, events);
    }
    return rows(progressResult).map((row) => ({
      wordId: row.word_id,
      stage: row.stage,
      firstSeenAt: row.first_seen_at || undefined,
      lastSeenAt: row.last_seen_at || undefined,
      dueAt: row.due_at || undefined,
      events: eventsByWord.get(row.word_id) || [],
    }));
  }

  async #hydrateProgress(row) {
    const eventResult = await this.database.prepare(`
      SELECT * FROM modu_vocab_learning_events
      WHERE user_id = ? AND word_id = ?
      ORDER BY event_at, event_id
    `).bind(row.user_id, row.word_id).all();
    return {
      wordId: row.word_id,
      stage: row.stage,
      firstSeenAt: row.first_seen_at || undefined,
      lastSeenAt: row.last_seen_at || undefined,
      dueAt: row.due_at || undefined,
      events: rows(eventResult).map(toEvent),
    };
  }

  async saveEvent(userId, event) {
    if (!event?.eventId) throw new TypeError("Learning event requires an eventId for idempotency");
    const duplicate = await this.database.prepare(`
      SELECT 1 AS found FROM modu_vocab_learning_events WHERE event_id = ?
    `).bind(event.eventId).first();
    if (duplicate) return;

    const word = await this.getLexeme(event.wordId);
    if (!word) throw new Error(`Unknown word: ${event.wordId}`);
    const current = await this.getProgress(userId, event.wordId) ?? createProgress(event.wordId);
    const next = applyLearningEvent(current, word, event);
    const successCount = next.events.filter((item) => item.success).length;
    const failureCount = next.events.filter((item) => !item.success).length;

    await this.database.batch([
      this.database.prepare(`
        INSERT INTO modu_vocab_learning_events(
          event_id, user_id, word_id, session_id, activity_type, success,
          validated, event_at, source_context, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO NOTHING
      `).bind(
        event.eventId,
        userId,
        event.wordId,
        event.sessionId,
        event.activity,
        event.success ? 1 : 0,
        event.validated ? 1 : 0,
        event.at,
        event.sourceContext || null,
        event.payload ? JSON.stringify(event.payload) : null,
      ),
      this.database.prepare(`
        INSERT INTO modu_vocab_progress(
          user_id, word_id, stage, first_seen_at, last_seen_at, due_at,
          active_success_count, active_failure_count, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, word_id) DO UPDATE SET
          stage = excluded.stage,
          first_seen_at = excluded.first_seen_at,
          last_seen_at = excluded.last_seen_at,
          due_at = excluded.due_at,
          active_success_count = excluded.active_success_count,
          active_failure_count = excluded.active_failure_count,
          updated_at = excluded.updated_at
      `).bind(
        userId,
        event.wordId,
        next.stage,
        next.firstSeenAt,
        next.lastSeenAt,
        next.dueAt,
        successCount,
        failureCount,
        event.at,
      ),
    ]);
  }
}

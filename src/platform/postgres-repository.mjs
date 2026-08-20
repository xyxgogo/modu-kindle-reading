import { applyLearningEvent, createProgress } from "../domain/learning-engine.mjs";
import { parseJsonArray } from "../domain/lexicon.mjs";

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

/**
 * Postgres fallback adapter. The injected client only needs a `query(text, values)`
 * method, so Netlify Database, pg and other Postgres clients stay outside the core.
 */
export class PostgresRepository {
  constructor(client) {
    if (!client?.query) throw new TypeError("PostgresRepository requires a query-compatible client");
    this.client = client;
  }

  async listLexemes(collectionId, limit = 100) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const result = await this.client.query(`
      SELECT l.*, m.collection_id, c.requires_spelling, c.source_id
      FROM modu_vocab_collection_members m
      JOIN modu_vocab_lexemes l ON l.word_id = m.word_id
      JOIN modu_vocab_collections c ON c.collection_id = m.collection_id
      WHERE m.collection_id = $1
      ORDER BY m.sort_order
      LIMIT $2
    `, [collectionId, safeLimit]);
    return result.rows.map((row) => toLexeme(row));
  }

  async getLexeme(wordId) {
    const result = await this.client.query(`
      SELECT l.*, m.collection_id, c.requires_spelling, c.source_id
      FROM modu_vocab_lexemes l
      LEFT JOIN modu_vocab_collection_members m ON m.word_id = l.word_id
      LEFT JOIN modu_vocab_collections c ON c.collection_id = m.collection_id
      WHERE l.word_id = $1
      ORDER BY m.sort_order
      LIMIT 1
    `, [wordId]);
    const row = result.rows[0];
    if (!row) return null;
    const examples = await this.client.query(`
      SELECT text_en, translation_zh, source_id
      FROM modu_vocab_examples
      WHERE word_id = $1
      ORDER BY example_id
    `, [wordId]);
    return toLexeme(row, examples.rows.map((example) => ({
      text: example.text_en,
      translationZh: example.translation_zh || undefined,
      source: { sourceId: example.source_id },
    })));
  }

  async getProgress(userId, wordId) {
    const result = await this.client.query(`
      SELECT * FROM modu_vocab_progress WHERE user_id = $1 AND word_id = $2
    `, [userId, wordId]);
    return result.rows[0] ? this.#hydrateProgress(result.rows[0]) : null;
  }

  async listProgress(userId) {
    const result = await this.client.query(`
      SELECT * FROM modu_vocab_progress WHERE user_id = $1 ORDER BY updated_at, word_id
    `, [userId]);
    return Promise.all(result.rows.map((row) => this.#hydrateProgress(row)));
  }

  async #hydrateProgress(row) {
    const events = await this.client.query(`
      SELECT * FROM modu_vocab_learning_events
      WHERE user_id = $1 AND word_id = $2
      ORDER BY event_at, event_id
    `, [row.user_id, row.word_id]);
    return {
      wordId: row.word_id,
      stage: row.stage,
      firstSeenAt: row.first_seen_at || undefined,
      lastSeenAt: row.last_seen_at || undefined,
      dueAt: row.due_at || undefined,
      events: events.rows.map(toEvent),
    };
  }

  async saveEvent(userId, event) {
    if (!event?.eventId) throw new TypeError("Learning event requires an eventId for idempotency");
    const duplicate = await this.client.query(
      "SELECT 1 AS found FROM modu_vocab_learning_events WHERE event_id = $1",
      [event.eventId],
    );
    if (duplicate.rows.length) return;

    const word = await this.getLexeme(event.wordId);
    if (!word) throw new Error(`Unknown word: ${event.wordId}`);
    const current = await this.getProgress(userId, event.wordId) ?? createProgress(event.wordId);
    const next = applyLearningEvent(current, word, event);
    const successCount = next.events.filter((item) => item.success).length;
    const failureCount = next.events.filter((item) => !item.success).length;

    await this.client.query("BEGIN");
    try {
      const inserted = await this.client.query(`
        INSERT INTO modu_vocab_learning_events(
          event_id, user_id, word_id, session_id, activity_type, success,
          validated, event_at, source_context, payload_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `, [
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
      ]);
      if (inserted.rows.length) {
        await this.client.query(`
          INSERT INTO modu_vocab_progress(
            user_id, word_id, stage, first_seen_at, last_seen_at, due_at,
            active_success_count, active_failure_count, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (user_id, word_id) DO UPDATE SET
            stage = excluded.stage,
            first_seen_at = excluded.first_seen_at,
            last_seen_at = excluded.last_seen_at,
            due_at = excluded.due_at,
            active_success_count = excluded.active_success_count,
            active_failure_count = excluded.active_failure_count,
            updated_at = excluded.updated_at
        `, [
          userId,
          event.wordId,
          next.stage,
          next.firstSeenAt,
          next.lastSeenAt,
          next.dueAt,
          successCount,
          failureCount,
          event.at,
        ]);
      }
      await this.client.query("COMMIT");
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }
}

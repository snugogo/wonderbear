// ============================================================================
// Unit tests for liveDialogueTurn() in src/services/llm.js
//
// Covers field-name fallback (workorder 2026-04-29-server-dialogue-llm-fix
// §3.1/§3.2): when Gemini emits any of the alternative shapes (canonical
// `nextQuestion`, `question` string, snake-case `next_question.text`), the
// helper must coerce them into the `{ text, textLearning }` contract.
//
// fetch is mocked globally; no network is touched.
// ============================================================================

// Set required env vars BEFORE importing llm.js (which imports config/env.js
// that fails fast on missing infra keys). GEMINI_API_KEY only has to be
// truthy — fetch is mocked so the value never reaches the wire.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://x:x@localhost:5432/x';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  'test_dummy_jwt_secret_at_least_32_bytes_long_abc123';
process.env.GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || 'test_dummy_gemini_key_for_unit_tests';
delete process.env.USE_MOCK_AI;

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { liveDialogueTurn } = await import('../src/services/llm.js');

/**
 * Stub global.fetch so the next call returns a Gemini-shaped envelope whose
 * inner JSON body is `bodyText`. Returns the captured request init for
 * inspection.
 */
function stubFetchOnce(bodyText) {
  let captured;
  global.fetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            { content: { parts: [{ text: bodyText }] } },
          ],
        };
      },
    };
  };
  return () => captured;
}

test('liveDialogueTurn: canonical parsed.nextQuestion passes through', async () => {
  stubFetchOnce(
    JSON.stringify({
      nextQuestion: {
        text: 'Where do they go on the adventure?',
        textLearning: 'Dokąd wyruszą na przygodę?',
      },
    }),
  );

  const out = await liveDialogueTurn({
    systemPrompt: 'sp',
    history: [],
    userInput: 'a brave bear',
    round: 2,
    roundCount: 5,
    primaryLang: 'en',
    learningLang: 'pl',
  });

  assert.equal(out.done, false);
  assert.ok(out.nextQuestion, 'nextQuestion must not be null');
  assert.equal(out.nextQuestion.text, 'Where do they go on the adventure?');
  assert.equal(out.nextQuestion.textLearning, 'Dokąd wyruszą na przygodę?');
});

test('liveDialogueTurn: parsed.question (string) is wrapped to {text, textLearning:null}', async () => {
  stubFetchOnce(
    JSON.stringify({ question: 'What does the hero do next?' }),
  );

  const out = await liveDialogueTurn({
    systemPrompt: 'sp',
    history: [],
    userInput: 'hello bear',
    round: 2,
    roundCount: 5,
    primaryLang: 'en',
    learningLang: 'none',
  });

  assert.equal(out.done, false);
  assert.ok(out.nextQuestion, 'nextQuestion must not be null');
  assert.equal(out.nextQuestion.text, 'What does the hero do next?');
  assert.equal(out.nextQuestion.textLearning, null);
});

test('liveDialogueTurn: parsed.next_question.text is wrapped to {text, textLearning:null}', async () => {
  stubFetchOnce(
    JSON.stringify({
      next_question: { text: 'Snake-case fallback works.' },
    }),
  );

  const out = await liveDialogueTurn({
    systemPrompt: 'sp',
    history: [],
    userInput: 'a friendly fox',
    round: 3,
    roundCount: 5,
    primaryLang: 'en',
    learningLang: 'none',
  });

  assert.equal(out.done, false);
  assert.ok(out.nextQuestion, 'nextQuestion must not be null');
  assert.equal(out.nextQuestion.text, 'Snake-case fallback works.');
  assert.equal(out.nextQuestion.textLearning, null);
});

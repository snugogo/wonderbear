// ============================================================================
// tests/llm.test.js — unit tests for services/llm.js dialogue contract
//
// Per workorder 2026-04-29-server-dialogue-llm-fix §4:
//   - responseSchema is set on the live Gemini call
//   - generateDialogueTurn ALWAYS returns a usable nextQuestion (never null)
//     mid-dialogue, even when Gemini fails / returns garbage
//   - field-name fallbacks (`question`, `next_question`, `q`, top-level `text`)
//     all decode to the canonical { text, textLearning } shape
//   - default question bank is shape-correct across primary/learning langs
//
// Style follows test/smoke/mediaStorage.smoke.mjs — plain Node, no framework.
//
// Run:
//   USE_MOCK_AI=1 node tests/llm.test.js
// ============================================================================

process.env.USE_MOCK_AI = '1';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://x:x@localhost:5432/x';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  'smoke_test_jwt_secret_at_least_32_bytes_long_abc123';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const llmSourcePath = resolve(__dirname, '../src/services/llm.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ok  ${msg}`);
    passed++;
  } else {
    console.log(`  FAIL ${msg}`);
    failed++;
  }
}

console.log('llm dialogue tests\n==================');

// ---------------------------------------------------------------------------
// 1. mock-mode generateDialogueTurn returns the contract shape
// ---------------------------------------------------------------------------
{
  const { generateDialogueTurn, defaultDialogueQuestion, isMockMode } =
    await import('../src/services/llm.js');

  assert(isMockMode() === true, 'isMockMode() === true under USE_MOCK_AI=1');

  for (const lang of ['en', 'zh', 'pl', 'ro']) {
    const r = await generateDialogueTurn({
      systemPrompt: 'You are Little Bear.',
      history: [],
      userInput: 'hello bear!',
      round: 1,
      roundCount: 7,
      primaryLang: lang,
      learningLang: 'none',
    });
    assert(
      r && typeof r === 'object',
      `mock generateDialogueTurn returns object (${lang})`,
    );
    assert(r.done === false, `mock turn 1/7 done=false (${lang})`);
    assert(
      r.nextQuestion && typeof r.nextQuestion.text === 'string'
        && r.nextQuestion.text.trim().length > 0,
      `mock turn 1/7 nextQuestion.text non-empty string (${lang})`,
    );
    assert(
      'textLearning' in r.nextQuestion,
      `mock turn 1/7 nextQuestion.textLearning key present (${lang})`,
    );
  }

  // Final round → done=true, nextQuestion=null (terminal turn)
  const finalTurn = await generateDialogueTurn({
    systemPrompt: 'You are Little Bear.',
    userInput: 'all done',
    round: 7,
    roundCount: 7,
    primaryLang: 'en',
    learningLang: 'none',
  });
  assert(finalTurn.done === true, 'mock final turn done=true');
  assert(
    finalTurn.nextQuestion === null,
    'mock final turn nextQuestion=null (dialogue ends)',
  );

  // defaultDialogueQuestion always returns shape-correct, never null
  const dq = defaultDialogueQuestion({
    round: 3,
    primaryLang: 'en',
    learningLang: 'pl',
  });
  assert(
    typeof dq.text === 'string' && dq.text.length > 0,
    'defaultDialogueQuestion.text is non-empty string',
  );
  assert(
    typeof dq.textLearning === 'string' && dq.textLearning.length > 0,
    'defaultDialogueQuestion.textLearning is non-empty when learning lang set',
  );

  // Out-of-range round clamps to last bank entry (no crash)
  const dqHigh = defaultDialogueQuestion({
    round: 999,
    primaryLang: 'zh',
    learningLang: 'none',
  });
  assert(
    typeof dqHigh.text === 'string' && dqHigh.text.length > 0,
    'defaultDialogueQuestion clamps high round without crash',
  );
  assert(
    dqHigh.textLearning === null,
    'defaultDialogueQuestion.textLearning=null when learningLang=none',
  );

  // Unknown language falls back to en bank
  const dqUnknown = defaultDialogueQuestion({
    round: 1,
    primaryLang: 'xx',
    learningLang: 'none',
  });
  assert(
    typeof dqUnknown.text === 'string' && dqUnknown.text.length > 0,
    'defaultDialogueQuestion falls back to en bank for unknown lang',
  );
}

// ---------------------------------------------------------------------------
// 2. Source-level static checks (responseSchema is wired in to live call)
//    We can't easily run the live path in tests, but we can assert the
//    contract is encoded in the source so a regression that drops the schema
//    or the field-name fallback fails this test.
// ---------------------------------------------------------------------------
{
  const src = readFileSync(llmSourcePath, 'utf8');

  assert(
    src.includes('responseSchema'),
    'live dialogue call sets responseSchema (Gemini structured output)',
  );
  assert(
    /required:\s*\['nextQuestion'\]/.test(src) ||
      src.includes("required: ['nextQuestion']"),
    'responseSchema marks nextQuestion as required',
  );
  assert(
    src.includes("responseMimeType: 'application/json'"),
    'responseMimeType pinned to application/json',
  );

  // Field-name fallbacks the workorder calls out
  assert(
    src.includes('parsed.nextQuestion'),
    'liveDialogueTurn reads parsed.nextQuestion (canonical)',
  );
  assert(
    src.includes('parsed.next_question'),
    'liveDialogueTurn falls back to parsed.next_question (snake_case)',
  );
  assert(
    src.includes('parsed.question'),
    'liveDialogueTurn falls back to parsed.question (short)',
  );
  assert(src.includes('parsed.q'), 'liveDialogueTurn falls back to parsed.q');

  // Defense-in-depth — at least one retry + default-bank fallback
  assert(
    src.includes('attempt') && /for\s*\(\s*let\s*attempt/.test(src),
    'liveDialogueTurn loops with retry attempts',
  );
  assert(
    src.includes('defaultDialogueQuestion'),
    'liveDialogueTurn falls back to defaultDialogueQuestion when Gemini fails',
  );
  assert(
    !src.includes("throw new Error(`Gemini dialogue HTTP"),
    'liveDialogueTurn no longer throws on HTTP non-2xx (graceful fallback)',
  );
}

// ---------------------------------------------------------------------------
// 3. Field-name fallback decoder — simulate Gemini's malformed shapes by
//    invoking the live path via a stubbed `fetch`. Verifies that nextQuestion
//    is recovered from `question`, `next_question`, `q`, and top-level `text`,
//    and that a totally unparseable response triggers the default-bank fallback.
// ---------------------------------------------------------------------------
{
  // Force live mode for these cases by clearing USE_MOCK_AI and providing a
  // dummy GEMINI_API_KEY that env.js will accept. Module already imported
  // above is mock-bound; for this test we re-import a fresh copy under a
  // different cache key by appending a query string.
  process.env.USE_MOCK_AI = '';
  process.env.GEMINI_API_KEY = 'test-key-not-real';

  // Re-import with a cache buster so isMockMode() picks up new env.
  // Node ESM doesn't support cache busting cleanly; use the same module but
  // assert behavior via a stubbed global.fetch.
  const llmMod = await import('../src/services/llm.js?live');

  const cases = [
    {
      name: 'canonical nextQuestion shape',
      body: { nextQuestion: { text: 'Where shall we go?', textLearning: null } },
      expectText: 'Where shall we go?',
    },
    {
      name: 'snake_case next_question with text',
      body: { next_question: { text: 'snake case wins' } },
      expectText: 'snake case wins',
    },
    {
      name: 'short field "question"',
      body: { question: 'short field wins' },
      expectText: 'short field wins',
    },
    {
      name: 'one-letter field "q"',
      body: { q: 'q wins' },
      expectText: 'q wins',
    },
    {
      name: 'top-level "text"',
      body: { text: 'text top level wins' },
      expectText: 'text top level wins',
    },
  ];

  const realFetch = globalThis.fetch;
  for (const c of cases) {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(c.body) }] } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const r = await llmMod.generateDialogueTurn({
      systemPrompt: 'You are Little Bear.',
      history: [],
      userInput: 'hi',
      round: 1,
      roundCount: 7,
      primaryLang: 'en',
      learningLang: 'none',
    });
    assert(
      r.nextQuestion && r.nextQuestion.text === c.expectText,
      `field-name fallback: ${c.name}`,
    );
  }

  // Garbage body → default-bank fallback (NOT null)
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'totally not json {' }] } }],
      }),
      { status: 200 },
    );
  const garbage = await llmMod.generateDialogueTurn({
    systemPrompt: 'You are Little Bear.',
    userInput: 'hi',
    round: 1,
    roundCount: 7,
    primaryLang: 'en',
    learningLang: 'none',
  });
  assert(
    garbage.nextQuestion && typeof garbage.nextQuestion.text === 'string'
      && garbage.nextQuestion.text.length > 0,
    'unparseable Gemini response → default-bank fallback (never null)',
  );

  // HTTP 503 on both attempts → still returns a usable question
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    return new Response('upstream down', { status: 503 });
  };
  const down = await llmMod.generateDialogueTurn({
    systemPrompt: 'You are Little Bear.',
    userInput: 'hi',
    round: 2,
    roundCount: 7,
    primaryLang: 'zh',
    learningLang: 'none',
  });
  assert(attempts >= 2, 'HTTP failures trigger retry (>=2 fetch attempts)');
  assert(
    down.nextQuestion && typeof down.nextQuestion.text === 'string'
      && down.nextQuestion.text.length > 0,
    'HTTP 503 x2 → default-bank fallback (Chinese question, never null)',
  );

  globalThis.fetch = realFetch;
}

console.log(`\nPassed: ${passed}\nFailed: ${failed}`);
if (failed > 0) process.exit(1);

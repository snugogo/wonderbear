// ============================================================================
// dialogue-cocreation.test.mjs — unit tests for v7.2 dialogue rewrite.
//
// Run: node test/dialogue-cocreation.test.mjs
// (no DB / Redis needed — pure module tests)
// ============================================================================

process.env.USE_MOCK_AI = '1'; // force mock LLM
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke_test_jwt_secret_at_least_32_bytes_long_abc123';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://fake:fake@localhost/fake';

import assert from 'node:assert/strict';

import {
  evaluateReply,
  shouldForceFinish,
  tokenize,
  extractQuestionKeywords,
} from '../src/services/dialogue-quality.js';
import {
  buildDialogueSystemPromptV2,
  DIALOGUE_ARC_STEPS,
  buildDialogueFirstQuestion,
} from '../src/utils/storyPrompt.js';
import {
  generateDialogueTurnV2,
  defaultDialogueTurnV2,
  __test as llmTest,
} from '../src/services/llm.js';

let pass = 0;
let fail = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail++;
    errors.push({ name, err: e });
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail++;
    errors.push({ name, err: e });
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n[1] dialogue-quality — tokenize + keywords');
// ---------------------------------------------------------------------------

test('tokenize en — drops punctuation', () => {
  const t = tokenize('A blue dragon, please!', 'en');
  assert.deepEqual(t, ['a', 'blue', 'dragon', 'please']);
});

test('tokenize zh — per character, drops punctuation', () => {
  const t = tokenize('一只蓝色的小龙。', 'zh');
  assert.ok(t.length >= 5, `got ${JSON.stringify(t)}`);
  assert.ok(t.includes('龙'));
});

test('tokenize empty', () => {
  assert.deepEqual(tokenize('', 'en'), []);
  assert.deepEqual(tokenize('   ', 'en'), []);
});

test('extractQuestionKeywords drops stopwords', () => {
  const k = extractQuestionKeywords('Who is the hero of tonight\'s story?', 'en');
  assert.ok(!k.includes('the'));
  assert.ok(!k.includes('is'));
  assert.ok(k.includes('hero'));
  assert.ok(k.includes('story'));
});

// ---------------------------------------------------------------------------
console.log('\n[2] dialogue-quality — evaluateReply tiers');
// ---------------------------------------------------------------------------

test('evaluateReply empty → suggestMode=storyteller', () => {
  const q = evaluateReply({ replyText: '', locale: 'en' });
  assert.equal(q.vocabulary, 'empty');
  assert.equal(q.suggestMode, 'storyteller');
});

test('evaluateReply single word "You" → empty (stopword) → storyteller', () => {
  const q = evaluateReply({ replyText: 'You', locale: 'en' });
  assert.equal(q.vocabulary, 'empty');
  assert.equal(q.suggestMode, 'storyteller');
});

test('evaluateReply "a dragon" → basic → storyteller', () => {
  const q = evaluateReply({ replyText: 'a dragon', locale: 'en' });
  assert.equal(q.vocabulary, 'basic');
  assert.equal(q.suggestMode, 'storyteller');
});

test('evaluateReply rich → cheerleader', () => {
  const q = evaluateReply({
    replyText: 'I want a brave dragon flying through bright clouds today',
    locale: 'en',
  });
  assert.equal(q.vocabulary, 'rich');
  assert.equal(q.suggestMode, 'cheerleader');
});

test('evaluateReply onTopic detects keyword overlap', () => {
  const q = evaluateReply({
    replyText: 'a friendly dragon',
    previousQuestionText: 'What kind of dragon will join the hero?',
    locale: 'en',
  });
  assert.equal(q.onTopic, true);
});

test('evaluateReply zh basic', () => {
  const q = evaluateReply({ replyText: '小龙', locale: 'zh' });
  // zh basic = wordCount<4 OR uniqueWordCount<3 (per-char tokens, 2 chars meaningful)
  assert.equal(q.vocabulary, 'basic');
});

// ---------------------------------------------------------------------------
console.log('\n[3] dialogue-quality — shouldForceFinish');
// ---------------------------------------------------------------------------

test('shouldForceFinish triggers after 3 empty user turns', () => {
  const history = [
    { role: 'user', text: 'You', round: 1 },
    { role: 'assistant', text: '...', round: 2 },
    { role: 'user', text: 'You', round: 2 },
    { role: 'assistant', text: '...', round: 3 },
    { role: 'user', text: 'You', round: 3 },
  ];
  assert.equal(shouldForceFinish(history, 'en'), true);
});

test('shouldForceFinish does NOT trigger when reply is rich', () => {
  const history = [
    { role: 'user', text: 'You', round: 1 },
    { role: 'user', text: 'You', round: 2 },
    { role: 'user', text: 'a friendly dragon flying through bright clouds today', round: 3 },
  ];
  assert.equal(shouldForceFinish(history, 'en'), false);
});

// ---------------------------------------------------------------------------
console.log('\n[4] storyPrompt — v7.2 builder embeds history + arc + signals');
// ---------------------------------------------------------------------------

test('buildDialogueSystemPromptV2 contains all 6 arc steps', () => {
  const prompt = buildDialogueSystemPromptV2({
    age: 5,
    primaryLang: 'en',
    history: [],
    arc: {},
    quality: evaluateReply({ replyText: 'You', locale: 'en' }),
    suggestMode: 'storyteller',
  });
  for (const step of DIALOGUE_ARC_STEPS) {
    assert.ok(prompt.includes(step), `missing arc step: ${step}`);
  }
});

test('buildDialogueSystemPromptV2 references conversation history', () => {
  const prompt = buildDialogueSystemPromptV2({
    age: 5,
    primaryLang: 'en',
    history: [
      { role: 'user', text: 'a blue dragon', round: 1 },
      { role: 'assistant', text: 'A blue dragon — wonderful!', round: 2 },
    ],
    arc: { character: 'blue dragon' },
    quality: evaluateReply({ replyText: 'a blue dragon', locale: 'en' }),
  });
  assert.ok(prompt.includes('a blue dragon'));
  assert.ok(prompt.includes('Round 1'));
  assert.ok(prompt.includes('character: "blue dragon"'));
});

test('buildDialogueSystemPromptV2 includes mode hint + quality signals', () => {
  const q = evaluateReply({ replyText: 'You', locale: 'en' });
  const prompt = buildDialogueSystemPromptV2({
    quality: q,
    suggestMode: q.suggestMode,
  });
  assert.ok(prompt.includes('storyteller'));
  assert.ok(prompt.includes('vocabulary: empty'));
  assert.ok(prompt.includes('Suggested mode'));
});

test('buildDialogueFirstQuestion still works (v7.1 compat)', () => {
  assert.equal(typeof buildDialogueFirstQuestion('en'), 'string');
  assert.ok(buildDialogueFirstQuestion('zh').length > 0);
});

// ---------------------------------------------------------------------------
console.log('\n[5] llm — defaultDialogueTurnV2 + coercer');
// ---------------------------------------------------------------------------

test('defaultDialogueTurnV2 not-finished returns valid nextQuestion', () => {
  const p = defaultDialogueTurnV2({ round: 2, primaryLang: 'en', forceDone: false });
  assert.equal(p.done, false);
  assert.ok(p.nextQuestion?.text?.length > 0);
  assert.equal(p.storyOutline, null);
  assert.equal(p._provider, 'default-bank');
});

test('defaultDialogueTurnV2 forceDone returns storyOutline', () => {
  const p = defaultDialogueTurnV2({ round: 5, primaryLang: 'en', forceDone: true });
  assert.equal(p.done, true);
  assert.equal(p.nextQuestion, null);
  assert.ok(Array.isArray(p.storyOutline?.paragraphs));
  assert.ok(p.storyOutline.paragraphs.length >= 3);
});

test('coerceDialogueV2Payload accepts v7.1 shape (only nextQuestion)', () => {
  const out = llmTest.coerceDialogueV2Payload(
    { nextQuestion: { text: 'test?' } },
    { round: 2, primaryLang: 'en', forceDone: false },
  );
  assert.equal(out.done, false);
  assert.equal(out.nextQuestion.text, 'test?');
  assert.equal(out.mode, 'cheerleader');
});

test('coerceDialogueV2Payload forceDone synthesizes outline', () => {
  const out = llmTest.coerceDialogueV2Payload(
    { nextQuestion: { text: 'should-be-dropped' } },
    { round: 5, primaryLang: 'en', forceDone: true },
  );
  assert.equal(out.done, true);
  assert.equal(out.nextQuestion, null);
  assert.ok(out.storyOutline.paragraphs.length >= 3);
});

test('coerceDialogueV2Payload rejects no-nextQuestion + no-done', () => {
  const out = llmTest.coerceDialogueV2Payload(
    { mode: 'cheerleader' },
    { round: 2, primaryLang: 'en', forceDone: false },
  );
  assert.equal(out, null);
});

// ---------------------------------------------------------------------------
console.log('\n[6] llm — generateDialogueTurnV2 mock mode');
// ---------------------------------------------------------------------------

await asyncTest('mock turn round 1 returns nextQuestion + arcUpdate', async () => {
  const t = await generateDialogueTurnV2({
    systemPrompt: 'mock',
    history: [],
    userInput: 'a dragon',
    round: 1,
    roundCount: 7,
    primaryLang: 'en',
  });
  assert.equal(t.done, false);
  assert.ok(t.nextQuestion?.text?.length > 0);
  assert.ok(t.arcUpdate);
  assert.equal(t._provider, 'mock');
});

await asyncTest('mock turn forceDone returns storyOutline 3+ paragraphs', async () => {
  const t = await generateDialogueTurnV2({
    systemPrompt: 'mock',
    history: [],
    userInput: 'You',
    round: 5,
    roundCount: 7,
    primaryLang: 'en',
    forceDone: true,
  });
  assert.equal(t.done, true);
  assert.equal(t.nextQuestion, null);
  assert.ok(t.storyOutline?.paragraphs?.length >= 3);
});

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  for (const e of errors) {
    console.error(`\n${e.name}:\n  ${e.err.stack || e.err.message}`);
  }
  process.exit(1);
}
process.exit(0);

// ============================================================================
// services/llm.js — LLM calls for dialogue + story expansion
//
// Three entry points:
//   - generateDialogueTurn({ systemPrompt, history, userInput, round, roundCount })
//       → { nextQuestion, done }   (v7.1 — backward compat)
//   - generateDialogueTurnV2({ systemPrompt, history, userInput, round, roundCount,
//                              primaryLang, learningLang })
//       → { mode, lastTurnSummary, nextQuestion, arcUpdate, done, storyOutline,
//           safetyLevel, safetyReplacement, _provider }
//       The v7.2 co-creation contract (PROMPT_SPEC_v7_2 §3). Includes built-in
//       retry + default-bank fallback so the route never has to handle null.
//   - generateStoryJson({ systemPrompt, dialogueSummary, childProfile })
//       → full 12-page story JSON (see PROMPT_SPEC_v7_1 §2.1)
//
// Both functions operate in ONE OF two modes:
//   1. MOCK mode (default when GEMINI_API_KEY is not set or USE_MOCK_AI=true)
//      → deterministic output, no network I/O, used for smoke tests + local dev
//   2. LIVE mode (GEMINI_API_KEY set + USE_MOCK_AI not set)
//      → calls Gemini 2.0 Flash REST API directly via fetch (no extra dep)
//
// The mock mode produces responses that structurally match the live contract,
// so integration tests run the same code path as production.
// ============================================================================

import env from '../config/env.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// WO-3.7: v2-lite story prompt addendum (cached). Appended to the JS systemPrompt
// before each Gemini call to harden the 12-page constraint.
let _v2LiteStoryAddendumCache = null;
function loadV2LiteStoryAddendum() {
  if (_v2LiteStoryAddendumCache !== null) return _v2LiteStoryAddendumCache;
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    _v2LiteStoryAddendumCache = readFileSync(join(dir, '..', 'prompts', 'v2-lite', 'story.system.txt'), 'utf8');
  } catch { _v2LiteStoryAddendumCache = ''; }
  return _v2LiteStoryAddendumCache;
}

export function isMockMode() {
  if (process.env.USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === '1') return true;
  if (!env.GEMINI_API_KEY) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Dialogue default question bank — used by mock mode AND as live-mode fallback
// when Gemini fails / returns malformed JSON. Indexed by round (1-based via
// round-1). Round 1 is the opener (handled in dialoguePromptPool); these cover
// rounds 2..7 of a multi-turn dialogue.
// ---------------------------------------------------------------------------
const DEFAULT_DIALOGUE_QUESTIONS = {
  zh: [
    '主角会有一个什么样的好朋友呢?',
    '他们会去哪里冒险呢?',
    '他们会遇到什么有趣的事?',
    '他们会怎么解决呢?',
    '最后他们回家了吗?',
    '这个故事的结局是开心的吧?',
    '要给这个故事起个什么名字?',
  ],
  en: [
    "Who will be the hero's best friend?",
    'Where will they go on their adventure?',
    'What fun thing will they find there?',
    'How will they solve the little problem?',
    'Do they come home in the end?',
    'Is the ending a happy one?',
    'What should we call this story?',
  ],
  pl: [
    'Kto będzie najlepszym przyjacielem bohatera?',
    'Dokąd wyruszą na przygodę?',
    'Co zabawnego tam znajdą?',
    'Jak rozwiążą mały problem?',
    'Czy wrócą do domu?',
    'Czy zakończenie jest szczęśliwe?',
    'Jak nazwiemy tę historię?',
  ],
  ro: [
    'Cine va fi cel mai bun prieten al eroului?',
    'Unde vor merge într-o aventură?',
    'Ce lucru distractiv vor găsi acolo?',
    'Cum vor rezolva mica problemă?',
    'Se vor întoarce acasă?',
    'Este finalul unul fericit?',
    'Cum să numim această poveste?',
  ],
};

/**
 * Return a guaranteed-non-null nextQuestion shape for a given round + locale.
 * Used by:
 *   - mock mode (deterministic test path)
 *   - liveDialogueTurn after the LLM fails / returns garbage (defense in depth)
 *   - the route layer as a final fallback (defense in depth)
 *
 * @param {object} args
 * @param {number} args.round         current 1-based round index
 * @param {'zh'|'en'|'pl'|'ro'} args.primaryLang
 * @param {'zh'|'en'|'pl'|'ro'|'none'} [args.learningLang='none']
 * @returns {{text:string, textLearning:string|null}}
 */
export function defaultDialogueQuestion({
  round,
  primaryLang = 'en',
  learningLang = 'none',
}) {
  const langBank = DEFAULT_DIALOGUE_QUESTIONS[primaryLang] || DEFAULT_DIALOGUE_QUESTIONS.en;
  const learningBank =
    learningLang && learningLang !== 'none'
      ? DEFAULT_DIALOGUE_QUESTIONS[learningLang] || null
      : null;
  const idx = Math.max(0, Math.min((round || 1) - 1, langBank.length - 1));
  return {
    text: langBank[idx] || langBank[0],
    textLearning: learningBank ? learningBank[idx] || learningBank[0] : null,
  };
}

// ---------------------------------------------------------------------------
// Dialogue turn
// ---------------------------------------------------------------------------

/**
 * @param {object} args
 * @param {string} args.systemPrompt
 * @param {Array<{role:'user'|'assistant', text:string}>} [args.history]
 * @param {string} args.userInput           Child's current turn
 * @param {number} args.round               1-based current round
 * @param {number} args.roundCount          Total rounds expected
 * @param {'zh'|'en'|'pl'|'ro'} [args.primaryLang]
 * @param {'zh'|'en'|'pl'|'ro'|'none'} [args.learningLang]
 * @returns {Promise<{ nextQuestion:{text:string,textLearning:string|null}, done:boolean }>}
 */
export async function generateDialogueTurn(args) {
  if (isMockMode()) return mockDialogueTurn(args);
  return liveDialogueTurn(args);
}

function mockDialogueTurn({ round, roundCount, primaryLang = 'en', learningLang = 'none' }) {
  const done = round >= roundCount;
  return {
    nextQuestion: done
      ? null
      : defaultDialogueQuestion({ round, primaryLang, learningLang }),
    done,
  };
}

/**
 * One Gemini round-trip. Returns parsed `nextQuestion` or `null` on any
 * non-fatal failure (HTTP non-2xx, non-JSON body, missing fields). Throws
 * only on fetch-level network errors (so the caller can retry).
 */
async function callGeminiDialogueOnce({ systemPrompt, history, userInput, round, roundCount }) {
  const messages = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood. I am Little Bear.' }] },
    ...history.map((h) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.text }],
    })),
    { role: 'user', parts: [{ text: `Round ${round}/${roundCount}\nChild: ${userInput}` }] },
  ];

  const resp = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: messages,
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 400,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            nextQuestion: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                textLearning: { type: 'string', nullable: true },
              },
              required: ['text'],
            },
            safetyLevel: { type: 'string' },
            safetyReplacement: { type: 'string', nullable: true },
          },
          required: ['nextQuestion'],
        },
      },
    }),
  });
  if (!resp.ok) {
    console.warn(`[llm] dialogue Gemini HTTP ${resp.status}`);
    return null;
  }
  let data;
  try {
    data = await resp.json();
  } catch {
    console.warn('[llm] dialogue Gemini returned non-JSON envelope');
    return null;
  }
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[llm] dialogue Gemini returned non-JSON body: ${String(raw).slice(0, 200)}`);
    return null;
  }
  // Field-name fallback — Gemini occasionally emits alternative shapes despite
  // responseSchema. We try, in order: canonical → question → next_question →
  // q → text-at-top-level.
  const nq =
    parsed.nextQuestion ??
    (parsed.question
      ? { text: parsed.question, textLearning: parsed.questionLearning ?? null }
      : null) ??
    (parsed.next_question
      ? {
          text: parsed.next_question?.text ?? parsed.next_question,
          textLearning: parsed.next_question?.textLearning ?? null,
        }
      : null) ??
    (parsed.q ? { text: parsed.q, textLearning: null } : null) ??
    (typeof parsed.text === 'string' ? { text: parsed.text, textLearning: null } : null) ??
    null;
  if (!nq || typeof nq.text !== 'string' || nq.text.trim() === '') {
    console.warn(
      `[llm] dialogue Gemini returned no usable nextQuestion field: ${JSON.stringify(parsed).slice(0, 200)}`,
    );
    return null;
  }
  return { text: nq.text, textLearning: nq.textLearning ?? null };
}

export async function liveDialogueTurn({
  systemPrompt,
  history = [],
  userInput,
  round,
  roundCount,
  primaryLang = 'en',
  learningLang = 'none',
}) {
  // Try Gemini twice (retry once on transient failure). On both failing, fall
  // back to the deterministic default question bank — never return null mid-
  // dialogue, since the client will display "I didn't hear you" and stall.
  let nextQuestion = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      nextQuestion = await callGeminiDialogueOnce({
        systemPrompt,
        history,
        userInput,
        round,
        roundCount,
      });
    } catch (err) {
      console.warn(`[llm] dialogue Gemini attempt ${attempt} threw:`, err?.message || err);
      nextQuestion = null;
    }
    if (nextQuestion) break;
    if (attempt === 1) {
      console.warn('[llm] dialogue retrying once before falling back to default');
    }
  }

  if (!nextQuestion) {
    console.warn(
      `[llm] dialogue using default-bank fallback for round ${round}/${roundCount} (${primaryLang})`,
    );
    nextQuestion = defaultDialogueQuestion({
      round: round + 1,
      primaryLang,
      learningLang,
    });
  }

  return {
    nextQuestion,
    done: round >= roundCount,
  };
}

// ---------------------------------------------------------------------------
// v7.2 co-creation dialogue turn (PROMPT_SPEC_v7_2 §3)
// ---------------------------------------------------------------------------

const DEFAULT_DIALOGUE_BANK = {
  zh: [
    '主角想要去哪里玩呢?',
    '主角的好朋友长什么样?',
    '他们想要找什么宝贝?',
    '路上会遇到什么小困难?',
    '他们要怎么把困难变成惊喜?',
    '故事最后他们一起做什么?',
    '我们给这个故事起个温暖的名字吧。',
  ],
  en: [
    'Where would the hero love to go?',
    'What does the hero\'s best friend look like?',
    'What treasure are they hoping to find?',
    'What gentle bump shows up along the way?',
    'How do they turn that bump into a surprise?',
    'What do they all do together at the end?',
    'Let\'s pick a warm name for this story.',
  ],
  pl: [
    'Dokąd bohater chce się wybrać?',
    'Jak wygląda najlepszy przyjaciel bohatera?',
    'Jakiego skarbu szukają?',
    'Jaka mała przeszkoda się pojawi?',
    'Jak zamienią ją w niespodziankę?',
    'Co zrobią razem na końcu?',
    'Wymyślmy ciepłą nazwę dla tej historii.',
  ],
  ro: [
    'Unde ar vrea să meargă eroul?',
    'Cum arată cel mai bun prieten al eroului?',
    'Ce comoară speră să găsească?',
    'Ce mică piedică apare pe drum?',
    'Cum o transformă într-o surpriză?',
    'Ce fac împreună la final?',
    'Să găsim un nume cald pentru această poveste.',
  ],
};

/**
 * Default-bank fallback for v7.2. Returns a guaranteed-non-null payload that
 * matches the v7.2 contract so the route layer can pretend the LLM
 * succeeded. Used by liveDialogueTurnV2 after both Gemini attempts fail.
 *
 * @param {object} args
 * @param {number} args.round            current 1-based round
 * @param {string} args.primaryLang      'en'|'zh'|'pl'|'ro'
 * @param {boolean} [args.forceDone]     if true, return done=true + storyOutline
 * @returns {object} v7.2 turn payload
 */
export function defaultDialogueTurnV2({
  round,
  primaryLang = 'en',
  forceDone = false,
}) {
  const bank = DEFAULT_DIALOGUE_BANK[primaryLang] || DEFAULT_DIALOGUE_BANK.en;
  const idx = Math.max(0, Math.min((round || 1) - 1, bank.length - 1));

  if (forceDone) {
    return {
      mode: 'storyteller',
      lastTurnSummary: null,
      nextQuestion: null,
      arcUpdate: null,
      done: true,
      storyOutline: {
        paragraphs: defaultStoryOutline(primaryLang),
      },
      safetyLevel: 'ok',
      safetyReplacement: null,
      _provider: 'default-bank-finished',
    };
  }

  return {
    mode: 'storyteller',
    lastTurnSummary: null,
    nextQuestion: {
      text: bank[idx] || bank[0],
      textLearning: null,
    },
    arcUpdate: null,
    done: false,
    storyOutline: null,
    safetyLevel: 'ok',
    safetyReplacement: null,
    _provider: 'default-bank',
  };
}

function defaultStoryOutline(primaryLang) {
  const banks = {
    zh: [
      '一个温暖的早晨,小主角准备出门冒险。',
      '路上他遇见了一个新朋友,两个人决定一起走。',
      '他们碰到了一个小麻烦,但用聪明的办法解决了。',
      '太阳落山,他们一起带着笑回到家里。',
    ],
    en: [
      'On a warm morning the little hero gets ready for a small adventure.',
      'On the way, a new friend joins and they decide to go together.',
      'A gentle bump appears, but they solve it with a clever idea.',
      'When the sun sets, they walk home smiling side by side.',
    ],
    pl: [
      'W ciepły poranek bohater rusza na małą przygodę.',
      'Po drodze spotyka nowego przyjaciela.',
      'Pojawia się drobna przeszkoda, ale rozwiązują ją razem.',
      'O zachodzie słońca wracają do domu z uśmiechem.',
    ],
    ro: [
      'Într-o dimineață caldă, micul erou pornește în aventură.',
      'Pe drum apare un prieten nou și pleacă împreună.',
      'O mică piedică apare, dar o rezolvă împreună.',
      'La apus se întorc acasă zâmbind.',
    ],
  };
  return banks[primaryLang] || banks.en;
}

/**
 * v7.2 dialogue turn — co-creation contract.
 *
 * @param {object} args
 * @param {string} args.systemPrompt
 * @param {Array<{role:string,text:string,round:number}>} [args.history]
 * @param {string} args.userInput
 * @param {number} args.round              1-based current round
 * @param {number} args.roundCount         hard cap (5 or 7)
 * @param {string} [args.primaryLang]
 * @param {string} [args.learningLang]
 * @param {boolean} [args.forceDone]       hard cap reached → request storyOutline
 * @returns {Promise<object>}              v7.2 turn payload (always non-null)
 */
export async function generateDialogueTurnV2(args) {
  if (isMockMode()) return mockDialogueTurnV2(args);
  return liveDialogueTurnV2(args);
}

function mockDialogueTurnV2({
  round,
  roundCount,
  primaryLang = 'en',
  forceDone = false,
}) {
  // Deterministic mock that walks the arc steps, used by smoke tests.
  const arcByRound = ['character', 'setting', 'goal', 'obstacle', 'climax', 'resolution'];
  const willFinish = forceDone || round >= roundCount || round >= 4;
  if (willFinish) {
    return {
      mode: 'storyteller',
      lastTurnSummary: 'mock summary of child input',
      nextQuestion: null,
      arcUpdate: { resolution: 'happy ending' },
      done: true,
      storyOutline: { paragraphs: defaultStoryOutline(primaryLang) },
      safetyLevel: 'ok',
      safetyReplacement: null,
      _provider: 'mock-finished',
    };
  }
  const bank = DEFAULT_DIALOGUE_BANK[primaryLang] || DEFAULT_DIALOGUE_BANK.en;
  return {
    mode: round === 1 ? 'cheerleader' : 'storyteller',
    lastTurnSummary: 'mock summary',
    nextQuestion: { text: bank[round - 1] || bank[0], textLearning: null },
    arcUpdate: { [arcByRound[round - 1] || 'character']: 'mock' },
    done: false,
    storyOutline: null,
    safetyLevel: 'ok',
    safetyReplacement: null,
    _provider: 'mock',
  };
}

async function callGeminiDialogueV2Once({
  systemPrompt,
  history,
  userInput,
  round,
  roundCount,
}) {
  const messages = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood. I am Bear.' }] },
    ...((history || []).map((h) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.text }],
    }))),
    {
      role: 'user',
      parts: [
        {
          text: `Round ${round}/${roundCount}\nChild just said: ${userInput}\nNow produce the v7.2 JSON.`,
        },
      ],
    },
  ];

  const resp = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: messages,
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 600,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!resp.ok) {
    console.warn(`[llm] dialogueV2 Gemini HTTP ${resp.status}`);
    return null;
  }
  let data;
  try {
    data = await resp.json();
  } catch {
    console.warn('[llm] dialogueV2 Gemini envelope not JSON');
    return null;
  }
  let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  if (typeof raw === 'string') {
    raw = raw.trim();
    if (raw.startsWith('```json')) raw = raw.slice(7);
    else if (raw.startsWith('```')) raw = raw.slice(3);
    if (raw.endsWith('```')) raw = raw.slice(0, -3);
    raw = raw.trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[llm] dialogueV2 Gemini body not JSON: ${String(raw).slice(0, 200)}`);
    return null;
  }
  return parsed;
}

/**
 * Normalize whatever the LLM returned into a strict v7.2 payload. Tolerates
 * v7.1-shape responses (only `nextQuestion`) and missing optional fields.
 */
function coerceDialogueV2Payload(parsed, { round, primaryLang, forceDone }) {
  if (!parsed || typeof parsed !== 'object') return null;

  // Normalize nextQuestion (accept several common field shapes).
  let nq = null;
  const nqRaw =
    parsed.nextQuestion ??
    (parsed.question ? { text: parsed.question } : null) ??
    (parsed.next_question ?? null) ??
    (typeof parsed.text === 'string' ? { text: parsed.text } : null);
  if (nqRaw && typeof nqRaw.text === 'string' && nqRaw.text.trim()) {
    nq = {
      text: nqRaw.text.trim(),
      textLearning:
        typeof nqRaw.textLearning === 'string' && nqRaw.textLearning.trim()
          ? nqRaw.textLearning.trim()
          : null,
    };
  }

  const done = forceDone === true ? true : parsed.done === true;

  let storyOutline = null;
  if (done) {
    const ps =
      parsed?.storyOutline?.paragraphs ??
      parsed?.outline?.paragraphs ??
      null;
    if (Array.isArray(ps) && ps.length >= 1) {
      const cleaned = ps
        .map((p) => (typeof p === 'string' ? p.trim() : ''))
        .filter(Boolean)
        .slice(0, 5);
      if (cleaned.length >= 3) {
        storyOutline = { paragraphs: cleaned };
      }
    }
    if (!storyOutline) {
      // LLM said done but no usable outline — synthesize from default bank.
      storyOutline = { paragraphs: defaultStoryOutline(primaryLang) };
    }
  }

  if (done && !storyOutline) return null;
  if (!done && !nq) return null;

  const mode =
    parsed.mode === 'cheerleader' || parsed.mode === 'storyteller'
      ? parsed.mode
      : 'cheerleader';

  let lastTurnSummary =
    typeof parsed.lastTurnSummary === 'string'
      ? parsed.lastTurnSummary.trim()
      : null;
  if (lastTurnSummary && lastTurnSummary.length > 60) {
    lastTurnSummary = lastTurnSummary.slice(0, 60);
  }
  if (lastTurnSummary === '') lastTurnSummary = null;

  let arcUpdate = null;
  if (parsed.arcUpdate && typeof parsed.arcUpdate === 'object' && !Array.isArray(parsed.arcUpdate)) {
    arcUpdate = parsed.arcUpdate;
  }

  const safetyLevel =
    parsed.safetyLevel === 'warn' || parsed.safetyLevel === 'blocked'
      ? parsed.safetyLevel
      : 'ok';
  const safetyReplacement =
    typeof parsed.safetyReplacement === 'string' && parsed.safetyReplacement.trim()
      ? parsed.safetyReplacement.trim()
      : null;

  return {
    mode,
    lastTurnSummary,
    nextQuestion: done ? null : nq,
    arcUpdate,
    done,
    storyOutline,
    safetyLevel,
    safetyReplacement,
    _provider: 'gemini-v7_2',
  };
}

async function liveDialogueTurnV2({
  systemPrompt,
  history = [],
  userInput,
  round,
  roundCount,
  primaryLang = 'en',
  learningLang = 'none',
  forceDone = false,
}) {
  let payload = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = await callGeminiDialogueV2Once({
        systemPrompt,
        history,
        userInput,
        round,
        roundCount,
      });
      payload = coerceDialogueV2Payload(parsed, { round, primaryLang, forceDone });
    } catch (err) {
      console.warn(`[llm] dialogueV2 attempt ${attempt} threw:`, err?.message || err);
      payload = null;
    }
    if (payload) break;
    if (attempt === 1) {
      console.warn('[llm] dialogueV2 retrying once before falling back to default');
    }
  }

  if (!payload) {
    console.warn(
      `[llm] dialogueV2 using default-bank fallback for round ${round}/${roundCount} (${primaryLang}) forceDone=${forceDone}`,
    );
    payload = defaultDialogueTurnV2({ round, primaryLang, forceDone });
  }

  // Honor learning lang exposure if missing on next question — non-fatal.
  if (
    payload.nextQuestion &&
    learningLang &&
    learningLang !== 'none' &&
    !payload.nextQuestion.textLearning
  ) {
    payload.nextQuestion.textLearning = null;
  }
  return payload;
}

// Expose internals for tests.
export const __test = {
  coerceDialogueV2Payload,
  defaultStoryOutline,
};

// ---------------------------------------------------------------------------
// Story 12-page expansion
// ---------------------------------------------------------------------------

/**
 * @param {object} args
 * @param {string} args.systemPrompt
 * @param {object} args.dialogueSummary   { mainCharacter, scene, conflict, rounds: [{q,a}] }
 * @param {object} args.childProfile      { name, age, primaryLang, secondLang }
 * @returns {Promise<{ title:string, titleEn:string, characterDescription:string, pages: StoryPage[] }>}
 */
export async function generateStoryJson(args) {
  if (isMockMode()) return mockStoryJson(args);
  return liveStoryJson(args);
}

function mockStoryJson({ dialogueSummary, childProfile }) {
  const child = childProfile || {};
  const name = child.name || 'Little One';
  const age = child.age || 5;
  const primary = child.primaryLang || 'en';
  const learning = child.secondLang || 'none';
  const character = dialogueSummary?.mainCharacter || name;
  const scene = dialogueSummary?.scene || 'a sunny meadow';
  const conflict = dialogueSummary?.conflict || 'finding a lost friend';

  const beats = [
    `Meet our hero ${character} in a cheerful morning`,
    `${character} steps outside full of curiosity`,
    `A new friend appears in the scene`,
    `The friends notice something unusual`,
    `They set off toward ${scene}`,
    `A small challenge appears`,
    `They try their first clever idea`,
    `They help each other through the ${conflict}`,
    `A warm surprise awaits them`,
    `Everyone celebrates together`,
    `The friends walk home under the sunset`,
    `A cozy ending, ready for dreams`,
  ];

  const titleMap = {
    zh: `${name}和彩虹森林的冒险`,
    en: `${name}\'s Rainbow Forest Adventure`,
    pl: `Przygoda ${name} w Tęczowym Lesie`,
    ro: `Aventura ${name} în Pădurea Curcubeu`,
  };

  const titleEn = titleMap.en;

  const pages = beats.map((beat, i) => {
    const pageNum = i + 1;
    const makeText = (loc) => {
      if (!loc || loc === 'none') return '';
      const bank = {
        zh: `这是第${pageNum}页:${character}在${scene}里遇到了新的惊喜,大家一起笑了起来。`,
        en: `Page ${pageNum}: ${character} meets a new surprise in ${scene}, and everyone laughs together.`,
        pl: `Strona ${pageNum}: ${character} spotyka nową niespodziankę w ${scene} i wszyscy się śmieją.`,
        ro: `Pagina ${pageNum}: ${character} întâlnește o surpriză nouă în ${scene}, și toți râd împreună.`,
      };
      return bank[loc] || bank.en;
    };

    return {
      pageNum,
      text: {
        zh: makeText('zh'),
        en: makeText('en'),
        pl: makeText('pl'),
        ro: makeText('ro'),
      },
      imagePrompt:
        `A cheerful ${age}-year-old character named ${name} with warm smile and bright eyes, ` +
        `in a sunlit meadow with a small friendly fox beside, colorful wildflowers, ` +
        `soft rolling hills, golden afternoon light, joyful mood`,
      emotion: ['happy', 'wonder', 'excited', 'cozy', 'adventurous', 'peaceful'][i % 6],
      beat,
    };
  });

  return {
    title: titleMap[primary] || titleMap.en,
    titleEn,
    characterDescription:
      `A cheerful ${age}-year-old with warm brown hair, rosy cheeks, ` +
      'bright colorful clothes, big curious eyes, small and cuddly',
    pages,
    _primaryLang: primary,
    _learningLang: learning,
  };
}

// WO-3.7: 1-retry wrapper around callGeminiStory (~33% sample failure when
// Gemini returns != 12 pages). Retry only on page-count mismatch — net/HTTP
// errors flow through to the OpenAI fallback unchanged.
function buildStoryPromptWithFeedback(basePrompt, lastResult) {
  const n = lastResult?.pages?.length ?? 'unknown';
  return `${basePrompt}\n\n⚠️ RETRY FEEDBACK: previous attempt returned ${n} pages. This story MUST contain EXACTLY 12 pages — not ${n}, not more. Generate pages 1-12 in order, each a distinct scene. pages.length === 12 is a HARD CONSTRAINT; count before returning.`;
}
async function generateStoryWithRetry({ systemPrompt, dialogueSummary, childProfile }) {
  const MAX_ATTEMPTS = 2;
  const addendum = loadV2LiteStoryAddendum();
  const base = addendum ? `${systemPrompt}\n\n${addendum}` : systemPrompt;
  let lastError = null, lastResult = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;
    const effective = isRetry ? buildStoryPromptWithFeedback(base, lastResult) : base;
    console.warn(`[storyGen] attempt=${attempt}/${MAX_ATTEMPTS}${isRetry ? ' (retry with feedback)' : ''}`);
    try {
      const parsed = await callGeminiStory({ systemPrompt: effective, dialogueSummary, childProfile });
      if (isRetry) console.warn(`[storyGen.metric] retrySucceeded=true firstPageCount=${lastResult?.pages?.length ?? 'unknown'} retryAttempt=${attempt}`);
      else console.warn(`[storyGen.metric] firstAttemptSucceeded=true`);
      return parsed;
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || '');
      if (!/returned \d+ pages, expected 12/.test(msg)) throw err; // non page-count → bubble
      const m = msg.match(/returned (\d+) pages/);
      lastResult = { pages: { length: m ? Number(m[1]) : 0 } };
      console.warn(`[storyGen] attempt=${attempt} bad page count (${lastResult.pages.length}), will retry`);
    }
  }
  console.error(`[storyGen.metric] retryFailed=true totalAttempts=${MAX_ATTEMPTS}`);
  throw lastError;
}

async function liveStoryJson({ systemPrompt, dialogueSummary, childProfile }) {
  // Try Gemini first (WO-3.7 retry wrapper handles 12-page mismatches),
  // fallback to OpenAI on 429/5xx/timeout / non-retryable Gemini errors.
  let geminiError = null;
  try {
    return await generateStoryWithRetry({ systemPrompt, dialogueSummary, childProfile });
  } catch (err) {
    geminiError = err;
    const msg = String(err?.message || '');
    const shouldFallback = msg.includes('429') || msg.includes('404') || /HTTP [5]\d\d/.test(msg) || msg.includes('timeout');
    if (!shouldFallback) throw err;
    console.log(`[llm] Gemini failed (${msg.slice(0, 100)}), falling back to OpenAI`);
  }

  // Fallback to OpenAI gpt-4o-mini
  if (!env.OPENAI_API_KEY) {
    throw geminiError; // No fallback available
  }
  try {
    return await callOpenAIStory({ systemPrompt, dialogueSummary, childProfile });
  } catch (openaiErr) {
    // Both failed — throw original Gemini error with OpenAI context
    const combined = new Error(
      `Gemini: ${geminiError?.message}; OpenAI fallback: ${openaiErr?.message}`
    );
    combined.geminiError = geminiError;
    combined.openaiError = openaiErr;
    throw combined;
  }
}

async function callGeminiStory({ systemPrompt, dialogueSummary, childProfile }) {
  const body = {
    contents: [
      { role: 'user', parts: [{ text: systemPrompt }] },
      {
        role: 'user',
        parts: [
          {
            text: [
              'Child profile:',
              JSON.stringify(childProfile),
              '',
              'Dialogue summary:',
              JSON.stringify(dialogueSummary),
              '',
              'Now produce the 12-page story JSON as specified.',
            ].join('\n'),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    },
  };
  const resp = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Gemini story HTTP ${resp.status}`);
  const data = await resp.json();
  // Check for incomplete generation or safety filter (covers MAX_TOKENS, SAFETY, RECITATION)
  const finishReason = data?.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    console.error('[llm] Gemini finish reason:', finishReason);
    throw new Error(`Gemini story incomplete: finishReason=${finishReason}`);
  }
  let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  // Strip markdown code fences if present (Gemini 2.5 sometimes wraps JSON)
  raw = raw.trim();
  if (raw.startsWith('```json')) raw = raw.slice(7);
  else if (raw.startsWith('```')) raw = raw.slice(3);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr) {
    console.error('[llm] Gemini parse error:', parseErr.message, 'raw length:', raw.length, 'first 300:', raw.slice(0, 300));
    throw new Error(`Gemini story returned non-JSON: ${raw.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed.pages) || parsed.pages.length !== 12) {
    throw new Error(`Gemini story returned ${parsed?.pages?.length ?? 0} pages, expected 12`);
  }
  return parsed;
}

async function callOpenAIStory({ systemPrompt, dialogueSummary, childProfile }) {
  const userPrompt = [
    'Child profile:',
    JSON.stringify(childProfile),
    '',
    'Dialogue summary:',
    JSON.stringify(dialogueSummary),
    '',
    'Now produce the 12-page story JSON as specified.',
  ].join('\n');

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`OpenAI story HTTP ${resp.status}: ${errBody.slice(0, 200)}`);
  }
  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content ?? '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI story returned non-JSON: ${raw.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed.pages) || parsed.pages.length !== 12) {
    throw new Error(`OpenAI story returned ${parsed?.pages?.length ?? 0} pages, expected 12`);
  }
  return parsed;
}

// ============================================================================
// services/llm.js — LLM calls for dialogue + story expansion
//
// Two entry points:
//   - generateDialogueTurn({ systemPrompt, history, userInput, round, roundCount })
//       → { text, textLearning, done }
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

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export function isMockMode() {
  if (process.env.USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === '1') return true;
  if (!env.GEMINI_API_KEY) return true;
  return false;
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
  const questionsByRound = {
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
      'Who will be the hero\'s best friend?',
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
  const langBank = questionsByRound[primaryLang] || questionsByRound.en;
  const learningBank = learningLang !== 'none' ? questionsByRound[learningLang] : null;

  const done = round >= roundCount;
  const idx = Math.min(round - 1, langBank.length - 1);

  return {
    nextQuestion: done
      ? null
      : {
          text: langBank[idx] || langBank[0],
          textLearning: learningBank ? learningBank[idx] || null : null,
        },
    done,
  };
}

async function liveDialogueTurn({ systemPrompt, history = [], userInput, round, roundCount }) {
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
  if (!resp.ok) throw new Error(`Gemini dialogue HTTP ${resp.status}`);
  const data = await resp.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini dialogue returned non-JSON: ${raw.slice(0, 200)}`);
  }
  // Fallback: handle common alternative field names Gemini may emit despite schema
  const nq = parsed.nextQuestion
    ?? (parsed.question ? { text: parsed.question, textLearning: null } : null)
    ?? (parsed.next_question
      ? { text: parsed.next_question?.text ?? parsed.next_question, textLearning: null }
      : null)
    ?? null;
  return {
    nextQuestion: nq,
    done: round >= roundCount,
  };
}

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

async function liveStoryJson({ systemPrompt, dialogueSummary, childProfile }) {
  // Try Gemini first, fallback to OpenAI on 429/5xx/timeout
  let geminiError = null;
  try {
    return await callGeminiStory({ systemPrompt, dialogueSummary, childProfile });
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
  // Check for truncation or safety filter
  const finishReason = data?.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    console.error('[llm] Gemini finish reason:', finishReason);
    throw new Error(`Gemini story truncated: finishReason=${finishReason}`);
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

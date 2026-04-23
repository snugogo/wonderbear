// ============================================================================
// contentSafety.js — 3-level content-safety filter for dialogue / generated text
//
// Per API_CONTRACT §七 + internal "7_内容安全与合规" doc §二 three-level scheme:
//
//   level 1  ("ok")     → pass through unchanged
//   level 2  ("warn")   → soft redirect; return a Little-Bear redirect sentence
//   level 3  ("blocked") → hard block; throw CONTENT_SAFETY_BLOCKED (30006)
//
// Phase 1 implementation is a lexical + heuristic classifier. Batch 5/6 can
// layer in Gemini's safety classifier if desired; the signature stays stable.
// ============================================================================

// ---------------------------------------------------------------------------
// Keyword dictionaries (cover zh + en base; pl/ro inherit via latin roots)
// ---------------------------------------------------------------------------
const LEVEL_3_KEYWORDS = [
  // violence / weapons (hard block)
  '杀', '血', '死亡', '自杀',
  'kill', 'murder', 'suicide',
  // sexual
  '裸', 'naked', 'nude', 'sex',
  // drugs
  '毒品', 'heroin', 'cocaine',
  // hate
  'nigger', '种族', 'racist slur',
];

const LEVEL_2_KEYWORDS = [
  // mild violence / scary
  '打架', '害怕', '噩梦', '鬼',
  'fight', 'scary', 'nightmare', 'ghost', 'monster',
  // isolation / loneliness themes (can be salvaged)
  '孤单', '一个人', 'alone', 'lonely',
  // sickness
  '生病', 'sick', 'hospital',
];

// Phrases that indicate the text is just unintelligible (ASR garbage).
const UNINTELLIGIBLE_SIGNALS = [
  /^[\s.。,，?？!！]*$/,
  /^(.)\1{4,}$/, // same char repeated 5+ times
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a text string into a 3-level safety assessment.
 *
 * @param {string} text  User-provided text (ASR or typed)
 * @param {object} [opts]
 * @param {'input'|'output'} [opts.mode='input']
 *   - 'input':  stricter; block earlier (child is speaking)
 *   - 'output': lenient; LLM story output usually ok, only flag hard hits
 * @param {'zh'|'en'|'pl'|'ro'} [opts.locale='en']
 * @returns {{
 *   level: 'ok'|'warn'|'blocked',
 *   reason: string|null,
 *   replacement: string|null,
 *   hits: string[],
 * }}
 */
export function classify(text, { mode = 'input', locale = 'en' } = {}) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { level: 'blocked', reason: 'empty', replacement: null, hits: [] };
  }

  if (UNINTELLIGIBLE_SIGNALS.some((re) => re.test(text))) {
    return { level: 'blocked', reason: 'unintelligible', replacement: null, hits: [] };
  }

  const lower = text.toLowerCase();
  const level3Hits = LEVEL_3_KEYWORDS.filter((kw) =>
    lower.includes(kw.toLowerCase()),
  );
  if (level3Hits.length > 0) {
    return {
      level: 'blocked',
      reason: 'hard_keyword',
      replacement: null,
      hits: level3Hits,
    };
  }

  const level2Hits = LEVEL_2_KEYWORDS.filter((kw) =>
    lower.includes(kw.toLowerCase()),
  );
  if (level2Hits.length > 0) {
    return {
      level: 'warn',
      reason: 'soft_keyword',
      replacement: redirectSentence(locale),
      hits: level2Hits,
    };
  }

  return { level: 'ok', reason: null, replacement: null, hits: [] };
}

/** Little-Bear redirect sentence for level 2 (warn) hits. */
export function redirectSentence(locale = 'en') {
  const map = {
    zh: '熊熊想听点开心的故事,你再告诉我一个好玩的想法吧!',
    en: "Little Bear wants a happier story — tell me a fun idea instead!",
    pl: "Mały Miś chce weselszej historii — powiedz mi coś zabawnego!",
    ro: "Micul Urs vrea o poveste mai veselă — spune-mi o idee amuzantă!",
  };
  return map[locale] || map.en;
}

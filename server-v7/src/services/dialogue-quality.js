// ============================================================================
// services/dialogue-quality.js — adaptive mode signal extractor (v7.2)
//
// Per PROMPT_SPEC_v7_2.md §2.1, the server evaluates each child reply and
// hands quality signals to the dialogue LLM so it can pick storyteller vs
// cheerleader mode dynamically without touching the child schema.
//
// Pure string / dictionary logic — no network calls, no LLM. Cheap to run on
// every turn.
// ============================================================================

// Stopwords per locale — keep list small (high-frequency filler only).
const STOPWORDS = {
  en: new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'so', 'um', 'uh', 'er', 'erm',
    'oh', 'ah', 'hmm', 'yeah', 'yep', 'no', 'nope', 'maybe', 'okay', 'ok',
    'i', 'you', 'we', 'he', 'she', 'it', 'they', 'me', 'my', 'is', 'are',
    'was', 'were', 'do', 'does', 'did', 'to', 'of', 'in', 'on', 'at',
  ]),
  zh: new Set([
    '的', '了', '吗', '啊', '呀', '哦', '嗯', '哈', '呢', '吧', '是', '不',
    '好', '我', '你', '他', '她', '它', '们',
  ]),
  pl: new Set([
    'tak', 'nie', 'i', 'a', 'lub', 'ale', 'no', 'em', 'no', 'eh', 'och',
    'ja', 'ty', 'on', 'ona',
  ]),
  ro: new Set([
    'da', 'nu', 'si', 'sau', 'dar', 'oh', 'ah', 'eu', 'tu', 'el', 'ea',
  ]),
};

/**
 * Tokenize a reply into words. For zh/ja, falls back to 1-char per token
 * since whitespace splitting is meaningless. For en/pl/ro uses whitespace.
 *
 * @param {string} text
 * @param {string} locale
 * @returns {string[]} lowercased tokens
 */
export function tokenize(text, locale = 'en') {
  if (typeof text !== 'string' || !text.trim()) return [];
  const cleaned = text.trim().toLowerCase();
  if (locale === 'zh' || locale === 'ja') {
    // Per-character tokenization, drop punctuation and whitespace.
    return Array.from(cleaned).filter((ch) => /[\u4e00-\u9fff\u3040-\u30ff]/.test(ch));
  }
  return cleaned
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function isStopword(token, locale) {
  const set = STOPWORDS[locale] || STOPWORDS.en;
  return set.has(token);
}

/**
 * Extract candidate keywords from a question (server-side, regex only).
 * Strategy: drop stopwords + short tokens, return remaining unique tokens.
 *
 * @param {string} questionText
 * @param {string} locale
 * @returns {string[]}
 */
export function extractQuestionKeywords(questionText, locale = 'en') {
  const tokens = tokenize(questionText || '', locale);
  const keywords = [];
  const seen = new Set();
  for (const tok of tokens) {
    if (locale === 'zh' || locale === 'ja') {
      if (isStopword(tok, locale)) continue;
      if (!seen.has(tok)) { keywords.push(tok); seen.add(tok); }
    } else {
      if (tok.length < 3) continue;
      if (isStopword(tok, locale)) continue;
      if (!seen.has(tok)) { keywords.push(tok); seen.add(tok); }
    }
  }
  return keywords;
}

/**
 * @param {object} args
 * @param {string} args.replyText                child's transcribed reply
 * @param {string} [args.previousQuestionText]   the question the child was answering
 * @param {string} [args.locale]                 'en'|'zh'|'pl'|'ro'
 * @returns {{
 *   wordCount: number,
 *   uniqueWordCount: number,
 *   vocabulary: 'empty' | 'basic' | 'rich',
 *   onTopic: boolean,
 *   suggestMode: 'storyteller' | 'cheerleader' | 'auto',
 *   tokens: string[]
 * }}
 */
export function evaluateReply({ replyText, previousQuestionText, locale = 'en' }) {
  const tokens = tokenize(replyText || '', locale);
  const wordCount = tokens.length;

  const meaningful = tokens.filter((t) => !isStopword(t, locale));
  const unique = new Set(meaningful);
  const uniqueWordCount = unique.size;

  let vocabulary;
  if (wordCount === 0 || meaningful.length === 0) {
    vocabulary = 'empty';
  } else if (wordCount < 4 || uniqueWordCount < 3) {
    vocabulary = 'basic';
  } else {
    vocabulary = 'rich';
  }

  // on-topic: any meaningful reply token also appears in question keywords?
  let onTopic = false;
  if (previousQuestionText && meaningful.length > 0) {
    const qWords = new Set(extractQuestionKeywords(previousQuestionText, locale));
    onTopic = meaningful.some((tok) => qWords.has(tok));
    // If reply is rich AND has 5+ tokens we accept on-topic by length even if
    // none of the question keywords match — child went off on a creative
    // tangent which is fine for a storytelling game.
    if (!onTopic && vocabulary === 'rich' && wordCount >= 5) onTopic = true;
  } else {
    // No question or no meaningful reply — treat as not-on-topic but the
    // mode decision below already handles empty/basic via vocabulary.
    onTopic = vocabulary === 'rich';
  }

  let suggestMode;
  if (vocabulary === 'empty' || vocabulary === 'basic') {
    suggestMode = 'storyteller';
  } else if (vocabulary === 'rich' && wordCount >= 5) {
    suggestMode = 'cheerleader';
  } else {
    suggestMode = 'auto';
  }

  return {
    wordCount,
    uniqueWordCount,
    vocabulary,
    onTopic,
    suggestMode,
    tokens,
  };
}

/**
 * Decide whether the dialogue session should be force-finished even if the
 * LLM didn't set done=true. Used by the route layer to short-circuit the
 * "You / You / You" loop seen in the 5-round trace.
 *
 * Rule: if the last 3 user turns all have vocabulary='empty', the server
 * forces done=true on the current turn so we exit gracefully into the
 * default storyOutline path.
 *
 * @param {Array<{role:string, text:string, quality?:object}>} history
 * @param {string} locale
 * @returns {boolean}
 */
export function shouldForceFinish(history, locale = 'en') {
  if (!Array.isArray(history)) return false;
  const userTurns = history.filter((h) => h.role === 'user');
  if (userTurns.length < 3) return false;
  const last3 = userTurns.slice(-3);
  return last3.every((h) => {
    const q = h.quality || evaluateReply({ replyText: h.text, locale });
    return q.vocabulary === 'empty';
  });
}

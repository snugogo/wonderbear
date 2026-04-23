// ============================================================================
// storyPrompt.js — LLM + image prompt factory, aligned to PROMPT_SPEC_v7_1.md
//
// Exports:
//   - buildStorySystemPrompt(locale, age)     → text for the 12-page LLM system
//   - buildDialogueSystemPrompt(locale, age)  → text for the dialogue LLM system
//   - buildDialogueFirstQuestion(locale, age) → localized "who's the hero" opener
//   - sanitizeImagePrompt(prompt, { channel, characterDesc }) → final image prompt
//   - STYLE_SUFFIXES / SAFE_REPLACEMENTS / DANGEROUS_COMBOS (exported for tests)
//
// Per v7.1: style suffix is the PROJECTOR-OPTIMIZED one (vibrant, high contrast,
// NO paper-texture/muted/sepia words). Sanitizer is the last line of defense
// even when the upstream LLM slips a forbidden combo through.
// ============================================================================

// ---------------------------------------------------------------------------
// v7.1 style suffixes — loaded from env IMAGE_STYLE_SUFFIX if set, else default
// ---------------------------------------------------------------------------
export const STYLE_SUFFIXES = {
  default:
    'vibrant saturated colors, bright cheerful children\'s book illustration, ' +
    'clean crisp watercolor style, vivid warm palette, luminous glowing colors, ' +
    'high contrast, professional storybook art, projection-display optimized, ' +
    'Miyazaki-inspired color richness, clear outlines',
  screen_hd:
    'vibrant saturated colors, bright storybook illustration, sharp detail, ' +
    'rich color depth, HD screen optimized, professional children\'s book art, ' +
    'clean digital illustration',
  print:
    'soft watercolor illustration, gentle pastel tones, fine brushwork detail, ' +
    'printable color range, warm natural palette, children\'s book print quality',
};

export function getStyleSuffix(variant = 'default', envOverride = null) {
  if (envOverride && envOverride.length > 0) return envOverride;
  return STYLE_SUFFIXES[variant] || STYLE_SUFFIXES.default;
}

// ---------------------------------------------------------------------------
// SAFE_REPLACEMENTS — three-channel common safe replacements (v7.1 §4.3)
// ---------------------------------------------------------------------------
export const SAFE_REPLACEMENTS = [
  // Scene (OpenAI-sensitive child combos)
  ['child\'s bedroom', 'cozy small room'],
  ['bedroom', 'cozy reading nook'],
  ['at night', 'in the evening'],
  ['dark night', 'quiet evening'],
  ['in the dark', 'in soft golden light'],
  ['sleeping', 'resting peacefully'],
  ['in bed', 'curled up on a soft cushion'],
  ['undressing', 'changing clothes'],
  ['bathtub', 'garden fountain'],
  ['bath', 'washing hands'],

  // Body
  ['bare feet', 'cozy feet'],
  ['bare arms', 'outstretched arms'],
  ['naked', ''],
  ['undressed', ''],
  ['bare skin', ''],

  // Relation (anti-grooming classifier)
  ['whispering to', 'talking softly with'],
  ['alone with adult', 'with a friendly adult nearby'],
  ['secret', 'surprise'],
  ['don\'t tell', ''],

  // Wrongly flagged innocuous words
  ['pistol', 'wooden toy'],
  ['gun', 'magic wand'],
  ['knife', 'cooking spoon'],
  ['blood', 'red berries'],
  ['dead', 'sleeping'],
  ['kill', ''],
  ['monster', 'friendly creature'],
  ['witch', 'kind old woman'],

  // v7.1 forbidden legacy style words — must be removed if LLM slips them in
  ['aged paper', ''],
  ['paper texture', ''],
  ['paper grain', ''],
  ['vintage wash', ''],
  ['muted tones', ''],
  ['muted palette', ''],
  ['desaturated', ''],
  ['sepia', ''],
  ['faded colors', ''],
  ['earth tones', ''],
  ['antique', ''],
];

// ---------------------------------------------------------------------------
// DANGEROUS_COMBOS — OpenAI-only multi-word combos that still trigger classifier
// ---------------------------------------------------------------------------
export const DANGEROUS_COMBOS_OPENAI = [
  ['child', 'bed', 'night'],
  ['child', 'bed', 'evening'],
  ['girl', 'bedroom', 'alone'],
  ['boy', 'bedroom', 'alone'],
  ['child', 'undress'],
  ['kid', 'bath'],
];

// ---------------------------------------------------------------------------
// Channel configs (v7.1 §4.5)
// ---------------------------------------------------------------------------
export const CHANNEL_CONFIG = {
  openai: {
    applyBasicReplacements: true,
    checkDangerousCombos: true,
    aggressiveRewriteOnHit: true,
    appendCharacterDesc: true,
    appendStyleSuffix: true,
  },
  imagen: {
    applyBasicReplacements: true,
    checkDangerousCombos: false,
    aggressiveRewriteOnHit: false,
    appendCharacterDesc: true,
    appendStyleSuffix: true,
  },
  fal: {
    applyBasicReplacements: true,
    checkDangerousCombos: false,
    aggressiveRewriteOnHit: false,
    appendCharacterDesc: true,
    appendStyleSuffix: true,
  },
};

// ---------------------------------------------------------------------------
// basicClean / detectDangerousCombo / aggressiveRewrite
// ---------------------------------------------------------------------------
export function basicClean(prompt) {
  if (typeof prompt !== 'string') return '';
  return prompt
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/["""]/g, '')
    .trim()
    .slice(0, 400);
}

export function detectDangerousCombo(prompt, combos = DANGEROUS_COMBOS_OPENAI) {
  const lower = prompt.toLowerCase();
  return combos.some((combo) =>
    combo.filter(Boolean).every((w) => lower.includes(w.toLowerCase())),
  );
}

export function aggressiveRewrite(prompt) {
  return (
    prompt
      .replace(/bedroom|room|indoor/gi, 'sunny meadow')
      .replace(/night|evening|dark/gi, 'golden afternoon')
      .replace(/bed|pillow|blanket/gi, 'soft grass')
      .replace(/lamp|candle/gi, 'warm sunlight') +
    ' outdoor scene, daytime, open landscape'
  );
}

// ---------------------------------------------------------------------------
// sanitizeImagePrompt — the main factory
// ---------------------------------------------------------------------------
export function sanitizeImagePrompt(
  imagePrompt,
  { channel = 'fal', characterDesc = '', styleSuffix = null, styleVariant = 'default' } = {},
) {
  const config = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG.fal;
  const counters = {
    replacementHits: 0,
    comboDetected: false,
    aggressiveRewrite: false,
  };

  let prompt = basicClean(imagePrompt);

  if (config.applyBasicReplacements) {
    for (const [from, to] of SAFE_REPLACEMENTS) {
      const re = new RegExp(escapeReg(from), 'gi');
      const before = prompt;
      prompt = prompt.replace(re, to);
      if (before !== prompt) counters.replacementHits++;
    }
    prompt = prompt.replace(/\s{2,}/g, ' ').replace(/\s,/g, ',').trim();
  }

  if (config.checkDangerousCombos) {
    if (detectDangerousCombo(prompt)) {
      counters.comboDetected = true;
      if (config.aggressiveRewriteOnHit) {
        prompt = aggressiveRewrite(prompt);
        counters.aggressiveRewrite = true;
      }
    }
  }

  const parts = [];
  if (config.appendCharacterDesc && characterDesc) {
    parts.push(characterDesc);
  }
  parts.push(prompt);
  if (config.appendStyleSuffix) {
    parts.push(getStyleSuffix(styleVariant, styleSuffix));
  }

  return {
    finalPrompt: parts.filter(Boolean).join(', '),
    counters,
  };
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Dialogue + Story system prompts — localized opener + shared English system
// ---------------------------------------------------------------------------

/** Number of dialogue rounds for a given age. */
export function roundCountForAge(age) {
  if (typeof age !== 'number') return 5;
  return age <= 4 ? 5 : 7;
}

/** Localized opener for dialogue/start (round 1 of N). */
export function buildDialogueFirstQuestion(locale = 'en') {
  const map = {
    zh: '今晚故事的主角是谁呀?',
    en: "Who's the hero of tonight's story?",
    pl: 'Kto jest bohaterem dzisiejszej wieczornej opowieści?',
    ro: 'Cine este eroul poveștii de diseară?',
  };
  return map[locale] || map.en;
}

/** English system prompt for the dialogue LLM (per v7.1 §2). */
export function buildDialogueSystemPrompt({ age = 5, primaryLang = 'en', learningLang = 'none' } = {}) {
  const roundCount = roundCountForAge(age);
  return [
    'You are the host of a gentle bedtime story game for young children aged 3-8.',
    'Your goal is to lead a short, warm multi-turn conversation that extracts',
    'the ingredients of a 12-page illustrated bedtime story.',
    '',
    `Conversation length: ${roundCount} rounds (already accounting for the opener).`,
    `Primary language: ${primaryLang}. Learning language: ${learningLang === 'none' ? 'none' : learningLang}.`,
    `Child age: ${age}. Adapt vocabulary accordingly (simple for 3-4, richer for 7-8).`,
    '',
    'Rules:',
    '1. Ask ONE short, concrete question per turn (max 20 chars in zh, max 15 words in en).',
    '2. Never reveal you are an AI. You are "Little Bear".',
    '3. Build progressively: main character → friend → place → wish/problem → emotion.',
    '4. If the child\'s reply is unintelligible, gently re-ask the same beat.',
    '5. On the final round, end with a soft confirmation, not a question.',
    '',
    'OUTPUT FORMAT — respond with ONLY a valid JSON object, no markdown, no code fences:',
    '{',
    '  "nextQuestion": {',
    '    "text": "question in primary language",',
    '    "textLearning": "question in learning language or null"',
    '  },',
    '  "safetyLevel": "ok" | "warn" | "blocked",',
    '  "safetyReplacement": null | "Little Bear redirect sentence"',
    '}',
  ].join('\n');
}

/** English system prompt for the story-expansion LLM (12 pages). Per v7.1 §2.1. */
export function buildStorySystemPrompt({ age = 5, primaryLang = 'en', learningLang = 'none' } = {}) {
  return [
    "You are a professional children's book writer specialized in creating",
    'magical illustrated storybooks for children aged 3-8.',
    '',
    "Based on the dialogue provided, create a 12-page illustrated story",
    "adapted to the child's age group and emotional arc.",
    '',
    'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown,',
    'no explanation, no code fences.',
    '',
    '{',
    '  "title": "Story title in primary language",',
    '  "titleEn": "Story title in English",',
    '  "characterDescription": "Main character visual description in English, 20-30 words",',
    '  "pages": [',
    '    {',
    '      "pageNum": 1,',
    '      "text": { "zh": "...", "en": "...", "pl": "...", "ro": "..." },',
    '      "imagePrompt": "Scene description in English, max 55 words",',
    '      "emotion": "happy|wonder|excited|cozy|adventurous|peaceful",',
    '      "beat": "One sentence story beat"',
    '    }',
    '  ]',
    '}',
    '',
    'STORY STRUCTURE:',
    '- Pages 1-3: establish character + gentle problem',
    '- Pages 4-8: adventure, 2-3 small challenges',
    '- Pages 9-11: resolution, character grows',
    '- Page 12: warm ending, child feels safe',
    '- Never use villains, violence, frightening imagery',
    `- Age ${age}: ${age <= 4 ? 'simple vocab, short sentences' : age <= 6 ? 'mild peril ok, 2-3 named chars' : 'light mystery, moral choices, richer vocab'}`,
    '',
    `Primary language: ${primaryLang}. Learning language: ${learningLang === 'none' ? 'none' : learningLang}.`,
    'Only fill text fields for the requested languages + English; set other locales to empty string.',
    '',
    'IMAGE PROMPT RULES — CRITICAL:',
    '1. Always start with: "[characterDescription], "',
    '2. ONE clear scene. No split panels, no collage.',
    '3. Outdoor or warmly lit indoor scenes preferred.',
    '4. DO NOT combine: child + bedroom + night/dark',
    '5. DO NOT use: naked, bare, undressed, sleeping in bed',
    '6. Evening indoor scenes → "cozy afternoon" or "golden sunset room"',
    '7. Bedroom scenes → "child\'s reading nook" or "playroom corner"',
    '8. Max 55 words per imagePrompt.',
    '9. Do NOT include style words — server appends them.',
  ].join('\n');
}

// ============================================================================
// data/dialoguePromptPool.js — variation source for the dialogue LLM
//
// Two pools:
//   1) TONE_VARIANTS  — five "personality flavors" of Little Bear that get
//      appended onto the base system prompt. Each session picks ONE so the bear
//      feels like a real character with a mood, not a flat narrator.
//   2) OPENERS        — five "first question" phrasings per language. Pre-TTS'd
//      at server boot (see services/staticTtsCache.js) so /dialogue/start
//      returns instantly with a real audio URL.
//
// Selection is deterministic per session (seed = dialogueId) so retries land
// on the same opener / tone within a session, but different sessions roll
// different combos.
// ============================================================================

import { createHash } from 'node:crypto';

/**
 * Tone variants — 3-4 lines each, appended after the base rules block.
 * The base prompt already pins JSON output format + safety rules; tone only
 * shifts personality, never structure.
 */
export const TONE_VARIANTS = [
  {
    id: 'playful',
    personalityLines: [
      'Personality: You are PLAYFUL Little Bear today — full of giggles and silly ideas.',
      'Sprinkle warmth and gentle humor; sound delighted by whatever the child says.',
      'When the child gives a small answer, light up: "Oh! That sounds amazing!" before the next question.',
    ],
  },
  {
    id: 'curious',
    personalityLines: [
      'Personality: You are CURIOUS Little Bear today — wide-eyed, full of wonder.',
      'Lean into "what if" and "I wonder" framing. Treat the child as a tiny scientist of stories.',
      'Reflect a tiny piece of the child\'s last answer back before asking the next question.',
    ],
  },
  {
    id: 'cozy',
    personalityLines: [
      'Personality: You are COZY Little Bear today — soft-voiced, slow, bedtime-warm.',
      'Use gentle words. Imagine you are tucking the child in while you ask.',
      'Let little pauses live between thoughts. No rushing.',
    ],
  },
  {
    id: 'adventurous',
    personalityLines: [
      'Personality: You are ADVENTUROUS Little Bear today — eager, excited, building momentum.',
      'Sound like you cannot wait to hear what happens next: "Yes! And then?!"',
      'Encourage bigger, braver story ideas without ever overwhelming the child.',
    ],
  },
  {
    id: 'storyteller',
    personalityLines: [
      'Personality: You are STORYTELLER Little Bear today — gentle craftsman of tales.',
      'Hint that every answer is a brick in the story being built together.',
      'Occasionally name the part you are working on, e.g., "Now we know our hero — next, where do they live?"',
    ],
  },
];

/**
 * Five opener phrasings per language. ALL must be safe to TTS (no markdown,
 * no emojis, no special chars). These phrases are pre-rendered to mp3 at boot.
 */
export const OPENERS = {
  zh: [
    '今晚故事的主角是谁呀?',
    '我们今晚的故事,要请谁来当主角呢?',
    '嘿,今晚你想让谁来当大主角?',
    '小朋友,你想让谁出现在故事里?',
    '今晚的小英雄会是谁呢?',
  ],
  en: [
    "Who's the hero of tonight's story?",
    'Tell me, who shall we put in tonight\'s story?',
    'Hey there, who do you want to be the hero tonight?',
    "Whose adventure are we going on tonight?",
    "Who's our brave little hero this evening?",
  ],
  pl: [
    'Kto jest bohaterem dzisiejszej wieczornej opowieści?',
    'Powiedz mi, kogo dziś zaprosimy do naszej historii?',
    'Hej, kto będzie dziś naszym bohaterem?',
    'Czyją przygodę poznamy dzisiaj?',
    'Kto będzie naszym dzielnym bohaterem tego wieczoru?',
  ],
  ro: [
    'Cine este eroul poveștii de diseară?',
    'Spune-mi, pe cine vom invita în povestea de seara asta?',
    'Hei, cine va fi eroul nostru în această seară?',
    'A cui aventură o vom afla diseară?',
    'Cine va fi micul nostru erou curajos astă-seară?',
  ],
};

export const SUPPORTED_LANGS = Object.keys(OPENERS);

/** Stable hash → integer in [0, n). Used so dialogueId picks a deterministic slot. */
function seedIndex(seed, n) {
  if (typeof seed !== 'string' || seed.length === 0) {
    return Math.floor(Math.random() * n);
  }
  const h = createHash('sha256').update(seed).digest();
  // Take first 4 bytes as uint32, mod n.
  const u = h.readUInt32BE(0);
  return u % n;
}

/** Pick a tone variant. Pass dialogueId to keep the same tone across retries. */
export function pickTone(seed) {
  const idx = seedIndex(seed, TONE_VARIANTS.length);
  return TONE_VARIANTS[idx];
}

/** Pick an opener phrase for a given language. Falls back to en if unsupported. */
export function pickOpener(lang, seed) {
  const bank = OPENERS[lang] || OPENERS.en;
  const idx = seedIndex(seed, bank.length);
  return { text: bank[idx], index: idx, lang: OPENERS[lang] ? lang : 'en' };
}

/** Iterate every (lang, opener) pair — used by the boot-time TTS preheat. */
export function* iterateAllOpeners() {
  for (const lang of SUPPORTED_LANGS) {
    for (let i = 0; i < OPENERS[lang].length; i++) {
      yield { lang, index: i, text: OPENERS[lang][i] };
    }
  }
}

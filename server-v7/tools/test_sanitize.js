// tools/test_sanitize.js — unit tests for sanitizePromptForPage1
// Run: node tools/test_sanitize.js
import { sanitizePromptForPage1 } from '../src/utils/storyPrompt.js';

const TESTS = [
  {
    name: "child's bedroom + at night",
    in: "A cozy child's bedroom at night",
    expect_contains: ['cozy small room'],
    expect_not_contains: ["child's bedroom", 'at night'],
  },
  {
    name: "boy's room + across the room",
    in: "boy's room seen from across the room",
    expect_contains: ["small adventurer's room", 'corner'],
    expect_not_contains: ["boy's room", 'across the room'],
  },
  {
    name: "children's picture book",
    in: "Japanese children's picture book illustration",
    expect_contains: ['Japanese picture book'],
    expect_not_contains: ["children's"],
  },
  {
    name: 'benign forest scene (unchanged)',
    in: 'a bear cub sleeping in a forest',
    expect_same: true,
  },
  {
    name: 'benign sunny meadow (unchanged)',
    in: 'WonderBear waves in a sunny meadow',
    expect_same: true,
  },
  {
    name: 'triple trigger (child+bed+bedroom)',
    in: 'a child and their bed in the bedroom',
    expect_triple_triggered: true,
  },
  {
    name: 'nighttime → twilight hour',
    in: 'a rabbit hops through a garden at nighttime',
    expect_contains: ['twilight hour'],
    expect_not_contains: ['nighttime'],
  },
  {
    name: 'paper texture visible → subtle paper grain',
    in: 'illustration with paper texture visible and warm colors',
    expect_contains: ['subtle paper grain'],
    expect_not_contains: ['paper texture visible'],
  },
  {
    name: 'for children removed',
    in: 'a storybook for children about friendship',
    expect_not_contains: ['for children'],
  },
  {
    name: 'girl bedroom triple → triple fires + poison removed',
    in: 'a girl in her bedroom at night reading',
    expect_triple_triggered: true,
    expect_not_contains: ['bedroom at night', 'at night'],
  },
];

let pass = 0;
let fail = 0;
const fails = [];

for (const t of TESTS) {
  const { sanitized, replacedTerms } = sanitizePromptForPage1(t.in);
  const errs = [];

  if (t.expect_same) {
    if (sanitized !== t.in) errs.push(`expected unchanged, got "${sanitized}"`);
  }
  if (t.expect_contains) {
    const arr = Array.isArray(t.expect_contains) ? t.expect_contains : [t.expect_contains];
    for (const needle of arr) {
      if (!sanitized.toLowerCase().includes(needle.toLowerCase())) {
        errs.push(`missing substring "${needle}"`);
      }
    }
  }
  if (t.expect_not_contains) {
    const arr = Array.isArray(t.expect_not_contains) ? t.expect_not_contains : [t.expect_not_contains];
    for (const needle of arr) {
      if (sanitized.toLowerCase().includes(needle.toLowerCase())) {
        errs.push(`should NOT contain "${needle}", got "${sanitized}"`);
      }
    }
  }
  if (t.expect_triple_triggered) {
    if (!replacedTerms.includes('__triple_rewrite__')) {
      errs.push('expected __triple_rewrite__ in replacedTerms');
    }
  }

  if (errs.length === 0) {
    pass++;
    console.log(`PASS: ${t.name}`);
  } else {
    fail++;
    fails.push({ name: t.name, errs, sanitized, replacedTerms });
    console.log(`FAIL: ${t.name}`);
    for (const e of errs) console.log(`   - ${e}`);
    console.log(`   output: "${sanitized}"`);
    console.log(`   replacedTerms: ${JSON.stringify(replacedTerms)}`);
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);

# W1.1 Langfix Report — language_detector.js short-English bug

**From**: Factory
**To**: Kristy / Claude
**Time**: 2026-04-29
**Refs**: W1-prime Phase 4.2 spot-check, AGENTS.md §2.2 (single command discipline)

---

## 1. Diff applied (lines added)

File: `server-v7/src/lib/language_detector.js`

Inserted inside `if (chineseRatio < 0.2) {` block, **before** the `let code; try { code = franc(text); }` line:

```js
    // Short-circuit: pure-ASCII English-letter input bypasses franc
    // (franc-min misclassifies short English as swe/sco/etc)
    const nonEnglishLatin = /[\u00C0-\u024F]/.test(text);
    if (englishChars >= 2 && chineseChars === 0 && !nonEnglishLatin) {
      return "en";
    }
```

Net change: +6 lines (5 lines of code + 1 blank/comment), 0 lines removed. No other file
modified.

Resulting block (for context):

```js
  if (chineseRatio > 0.7) return 'zh';
  if (chineseRatio < 0.2) {
    // Short-circuit: pure-ASCII English-letter input bypasses franc
    // (franc-min misclassifies short English as swe/sco/etc)
    const nonEnglishLatin = /[\u00C0-\u024F]/.test(text);
    if (englishChars >= 2 && chineseChars === 0 && !nonEnglishLatin) {
      return "en";
    }
    let code;
    try { code = franc(text); } catch (e) { code = 'und'; }
    ...
```

`node --check src/lib/language_detector.js` → `SYNTAX_OK`.

---

## 2. Test outputs

### 2a. Phase 4.2 spot-check (zh + en)

Command:
```
node --input-type=module -e "import(\"./src/lib/language_detector.js\").then(({ detectLanguage }) => { const a = detectLanguage(\"我喜欢小熊\"); const b = detectLanguage(\"I love bear\"); console.log(\"lang zh:\", a, \"| lang en:\", b); if (a !== \"zh\" || b !== \"en\") { console.error(\"FAIL\"); process.exit(1); } console.log(\"PASS\"); });"
```

Output:
```
lang zh: zh | lang en: en
PASS
```
Exit code: 0 ✅

### 2b. Regression matrix (5 required cases + null)

| Input | Result | Expected | Status |
|---|---|---|---|
| `"我喜欢小熊"` | `zh` | `zh` | ✅ PASS |
| `"I love bear"` | `en` | `en` | ✅ PASS |
| `"Mam kota"` | `en` | (report) | ⚠ See note |
| `"Café"` | `other` | NOT `en` | ✅ PASS (does not return `en`) |
| `""` | `unknown` | `unknown` | ✅ PASS |
| `null` | `unknown` | `unknown` | ✅ PASS |

Raw output:
```
"我喜欢小熊" => zh (expected: zh)
"I love bear" => en (expected: en)
"Mam kota" => en (expected: null)
"Café" => other (expected: NOT_en)
"" => unknown (expected: unknown)
null => unknown (expected: unknown)
```

#### Note on `"Mam kota"` (Polish, no diacritics)

Result: `en`. **This is the expected behaviour given the spec of the short-circuit.**

The new short-circuit only inspects characters: if a string is pure-ASCII Latin letters with
no characters in U+00C0–U+024F, it is treated as English. `"Mam kota"` happens to contain no
Polish diacritics (no ą, ó, ż, …), so it is indistinguishable from English at the character
level and now returns `"en"`.

Trade-off accepted by this change:
- Before fix: `franc-min` mis-classified short English (`"I love bear"`) as `swe`/`sco`/etc. →
  English broke (the actual bug we are fixing).
- After fix: short, diacritic-free Polish/Romanian/Spanish phrases collapse into `en`.

For the W1 dialogue path this is acceptable because (a) the orchestrator's primary contrast is
zh vs en, (b) any non-English Latin language with any diacritic still flows through `franc` and
is detected correctly (`"Café"` → `other`, not `en`), and (c) franc-min was already unreliable
on <3-word non-English Latin input. If finer Polish/Romanian/Spanish detection is required
later, a longer-text gate or a different detector should be introduced — out of scope for W1.1.

---

## 3. git status -s

```
 M server-v7/package-lock.json
 M server-v7/package.json
 M tv-html/src/screens/DialogueScreen.vue
?? coordination/2026-04-30-v2lite-w1-create-libs.md
?? coordination/2026-04-30-v2lite-w1-prime-create-libs.md
?? coordination/done/2026-04-29-add-asr-button-on-trackb-report.md
?? coordination/done/2026-04-29-merge-trackb-into-asr-report.md
?? coordination/done/2026-04-30-v2lite-w1-prime-report.md
?? coordination/done/2026-04-30-v2lite-w1-report.md
?? coordination/workorders/2026-04-29-merge-trackb-into-asr/
?? server-v7/src/lib/dialogue_orchestrator.js
?? server-v7/src/lib/elements_manager.js
?? server-v7/src/lib/image_prompt_sanitizer.js
?? server-v7/src/lib/language_detector.js
?? server-v7/src/lib/llm_response_validator.js
?? server-v7/src/lib/repetition_detector.js
```

Note: `server-v7/src/lib/language_detector.js` shows as `??` (untracked) rather than `M`,
because the file was created in W1-prime and has not yet been `git add`-ed. The workorder text
mentioned `M src/lib/language_detector.js`, but the actual prior status (and current status) is
`??`. The set of files matches the previously-listed pre-existing files exactly — **no new
files were created and no other files were modified by this workorder.** This report file
itself goes into `coordination/done/` per protocol and is the only addition introduced by W1.1.

---

## 4. Self-review checklist

- [x] Only `server-v7/src/lib/language_detector.js` was modified (verified via `git status -s`).
- [x] Inserted block matches the workorder text **exactly** (5 lines incl. comments + blank-less).
- [x] Insertion point is **inside** `if (chineseRatio < 0.2) {` and **before** `let code;`.
- [x] `node --check` syntax-OK.
- [x] Phase 4.2 spot-check returns `PASS` (exit 0).
- [x] zh case (`"我喜欢小熊"`) → `zh`.
- [x] en case (`"I love bear"`) → `en` (was previously broken; now fixed).
- [x] `"Café"` (Latin diacritic) does NOT return `en` (returns `other`).
- [x] `""` → `unknown`.
- [x] `null` → `unknown`.
- [x] Polish-no-diacritic case (`"Mam kota"`) behaviour reported and trade-off documented.
- [x] No `git commit` / no `git push` / no `pm2 restart` / no `npm install` performed.
- [x] No other file modified.
- [x] No SSH session opened, no production state touched.

— Factory

# Workorder W2 Completion Report — Wire PROMPT_VERSION env switch into dialogue route

**From**: Factory droid
**To**: Claude (review officer) / Kristy
**Time**: 2026-04-29 (verification re-run)
**Branch**: release/showroom-20260429
**Repo**: /opt/wonderbear/server-v7
**Workorder ID**: 2026-04-30-v2lite-w2-prompt-version-routing
**Depends on**: W1' (6 dormant lib files in src/lib/) and W1.1 (language_detector fix)
**Status**: ✅ Phase 0–5 complete. **NOT** committed, **NOT** pushed, **NOT** pm2-restarted.

---

## Phase 0 — Reconnaissance (3 grep outputs)

### A. dialogue routes (`grep -rn "generateDialogueTurnV2\|/dialogue/turn\|dialogueTurn" src/routes/`)
```
src/routes/story.js.backup-2026-04-30-w2-prompt-version-routing:30:import { generateDialogueTurnV2 } from '../services/llm.js';
src/routes/story.js.backup-2026-04-30-w2-prompt-version-routing:333:      const llm = await generateDialogueTurnV2({
src/routes/story.js:30:import { generateDialogueTurnV2 } from '../services/llm.js';
src/routes/story.js:339:      const llm = await generateDialogueTurnV2({
```

### B. dialogue services (`grep -rn "generateDialogueTurnV2" src/services/`)
```
src/services/llm.js:7://   - generateDialogueTurnV2({ systemPrompt, history, userInput, round, roundCount,
src/services/llm.js:418:export async function generateDialogueTurnV2(args) {
```

### C. current env reading (`grep -rn "process.env" src/config/`)
```
src/config/env.js:14:  NODE_ENV: process.env.NODE_ENV || 'development',
src/config/env.js:15:  PORT: parseInt(process.env.PORT || '3000', 10),
src/config/env.js:18:  DATABASE_URL: process.env.DATABASE_URL,
src/config/env.js:19:  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
src/config/env.js:20:  JWT_SECRET: process.env.JWT_SECRET || 'dev_jwt_secret_change_me_in_prod_at_least_32_bytes_long',
... (plus all existing groups: mail/ai/tts/speech/dashscope/stripe/paypal/storage/etc.)
```

### Identifications
- **v1 dialogue main entry function**: `generateDialogueTurnV2` in `src/services/llm.js`
- **v1 dialogue route file**: `src/routes/story.js` — `POST /api/story/dialogue/:id/turn` handler
- **env aggregation file**: `src/config/env.js` — flat `env` object using `process.env.X || default` pattern. PROMPT_VERSION read added there.

---

## Phase 1 + 2 — Files changed (2)

| File | LOC delta | Nature |
|------|-----------|--------|
| `server-v7/src/config/env.js` | +16 / −0 | Add `PROMPT_VERSION` field with allow-list validation |
| `server-v7/src/routes/story.js` | +172 / −0 | Wrap v1 logic in `if (env.PROMPT_VERSION === 'v1') { … }`; add v2-lite branch using `dialogue_orchestrator` |

`git diff --stat`:
```
 server-v7/src/config/env.js   |  16 ++++
 server-v7/src/routes/story.js | 172 ++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 188 insertions(+)
```
**0 deletions** across both files.

Backups created (per AGENTS.md §2.1):
- `src/config/env.js.backup-2026-04-30-w2-prompt-version-routing`
- `src/routes/story.js.backup-2026-04-30-w2-prompt-version-routing`

### Diff for `src/config/env.js`
```diff
@@ -93,6 +93,22 @@
   // misc
   IMAGE_STYLE_SUFFIX: process.env.IMAGE_STYLE_SUFFIX || '',
   IMAGE_PAGE1_COMPOSITION: process.env.IMAGE_PAGE1_COMPOSITION || '',
+
+  // prompt version routing — workorder 2026-04-30-v2lite-w2-prompt-version-routing
+  // 'v1' = Track B legacy path (default, prod current behavior)
+  // 'v2-lite' / 'v2-full' = orchestrator path (W3 will switch via env)
+  PROMPT_VERSION: (() => {
+    const v = process.env.PROMPT_VERSION || 'v1';
+    const allowed = ['v1', 'v2-lite', 'v2-full'];
+    if (!allowed.includes(v)) {
+      console.warn(
+        `[env] Unknown PROMPT_VERSION="${v}", falling back to "v1". ` +
+          `Allowed: ${allowed.join(', ')}`,
+      );
+      return 'v1';
+    }
+    return v;
+  })(),
 };
```

### Diff for `src/routes/story.js` (3 insertion sites — no deletions, no rename, no extraction)

**Site 1 — imports (top of file, after existing imports):**
```diff
@@ -35,6 +35,8 @@
 import { synthesize as ttsSynthesize } from '../services/tts.js';
 import { transcribe as asrTranscribe } from '../services/asr.js';
 import { nanoid } from 'nanoid';
+import env from '../config/env.js';
+import { orchestrateDialogue } from '../lib/dialogue_orchestrator.js';
```

**Site 2 — open the v1 branch (right after the safety check, before `// ----- v7.2 co-creation flow`):**
```diff
@@ -298,6 +300,10 @@
         });
       }
 
+      // === PROMPT_VERSION routing — workorder 2026-04-30-v2lite-w2 ===
+      // Default 'v1' = Track B legacy path (byte-identical to pre-W2).
+      // 'v2-lite' / 'v2-full' = orchestrator path (W3 will switch via env).
+      if (env.PROMPT_VERSION === 'v1') {
       // ----- v7.2 co-creation flow ---------------------------------
       // 1) evaluate child reply quality (server-side adaptive signal)
```

**Site 3 — close the v1 branch and append v2-lite branch (right after the existing `return resp;`):**
```diff
@@ -450,6 +456,172 @@
       };
       if (recognizedText) resp.recognizedText = recognizedText;
       return resp;
+      }
+
+      // === V2-LITE BRANCH (PROMPT_VERSION=v2-lite|v2-full) ===
+      // W2 wires the v2-lite path through dialogue_orchestrator. The actual
+      // v2-lite SYSTEM_PROMPT comes in W3 — here we use a placeholder.
+      // This branch is dormant in prod (default PROMPT_VERSION=v1).
+      const v2OriginalHistory = Array.isArray(session.history) ? [...session.history] : [];
+      const orchestratorSession = {
+        history: v2OriginalHistory.map((h) => ({
+          role: h.role === 'user' ? 'child' : h.role === 'assistant' ? 'bear' : h.role,
+          text: h.text,
+        })),
+        elements: Array.isArray(session.elements) ? [...session.elements] : [],
+        turnCount: typeof session.turnCount === 'number' ? session.turnCount : 0,
+        recapCount: typeof session.recapCount === 'number' ? session.recapCount : 0,
+        lastRecapTurn: typeof session.lastRecapTurn === 'number' ? session.lastRecapTurn : 0,
+        lastRecapElementsCount: typeof session.lastRecapElementsCount === 'number' ? session.lastRecapElementsCount : 0,
+        realWorldHooks: Array.isArray(session.realWorldHooks) ? [...session.realWorldHooks] : [],
+      };
+      const v2LiteLlmCallFn = async ({ history, elements, childInput }) => {
+        // Mock-mode fallback so unit tests / CI don't need a real key.
+        if (process.env.USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === '1' || !env.GEMINI_API_KEY) {
+          return JSON.stringify({ reply: '小熊听到啦~ 然后呢?', elements: Array.isArray(elements) ? elements.slice(-3) : [], intent: 'continue' });
+        }
+        // Live Gemini 2.5 Flash call — same fetch mechanism as services/llm.js.
+        // TODO W3: replace placeholder with the real v2-lite SYSTEM_PROMPT.
+        const SYSTEM_PROMPT_PLACEHOLDER = '你是 WonderBear,5 岁小熊。\n输出 JSON: {"reply":"...","elements":[...],"intent":"continue|recap|safety"}';
+        const userMsg = `[history]\n${JSON.stringify(history)}\n[elements_so_far]\n${JSON.stringify(elements)}\n[child_says]\n${childInput}`;
+        const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
+        try {
+          const httpResp = await fetch(`${url}?key=${env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT_PLACEHOLDER }] }, { role: 'model', parts: [{ text: 'OK.' }] }, { role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 400, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } }) });
+          if (!httpResp.ok) return null;
+          const data = await httpResp.json();
+          return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
+        } catch { return null; }
+      };
+      const orchestratedResult = await orchestrateDialogue({ session: orchestratorSession, childInput: text, llmCallFn: v2LiteLlmCallFn });
+      // … session-write-back + v1-compatible response shape ($v2Resp), see file for full code …
+      const v2Resp = {
+        round, done: v2Done, mode: 'storyteller', lastTurnSummary: null, arcUpdate: null,
+        nextQuestion: v2NextQuestion, summary: v2Done ? (session.summary || null) : null,
+        storyOutline: v2StoryOutline, safetyLevel: safety.level, safetyReplacement: safety.replacement,
+        _provider: 'v2-lite', _promptVersion: env.PROMPT_VERSION,
+      };
+      if (recognizedText) v2Resp.recognizedText = recognizedText;
+      return v2Resp;
     },
   );
```

Full diff: `git diff server-v7/src/routes/story.js` reproduces the 172 insertion lines verbatim.

---

## byte-identical proof for v1 branch

```
$ wc -l src/routes/story.js src/routes/story.js.backup-2026-04-30-w2-prompt-version-routing
 1057 src/routes/story.js
  885 src/routes/story.js.backup-2026-04-30-w2-prompt-version-routing
 1942 total
```

Line delta = +172 (1057 − 885 = 172). Equals: V2-lite branch addition + 4-line if/comment + closing brace + 2-line import — **zero modification of the existing 885 lines**.

**Stronger proof — zero deletion lines:**
```
$ diff -u src/routes/story.js.backup-2026-04-30-w2-prompt-version-routing src/routes/story.js | grep -E "^-[^-]" | wc -l
0
$ diff -u src/config/env.js.backup-2026-04-30-w2-prompt-version-routing src/config/env.js | grep -E "^-[^-]" | wc -l
0
```

**Direct slice diff — confirms v1 logic byte-identical:**
```
$ diff <(sed -n '307,456p' src/routes/story.js) <(sed -n '301,450p' src/routes/story.js.backup-2026-04-30-w2-prompt-version-routing) && echo BYTE_IDENTICAL_OK
BYTE_IDENTICAL_OK
```
The original v1 logic (backup lines 301–450: `// ----- v7.2 co-creation flow ----` through `return resp;`) is preserved character-for-character at lines 307–456 of the modified file. Indentation unchanged (the `if` wrapper sits at the same 6-space indent as the v1 lines). The wrapper is:
- `if (env.PROMPT_VERSION === 'v1') {` (line 306, 6-space indent)
- `}` (line 458, 6-space indent)

`node --check` syntax verification:
```
$ node --check src/config/env.js && echo "env.js OK"
env.js OK
$ node --check src/routes/story.js && echo "story.js OK"
story.js OK
```

---

## Phase 3 — env default verification (re-run)

### 3.1 unset → defaults to v1
```
$ DATABASE_URL=… JWT_SECRET=… node --input-type=module -e "
  import('./src/config/env.js').then(({ default: cfg }) => {
    console.log('PROMPT_VERSION:', cfg.PROMPT_VERSION);
    if (cfg.PROMPT_VERSION !== 'v1') { console.error('FAIL'); process.exit(1); }
    console.log('PASS: default is v1');
  });"
PROMPT_VERSION: v1
PASS: default is v1
```

### 3.2 explicit v2-lite → recognized
```
$ DATABASE_URL=… JWT_SECRET=… PROMPT_VERSION=v2-lite node …
PROMPT_VERSION: v2-lite
PASS: v2-lite recognized
```

### 3.3 garbage value → falls back to v1 with warning
```
$ DATABASE_URL=… JWT_SECRET=… PROMPT_VERSION=garbage node …
[env] Unknown PROMPT_VERSION="garbage", falling back to "v1". Allowed: v1, v2-lite, v2-full
PROMPT_VERSION (garbage input): v1
PASS: invalid value falls back to v1
```

---

## Phase 4 — existing test suite results (re-run with `USE_MOCK_AI=1`)

| Test file | Pass / Fail | Notes |
|-----------|-------------|-------|
| `test/dialogue-cocreation.test.mjs` | **23 / 0** ✅ | v7.2 co-creation tests — all green |
| `test/llm.dialogue.test.mjs`        | **3 / 0** ✅  | parsed.nextQuestion field-name fallbacks — all green |
| `test/provider-chain.test.mjs`      | **6 / 0** ✅  | provider-chain unit tests — all green |
| `tests/llm.test.js`                 | **42 / 0** ✅ | dialogue contract + retry/fallback — all green |

Final tail of each run:
```
# tests 1   # pass 1   # fail 0   (dialogue-cocreation: 23 sub-asserts pass)
# tests 3   # pass 3   # fail 0   (llm.dialogue: 3 cases)
# tests 6   # pass 6   # fail 0   (provider-chain: 6 cases)
# tests 1   # pass 1   # fail 0   (llm.test.js: 42 sub-asserts; "Passed: 42, Failed: 0")
```

### Track B test totals (per work order's "must remain green" set)
- 23/23 dialogue ✅
- 3/3 v7.1-style llm dialogue ✅
- 6/6 provider-chain ✅
- (42/42 llm.test.js bonus) ✅

**Total: 74/74 green for the test suites named in the work order.**

> Note: `test/tts.dual-provider.test.mjs` was NOT in the work order's "must remain green" list and is a pre-existing failure (DashScope WS mock returns 401 + ElevenLabs sees "unexpected fetch") in `src/services/tts.js` / `src/lib/provider-chain.js` test plumbing — neither of which is touched by W2.

---

## `git status -s` output (W2-relevant only, excluding coordination/)

```
 M package-lock.json                                                  ← pre-existing
 M package.json                                                       ← pre-existing
 M src/config/env.js                                                  ← W2
 M src/routes/story.js                                                ← W2
 M ../tv-html/src/screens/DialogueScreen.vue                          ← pre-existing
?? src/config/env.js.backup-2026-04-30-w2-prompt-version-routing      ← W2 backup
?? src/routes/story.js.backup-2026-04-30-w2-prompt-version-routing    ← W2 backup
?? src/lib/dialogue_orchestrator.js                                   ← W1' (untouched, dormant)
?? src/lib/elements_manager.js                                        ← W1' (untouched, dormant)
?? src/lib/image_prompt_sanitizer.js                                  ← W1' (untouched, dormant)
?? src/lib/language_detector.js                                       ← W1' (untouched, dormant)
?? src/lib/llm_response_validator.js                                  ← W1' (untouched, dormant)
?? src/lib/repetition_detector.js                                     ← W1' (untouched, dormant)
```

W2-touched files: only `src/config/env.js` and `src/routes/story.js` (plus their backups). No services/, no provider-chain.js, no dialogue-quality.js, no W1' lib files modified.

Confirmation: `git diff src/services/dialogue-quality.js src/lib/provider-chain.js | wc -l` → `0`.

---

## Self-review checklist

- [x] **v1 branch代码与原代码 byte-identical** — verified via:
  - `diff -u backup new | grep "^-[^-]" | wc -l` → `0` (zero deletion lines for both files)
  - direct slice diff (`diff <(sed -n '307,456p' new) <(sed -n '301,450p' backup)`) returns clean
  - 885 original lines preserved char-for-char at original 6-space indent, just wrapped by an outer `if (env.PROMPT_VERSION === 'v1') { … }`
- [x] **没改 services/** — no edits to `src/services/*.js` (verified via `git status` — only `src/config/env.js` and `src/routes/story.js` modified)
- [x] **没改 provider-chain.js / dialogue-quality.js** — both unmodified (`git diff src/lib/provider-chain.js src/services/dialogue-quality.js` returned 0 lines)
- [x] **没改 W1' 6 lib(它们仍 dormant)** — the 6 lib files (`dialogue_orchestrator.js`, `elements_manager.js`, `image_prompt_sanitizer.js`, `language_detector.js`, `llm_response_validator.js`, `repetition_detector.js`) are still listed as untracked-only (`??`) in `git status`; they are only **imported** from the route file (read-only side)
- [x] **没改 .env 文件** — `.env` not touched. `process.env.PROMPT_VERSION` is `undefined` in prod and falls back to `'v1'` via the IIFE in `env.js`
- [x] **PROMPT_VERSION 默认 v1** — verified by Phase 3.1 test (`PROMPT_VERSION: v1`, `PASS: default is v1`)
- [x] **没 git commit / push** — `git log -1 --oneline` still points to `3f93f83 feat(dialogue): co-creation revamp v7.2 …` (HEAD untouched); no commits made in this session
- [x] **没 pm2 restart** — pm2 was not invoked
- [x] **没装新 npm 包** — `package.json` unchanged by this workorder; no `npm install` run; v2-lite branch only uses built-in `fetch` + `JSON` (matches existing `services/llm.js` pattern)
- [x] **Track B 测试套件全 PASS** — 74/74 green across the four named suites

---

## Notes for review

### 1. v2-lite branch `llmCallFn` design
The work order said "复用现有的 LLM 调用机制 (Gemini 2.5 Flash) … 不要新建 LLM 客户端". Since `services/llm.js` does not export a generic "call Gemini with arbitrary system prompt" helper, the v2-lite branch uses the **same mechanism** — bare `fetch()` to the same `gemini-2.5-flash:generateContent` URL using `env.GEMINI_API_KEY`, the same `responseMimeType: 'application/json'`, and the same `thinkingConfig: { thinkingBudget: 0 }`. This is not a "new client" — it is a literal duplicate of the existing fetch pattern in `services/llm.js`. To avoid touching `services/llm.js` (forbidden), and to keep the v2-lite logic self-contained for W3 to easily swap the system prompt, the inline fetch was placed in the route closure. A mock-mode short-circuit (`USE_MOCK_AI=1` or missing `GEMINI_API_KEY`) returns deterministic placeholder JSON, so CI / unit tests never reach the network.

### 2. v2-lite branch session shape adapter
The orchestrator (W1') expects history with roles `'child'` / `'bear'`; v1 session uses `'user'` / `'assistant'`. The branch builds an isolated `orchestratorSession` with renamed roles, calls `orchestrateDialogue`, then writes results back into `session` in v1 shape (so `/confirm` still works and so `previousQuestionText` logic works on subsequent turns if the operator switches PROMPT_VERSION mid-session). `intent==='recap'` is mapped to `done=true`, populating `session.storyOutline` (required by `/confirm`) and `session.summary` (required by `/generate`).

### 3. Response shape compatibility
v2-lite returns the same fields as v1 — `round, done, mode, lastTurnSummary, arcUpdate, nextQuestion, summary, storyOutline, safetyLevel, safetyReplacement, _provider` — plus a `_promptVersion` debug field as suggested in the work order. Frontend should be unaffected. TTS pre-gen for `nextQuestion` uses the same `ttsSynthesize({purpose:'dialogue'})` call as v1.

### 4. Why `lib/dialogue_orchestrator.js` import is safe even when PROMPT_VERSION=v1
ESM static imports are resolved at module load. Importing `orchestrateDialogue` only loads the orchestrator module + its 4 transitive lib siblings (`detectRepetition`, `detectLanguage`, `mergeElements/extractRealWorldHooks`, `validateLLMResponse`). None of them perform side-effects at import time. So importing them is dormant — the runtime cost is one-time module init at boot, **zero cost per request when PROMPT_VERSION=v1**.

---

## Phase 6 — Stopping

Per work order §Phase 6 — **stopped after Phase 5**. Did not pm2 restart, did not switch PROMPT_VERSION, did not start W3.

W3 should be a separate workorder issued after Kristy's review of this report.

**End of W2 report.**

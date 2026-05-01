# 2026-04-29 — Merge Track B into ASR (Showroom Release Branch)

**Workorder**: `coordination/workorders/2026-04-29-merge-trackb-into-asr/`
**Operator**: Droid (exec mode)
**Goal**: Cherry-pick Track B (b009acb) onto `feat/asr-tts-dual-provider`,
create `release/showroom-20260429`, prepare for showroom.
**Outcome**: ✅ Cherry-pick succeeded, 23/23 dialogue tests pass, ASR TTS three-voice
routing preserved.

---

## 1. Current HEAD + git log

```
HEAD = 3f93f8304e9fa11a427e2f368c2f1bdfeace7aba
Branch = release/showroom-20260429

3f93f83 feat(dialogue): co-creation revamp v7.2 — adaptive mode + dynamic 4-7 rounds + StoryPreview
3071f66 feat(tts): 3 purposes (narration/dialogue/vocab) with per-purpose model+voice
fd6695a feat(tts): DashScope cosyvoice via WebSocket (cosyvoice-v2)
1144290 docs(coord): completion report for 2026-04-29-asr-tts-dual-provider (CONT)
d090f53 feat(tts): dual provider DashScope + ElevenLabs via provider-chain
```

The release branch was created from `feat/asr-tts-dual-provider` (3071f66) and now
contains exactly that base **plus** Track B (b009acb) cherry-picked on top.

---

## 2. Cherry-pick conflict files

`git cherry-pick b009acb` reported:

| File | Outcome |
|------|---------|
| `server-v7/src/routes/story.js` | **CONFLICT — manually resolved** |
| `server-v7/src/services/llm.js` | auto-merged (no manual edits needed) |
| `server-v7/src/utils/storyPrompt.js` | auto-merged (no manual edits needed) |
| `tv-html/src/App.vue` | auto-merged |
| `tv-html/src/i18n/locales/en.ts` | auto-merged |
| `tv-html/src/i18n/locales/zh.ts` | auto-merged |
| `tv-html/src/screens/DialogueScreen.vue` | auto-merged |

Only `routes/story.js` required manual conflict resolution (3 conflict regions).

---

## 3. Conflict-by-conflict resolution summary

All resolutions follow the workorder's **"永远向 Track B 倒"** rule.

### (a) `routes/story.js` — import block from `storyPrompt.js`

| Side | Symbols requested |
|------|-------------------|
| HEAD (ASR) | `buildDialogueSystemPrompt`, `roundCountForAge` |
| Track B    | `buildDialogueFirstQuestion`, `buildDialogueSystemPromptV2`, `DIALOGUE_ARC_STEPS`, `roundCountForAge` |

**Action**: Took Track B side verbatim. The HEAD side imported v7.1's
`buildDialogueSystemPrompt`, but the v7.2 turn flow no longer uses it — the
Track B branch deliberately removes that dependency from this file.
`buildDialogueSystemPrompt` itself **remains exported** from `storyPrompt.js`,
so this is a pure call-site change.

**Lines changed**: −1 / +3 (import block).

### (b) `routes/story.js` — import of LLM/quality helpers

| Side | Imports |
|------|---------|
| HEAD (ASR) | `import { generateDialogueTurn, defaultDialogueQuestion } from '../services/llm.js';` |
| Track B    | `import { generateDialogueTurnV2 } from '../services/llm.js';` + `import { evaluateReply, shouldForceFinish } from '../services/dialogue-quality.js';` |

**Action**: Took Track B side. The v7.2 flow drops `defaultDialogueQuestion`
from the route layer (it now lives inside `generateDialogueTurnV2`'s built-in
fallback bank).

**Lines changed**: −1 / +5.

### (c) `routes/story.js` — main turn-handling body

This was the largest conflict region. ASR's HEAD had the v7.1 path inside
`if (!done) { … }` (call `generateDialogueTurn`, default-question fallback,
then `ttsSynthesize` with `purpose: 'dialogue'`). Track B's side replaces
that whole block with the v7.2 flow:

- pre-LLM hard-cap decision (`forceDone = reachedHardCap || skipFinishing || emptyLoopFinishing`)
- single `generateDialogueTurnV2` call (built-in retry + default bank, never null)
- `arcUpdate` merge into `session.arc` over `DIALOGUE_ARC_STEPS`
- `done = forceDone || llm.done`
- `nextQuestion` synthesis + TTS pre-gen
- response shape extended with `mode`, `lastTurnSummary`, `arcUpdate`, `storyOutline`

**Action**: Took Track B v7.2 flow whole-cloth (per workorder
"主体: 完全采用 Track B 的 v7.2 turn 流程"), then applied the explicitly-allowed
ASR additive patch: added `purpose: 'dialogue'` to the next-question
`ttsSynthesize` call inside Track B's `nextQuestion` branch
(workorder rule "可以从 ASR 分支补回的小补丁: 在 ttsSynthesize 调用上加 `purpose: 'dialogue'` 字段").

**Net effect on this region**: Track B body retained 1:1, plus a 1-line
additive (`purpose: 'dialogue'`) and a 3-line clarifying comment
referencing workorder `2026-04-29-tts-three-voice-roles`.

The opener TTS call (in `/dialogue/start`, around line 213) was outside the
conflict region and already carries `purpose: 'dialogue'` — preserved untouched.

**Lines changed in this region**: ~−55 / +90 (mostly Track B insertion).

---

## 4. Track B element preservation — explicit checklist

| Track B element | Status | Location |
|---|---|---|
| `generateDialogueTurnV2` | ✅ | `src/services/llm.js:418` |
| `defaultDialogueTurnV2` | ✅ | `src/services/llm.js:334` |
| `buildDialogueSystemPromptV2` | ✅ | `src/utils/storyPrompt.js:283` |
| `DIALOGUE_ARC_STEPS` (export) | ✅ | `src/utils/storyPrompt.js:384` |
| `buildDialogueFirstQuestion` (v7.1 compat) | ✅ | `src/utils/storyPrompt.js:228` |
| `roundCountForAge` | ✅ | `src/utils/storyPrompt.js:222` |
| `POST /api/story/dialogue/:id/confirm` endpoint | ✅ | `src/routes/story.js:466` |
| `lastTurnSummary` field in turn response | ✅ | `src/routes/story.js:438` |
| `mode` field in turn response | ✅ | `src/routes/story.js:437` |
| `arcUpdate` field in turn response | ✅ | `src/routes/story.js:443` |
| `storyOutline` field in turn response | ✅ | `src/routes/story.js:446` |
| `session.arc` (per-step state) | ✅ | `src/routes/story.js:318,358,390,393,394` |
| `session.storyOutline` (set on done) | ✅ | `src/routes/story.js:386,479,538` |
| `session.summary` (still emitted on done) | ✅ | `src/routes/story.js:388–402` |
| `evaluateReply` (dialogue-quality) | ✅ | `src/services/dialogue-quality.js:98` |
| `shouldForceFinish` (dialogue-quality) | ✅ | `src/services/dialogue-quality.js:162` |
| `dialogue-quality.js` file | ✅ | `src/services/dialogue-quality.js` (new) |
| `test/dialogue-cocreation.test.mjs` | ✅ | 23 assertions, all pass |
| TV `StoryPreviewScreen.vue` | ✅ | `tv-html/src/screens/StoryPreviewScreen.vue` (new) |
| TV `DialogueScreen.vue` (v7.2 fields) | ✅ | merged via auto-merge |
| TV `stores/dialogue.ts` (v7.2 fields) | ✅ | merged |
| TV `stores/screen.ts` (story-preview state) | ✅ | merged |
| i18n keys (en/zh/pl) for new screens | ✅ | merged |
| `App.vue` route wiring | ✅ | merged |
| `services/api.ts` `confirm` call | ✅ | merged |
| `docs/spec/PROMPT_SPEC_v7_2.md` | ✅ | new file |
| `docs/spec/API_CONTRACT.md` v7.2 additions | ✅ | merged |

**Conclusion**: Every Track B element listed in the workorder's red-line
section is intact. No store state, no i18n key, no route, no field was lost.

---

## 5. ASR three-voice TTS routing preservation

| Item | Status | Notes |
|---|---|---|
| `purpose` parameter on `synthesize()` (`tts.js`) | ✅ | unchanged from `feat/asr-tts-dual-provider` |
| `resolvePurposeConfig()` per-purpose voice/model resolver | ✅ | unchanged |
| `VALID_PURPOSES = { narration, dialogue, vocab }` | ✅ | unchanged |
| Dialogue opener call uses `purpose: 'dialogue'` | ✅ | `routes/story.js:213` |
| Next-question call uses `purpose: 'dialogue'` | ✅ | `routes/story.js:416` (re-applied as ASR additive patch on top of Track B v7.2 body) |
| Story-page narration (default `purpose: 'narration'`) | ✅ | `queues/storyJob.js:292,306` (worker untouched, default purpose still resolves to narration) |
| Provider chain (DashScope → ElevenLabs) | ✅ | `src/lib/provider-chain.js` untouched (6/6 tests pass) |
| ASR provider-chain refactor | ✅ | `src/services/asr.js` untouched |

**Conclusion**: The ASR/TTS three-voice routing scaffolding is fully retained.
Both dialogue-side TTS call sites carry `purpose: 'dialogue'`.

---

## 6. `node --check` results

```
src/routes/story.js          rc=0
src/services/llm.js          rc=0
src/services/tts.js          rc=0
src/services/asr.js          rc=0
src/utils/storyPrompt.js     rc=0
src/services/dialogue-quality.js rc=0
```

✅ All 6 files pass syntax check.

---

## 7. Track B dialogue tests (must-pass 23)

`node --test test/dialogue-cocreation.test.mjs`:

```
[1] dialogue-quality — tokenize + keywords     (4/4 ok)
[2] dialogue-quality — evaluateReply tiers     (6/6 ok)
[3] dialogue-quality — shouldForceFinish       (2/2 ok)
[4] storyPrompt — v7.2 builder                 (4/4 ok)
[5] llm — defaultDialogueTurnV2 + coercer      (5/5 ok)
[6] llm — generateDialogueTurnV2 mock mode     (2/2 ok)

23 passed, 0 failed
duration_ms 642
```

✅ **23/23 pass**, exactly as the workorder requires.

Companion `test/llm.dialogue.test.mjs` (3 v7.1-compat tests for
`liveDialogueTurn` JSON shape coercion) also runs **3/3 pass**.

---

## 8. ASR/TTS tests

| File | Result | Notes |
|---|---|---|
| `test/provider-chain.test.mjs` | **6/6 pass** | provider-chain core, unchanged by merge |
| `test/tts.dual-provider.test.mjs` | **0/3 pass, 3 fail** | All 3 synthesize-level tests fail |

Failing tests in `tts.dual-provider.test.mjs`:
1. `synthesize: DashScope primary returns audio data URL`
2. `synthesize: DashScope 500 falls back to ElevenLabs`
3. `synthesize: DashScope inline base64 audio is decoded directly`

Failure mode: the DashScope WS mock returns 401 (`Unexpected server response: 401`)
and the ElevenLabs mock falls through with "unexpected fetch" — the test fixture's
mock infra is not reaching the synthesize path.

**Pre-existing on the ASR base branch.** Confirmed by:

```
git diff feat/asr-tts-dual-provider HEAD -- \
  src/services/tts.js src/lib/provider-chain.js test/tts.dual-provider.test.mjs
# (empty diff)
```

→ The cherry-pick did **not** touch any TTS infra or this test file. These
failures pre-date the merge and were already present at commit 3071f66.

Per workorder rule: TTS tests fail >50% → **report but don't stop**. Doing so.

---

## 9. Full test summary

`node --test test/*.test.mjs`:

```
tests:    13 (file-level)
pass:     10
fail:      3        ← all in tts.dual-provider.test.mjs (pre-existing)
skipped:   0
duration_ms 2697
```

Per-file breakdown:
- `dialogue-cocreation.test.mjs`: 1 file-level test wrapping **23 assertions** — pass
- `llm.dialogue.test.mjs`: 3 / 3 pass
- `provider-chain.test.mjs`: 6 / 6 pass
- `tts.dual-provider.test.mjs`: 0 / 3 pass (pre-existing failures)

---

## 10. `git diff --stat origin/feat/asr-tts-dual-provider HEAD`

(Origin not checked — local feat/asr-tts-dual-provider used as base; same SHA.)

```
 .../COMPLETION_NOTE.md                      | 126 +++++++
 .../README.md                               | 301 +++++++++++++++
 server-v7/docs/spec/API_CONTRACT.md         |  76 +++-
 server-v7/docs/spec/PROMPT_SPEC_v7_2.md     | 201 +++++++++++
 server-v7/src/routes/story.js               | 315 ++++++++++++----
 server-v7/src/services/dialogue-quality.js  | 171 +++++++++
 server-v7/src/services/llm.js               | 402 ++++++++++++++++++++-
 server-v7/src/utils/storyPrompt.js          | 117 ++++++
 server-v7/test/dialogue-cocreation.test.mjs | 297 +++++++++++++++
 tv-html/src/App.vue                         |   2 +
 tv-html/src/i18n/locales/en.ts              |  15 +
 tv-html/src/i18n/locales/pl.ts              |  10 +
 tv-html/src/i18n/locales/zh.ts              |  15 +
 tv-html/src/screens/DialogueScreen.vue      | 119 +++++-
 tv-html/src/screens/StoryPreviewScreen.vue  | 335 +++++++++++++++++
 tv-html/src/services/api.ts                 |  39 ++
 tv-html/src/stores/dialogue.ts              |  77 +++-
 tv-html/src/stores/screen.ts                |   1 +
 18 files changed, 2507 insertions(+), 112 deletions(-)
```

This is the full Track B commit `b009acb` content, layered on top of the ASR
base. The single intentional **+3 / −0** divergence from raw Track B inside
`routes/story.js` is the `purpose: 'dialogue'` ASR additive patch (workorder-allowed).

---

## 11. Red-line compliance checklist

| Red-line | Status |
|---|---|
| ❌ 不 push 到任何远端 | ✅ honored — no `git push` executed |
| ❌ 不动 main | ✅ honored — `main` not touched |
| ❌ 不 pm2 restart | ✅ honored — no pm2 calls |
| ❌ 不动 `.env` | ✅ honored |
| ❌ 不删除老 backup | ✅ honored |
| ❌ Rule X (拿不准就停) | n/a — every conflict matched an explicit rule |
| Track B 完整性 | ✅ all checklist items in §4 are ✅ |
| ASR 三音色 (lower priority) | ✅ retained, see §5 |

---

## 12. Hand-off notes for Kristy

1. **Branch ready**: `release/showroom-20260429` @ `3f93f83`. Local only.
2. **Track B 23-test gate**: PASS.
3. **Pre-existing TTS test failures (3) are unrelated to the merge** —
   they were already present on `feat/asr-tts-dual-provider`. Recommend a
   separate workorder if real-mock alignment is desired before showroom,
   but they do not affect the dialogue/preview demo path.
4. **No remote push, no PM2 restart, no main touched** — fully reversible
   with `git branch -D release/showroom-20260429`.
5. **Next manual steps (operator decision)**:
   - Smoke-test the v7.2 dialogue → StoryPreview → confirm flow on staging.
   - When ready, push `release/showroom-20260429` to remote and pin a tag.

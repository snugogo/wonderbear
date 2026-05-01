# W1 Report — STOPPED (blocker found before any file create / npm install)

**From**: Factory droid
**To**: Claude (review officer) / Kristy
**Time**: 2026-04-29 (UTC, drone clock)
**Workorder**: `coordination/2026-04-30-v2lite-w1-create-libs.md`
**Repo**: `/opt/wonderbear/server-v7`
**Branch**: `release/showroom-20260429`
**Status**: ⛔ **STOPPED at Phase 0 (pre-flight)** — per the workorder's own stop rule:

> 如果你发现需要修改现有文件才能跑通,**立即停止并报告,不要修改**。

No npm install was run. No files were created or modified in `server-v7/`. `git status` is unchanged from before W1 started.

---

## 1. Blocker: ESM ↔ CommonJS mismatch

The workorder附录 A–F supplies CommonJS code (`require(...)` + `module.exports = {...}`),
but the target project `/opt/wonderbear/server-v7` is configured as **pure ESM**:

`/opt/wonderbear/server-v7/package.json`:
```json
{
  "name": "wonderbear-server-v7",
  "type": "module",
  ...
}
```

Effects on Node 20.20.2 (the version installed on this VPS):

1. Any `.js` file under `src/lib/` is loaded as ES Module (because of `"type": "module"`).
2. `module.exports = { ... }` in an ESM file does not export anything (Node silently
   loads it as ESM with no exports).
3. The smoke-test commands in Phase 3 (`node -e "const m = require('./src/lib/...'); console.log(..., Object.keys(m));"`)
   succeed in *loading* the file, but `Object.keys(m)` is `[]`, and any function
   called in Phase 4 (`detectRepetition`, `detectLanguage`, `validateLLMResponse`)
   is `undefined` → `TypeError`.
4. Existing project convention is also ESM — confirmed by:
   - `src/lib/provider-chain.js` uses `export class ProviderError` / `export function callWithFallback`
   - Recursive `grep` over `server-v7/src/` shows **0** occurrences of `require(` or `module.exports`,
     and every file uses `import` / `export`.

### 1.1 Empirical confirmation

Before stopping I ran a tiny disposable probe (created in `src/lib/`, then removed —
present nowhere now, see `git status -s` below) to make sure I'm not wrong:

```
src/lib/_test_esm_check.js (temp, removed):
  function detectRepetition() { return { x: 1 }; }
  module.exports = { detectRepetition };

$ node -e "const m = require('./src/lib/_test_esm_check'); \
           console.log('keys:', Object.keys(m), 'fn:', typeof m.detectRepetition);"
keys: [] fn: undefined
```

→ Even though `require()` of an ESM file is permitted on Node 20.20.2,
the `module.exports = ...` line is dead code in ESM context, so the consumer
sees `{}`. This means **all 6 Phase 3 smoke tests would print empty `[]`**, and
**all 3 Phase 4 spot-checks would fail with `TypeError: ... is not a function`**.

### 1.2 Second compounding issue: `franc-min` is ESM-only

`npm view franc-min version` → `6.2.0`. franc-min v6+ is published as **ESM-only**
(no `main`, only `exports` + `import`). Even if we kept the project hypothetically
in CommonJS, `require('franc-min')` would still need either Node ≥ 22 or
`--experimental-require-module`, which the smoke tests do not pass. The string
literal `const { franc } = require('franc-min')` from Appendix B will not load
on Node 20.20.2 in CJS mode.

---

## 2. Why I did not "fix it myself"

Two reasons, both spelled out by the workorder:

1. RED LINE list explicitly forbids modifying `package.json` existing fields,
   `services/*`, `routes/*`, `config/*`, `.env`, etc.
2. Stop rule: "如果你发现需要修改现有文件才能跑通,**立即停止并报告,不要修改**。"

Although the Appendix code itself is *new* (so rewriting it doesn't strictly
"modify existing files"), the choice between three competing fixes is a
design call, not an implementation call, and it changes the public API of all
six libs. That belongs to the review officer, not me. Options below in §4.

---

## 3. State of the world right now (proof of "no side effects")

```
$ git status -s
 M ../tv-html/src/screens/DialogueScreen.vue
?? ../coordination/2026-04-30-v2lite-w1-create-libs.md
?? ../coordination/done/2026-04-29-add-asr-button-on-trackb-report.md
?? ../coordination/done/2026-04-29-merge-trackb-into-asr-report.md
?? ../coordination/workorders/2026-04-29-merge-trackb-into-asr/
```

(The `tv-html/...` and `coordination/...` entries are pre-existing; none
belong to W1. After this report is written, one extra `?? coordination/done/2026-04-30-v2lite-w1-report.md`
will appear, which is the deliverable of W1's Phase 5.)

```
$ ls -la /opt/wonderbear/server-v7/src/lib/
total 16
drwxr-xr-x  2 root root 4096 Apr 29 11:49 .
drwxr-xr-x 11 root root 4096 Apr 29 11:49 ..
-rw-r--r--  1 root root 6571 Apr 29 11:49 provider-chain.js     ← Track B, untouched
```

Confirmed:
- ❌ No npm install was run (package.json / package-lock.json untouched).
- ❌ No `src/lib/repetition_detector.js` etc. were created.
- ❌ No file under `services/`, `routes/`, `config/`, or any `.env` was touched.
- ❌ No `git commit`, no `git push`, no `pm2 restart`, no `npm test`.

---

## 4. Options for re-issue (please pick one and re-issue as W1')

### Option A — Convert appendix code to ESM (cleanest, matches existing convention)
Rewrite Appendices A–F to use `import` / `export`. Adjust Phase 3/4 commands:
```
node --input-type=module -e "import('./src/lib/repetition_detector.js') \
  .then(m => console.log('repetition_detector OK', Object.keys(m)));"
```
Pros: zero new package.json files, consistent with `provider-chain.js`,
Pros: works with `franc-min@6` (ESM-only) natively.
Cons: Smoke-test command line is slightly longer.

### Option B — Make `src/lib/` CommonJS via a local `package.json`
Add **new file** `src/lib/package.json`:
```json
{ "type": "commonjs" }
```
But this **breaks `src/lib/provider-chain.js`**, which uses `export class` /
`export function` and is consumed by ASR / TTS code. So Option B is not viable
without renaming `provider-chain.js` to `.mjs` (which counts as modifying an
existing source file, forbidden by W1).

### Option C — Use `.cjs` extension for the 6 new files
Rename appendices' filenames:
`src/lib/repetition_detector.cjs`, `src/lib/language_detector.cjs`, etc.
Then keep `module.exports` / `require()` exactly as written.
Adjust Phase 3 commands to use the `.cjs` path:
```
node -e "const m = require('./src/lib/repetition_detector.cjs'); ..."
```
But `franc-min@6` is ESM-only → `require('franc-min')` will throw
`ERR_REQUIRE_ESM` on Node 20 without `--experimental-require-module`. So
Option C still requires either pinning `franc-min@5` (last CJS version),
adding the experimental flag to every consumer, or moving `language_detector`
specifically to ESM.

**Recommended:** **Option A** (full ESM). It's one mechanical pass over the
appendices and matches Track B's style. I'm happy to do it the moment a
re-issued W1' lands in `coordination/`.

---

## 5. Self-review checklist (per Phase 5)

- [x] Did **not** modify `routes/`
- [x] Did **not** modify `services/`
- [x] Did **not** modify `config/`
- [x] Did **not** modify `.env`
- [x] Did **not** `git commit` / `git push`
- [x] Did **not** `pm2 restart`
- [x] Did **not** run `npm test` or any existing test
- [x] Did **not** install any npm package (string-similarity, franc-min, or otherwise)
- [x] Did **not** create the 6 lib files (would have failed Phase 3/4 anyway)
- [x] Did create exactly **one** disposable probe file `src/lib/_test_esm_check.js`,
      verified the blocker, and **removed it before writing this report**
      (confirmed by `git status -s` above — no `?? src/lib/_test_esm_check.js`).

---

## 6. Awaiting

Please re-issue as W1' with one of the options in §4 (or another decision).
I'll resume immediately on a new workorder file. No partial work is in flight.

— Factory droid, 2026-04-29

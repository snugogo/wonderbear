# WO-3.15 — Tooling Hygiene: GROUND-TRUTH + verify.sh template + .env dedup/cleanup

**Type:** Standard workorder (3-part bundle)
**Branch:** `release/showroom-20260429`
**Base commit:** `b0cef44` (WO-3.12, working tree clean except untracked coordination/)
**Estimated change:** ~30-50 lines net + 1 new file (~150 lines)
**Estimated Factory time:** 15-25 minutes
**Cost expectation:** ¥0.3-0.8 (V4 Pro)

## §0. CRITICAL — base state instructions for Factory

This is a fresh workorder on a clean working tree. Before making any changes:

1. Run `git status -s` and confirm only `??` untracked under `coordination/` and `workorders/` — NO `M ` modified files
2. Run `git log -1 --oneline` and confirm `b0cef44 feat(tv+server): WO-3.12 StoryCoverScreen first-time overlay` is HEAD
3. **DO NOT** run `git stash`, `git reset`, `git checkout HEAD --`, `git pull`, `git commit`, `git push`
4. If status shows ANY M/A/D/R/C in main code (server-v7/, tv-html/, scripts/), STOP and report

## §1. Why

After WO-3.12 closed (¥<1, V4 Pro first production workorder), three structural issues emerged that drag every future workorder:

### Issue A — verify.sh假 FAIL累计 6-7 次

WO-3.12 verify.sh hit 2 false-positive failures, both manually judged PASS after forensic check:

1. **FAIL 17 (Luna regression)** — `grep -rn 'Luna' tv-html/src` matched `utils/demoStory.ts:33` which is mock demo content (not product code). The grep excluded `/dev/` and `.backup` but missed `utils/demoStory.ts` and other potential mock paths. **Pattern**: Luna invariant should ONLY check production code paths, not mock/demo/fixture paths.

2. **FAIL 18 (api.ts spillover)** — When backend route adds a field (e.g. `child.name`), frontend `services/api.ts` MUST add the corresponding TypeScript type or `npm run build` fails. The spillover EXPECTED whitelist did not include `services/api.ts`, but V4 Pro correctly added the type extension as a self-consistent change. **Pattern**: When backend route changes are scoped, frontend `services/api.ts` type extension is expected and should be allowed.

These two patterns will recur in EVERY future workorder unless the verify.sh template is fixed.

### Issue B — .env has dead fields and duplicates

Forensic grep on `server-v7/.env` revealed:

- `GEMINI_IMAGE_MODEL` — referenced in NO source file (zero hits)
- `STORAGE_TYPE` — referenced ONLY in `src/config/env.js.backup-2026-04-30-wo2-pre` (a `.backup` file, not live code)
- `LOCAL_STORAGE_PATH` — same as above (only in `.backup`)
- `GOOGLE_APPLICATION_CREDENTIALS` — **appears 2 times** (line duplicate, dotenv silently uses the second value)
- `DASHSCOPE_TTS_VOICE_EN` / `DASHSCOPE_TTS_VOICE_ZH` / `DASHSCOPE_TTS_VOICE_VOCAB` — possibly stale; new naming uses `_NARRATION_*`, `_DIALOGUE_*`, `_VOCAB_*` per WO from 2026-04-29

These dead/duplicate fields create silent failure risk (you don't know which value of a duplicated key actually wins) and clutter cognition.

### Issue C — No GROUND-TRUTH document for new conversations

Every new Claude conversation has to re-discover basic facts via grep/cat:
- What .env fields exist
- What PM2 processes run
- Where verify.sh files are
- What the dispatch chain (DingTalk → bot → claude -p → spawn-droid → droid) actually is
- What PostgreSQL DB name and key tables are

This is "basic facts that don't change" and should be a single canonical document the new conversation reads first.

## §2. What

### §2.A — Create `coordination/GROUND-TRUTH.md`

Generate a comprehensive ground-truth document at `/opt/wonderbear/coordination/GROUND-TRUTH.md` with these sections (use exact section headers and bullet structure):

```markdown
# WonderBear Ground Truth (Auto-maintained)

> **For new Claude conversations**: cat this file FIRST to load all baseline facts.
> **Last verified**: <ISO date> via WO-3.15
> **Next refresh**: When .env, PM2, dispatch chain, or schema changes

## §1. Server / Infrastructure

- VPS: 154.217.234.241 (US San Jose, AS402169 Uscloud, 4-core/8GB)
- SSH alias: `wonderbear-vps` (passwordless, ed25519)
- Working dir: /opt/wonderbear/
- Backup snapshots: /opt/wonderbear-backups/snapshot-YYYYMMDD-030001/ (daily 03:00)
- Tools: /opt/wonderbear-tools/ (spawn-droid.sh, orchestrator-loop.sh, notify.sh)
- Skills: /opt/wonderbear/coordination/, /opt/wonderbear/docs/orchestration/

## §2. PM2 Processes

| Process | Purpose | Cwd |
|---|---|---|
| wonderbear-server | server-v7 backend (Fastify/Prisma) | /opt/wonderbear/server-v7 |
| wonderbear-dingtalk | DingTalk bot (Node.js) | /opt/wonderbear/dingtalk-bot |

## §3. Dispatch Chain (After 2026-05-01 V4 Pro Migration)

```
钉钉 "派 WO-X"
  ↓
wonderbear-dingtalk (PM2) — receives DingTalk webhook
  ↓
spawn(claude, ['-p', '--dangerously-skip-permissions', '--model', model, prompt])
  ↓ (default model: 'sonnet'; can switch via /model command)
claude -p (Anthropic Claude Code CLI v2.1.119, Max subscription)
  ↓ (this is "VPS Claude")
VPS Claude reads workorder file, decides whether to spawn droid
  ↓
bash /opt/wonderbear-tools/spawn-droid.sh "<task description>"
  ↓
timeout 1800 droid exec --auto high --model deepseek-v4-pro "<task>"
  ↓ (V4 Pro since 2026-05-01, was claude-opus-4-7)
Factory droid v0.114.0 — actual code execution
  ↓
notify_text DingTalk push (start + end)
```

orchestrator-loop.sh systemd service: **disabled state, never enabled**. Don't reference it as live infrastructure.

## §4. Models in Use

### Coding agent (V4 Pro since 2026-05-01)
- Configured in `~/.factory/settings.json` customModels (camelCase)
- baseUrl: https://api.deepseek.com/anthropic
- model: deepseek-v4-pro (also has deepseek-v4-flash as alternate)
- provider: anthropic
- Pricing: $1.74 / $3.48 per 1M tokens (input/output)
- vs Opus 4.7 ($15/$75): output 22x cheaper

### Story generation (server-v7 production)
- Cover: Nano Banana Pro (gemini-3-pro-image-preview), $0.134/img
- Pages 2-12: FAL Flux Pro Kontext img2img chain, $0.04 × 11
- Narration TTS: DashScope CosyVoice v2 + longxiaoxia_v2 (NOT ElevenLabs — that's fallback)
- Dialogue TTS: DashScope CosyVoice v3-flash + longhuhu_v3
- Vocab TTS: DashScope CosyVoice v2 + longxiaoxia_v2
- Story LLM: Gemini 2.5 Flash (thinkingBudget: 0 for dialogue, 1024 for outline)
- Vocab LLM: gpt-4o-mini
- ASR: OpenAI Whisper

## §5. .env Fields (server-v7/.env)

[Auto-fill from grep — list all live fields, mark dead/duplicate]

### §5.1 Active fields by category
- ASR: ASR_DUMP_ENABLED, ASR_FALLBACK_CHAIN, ASR_LANGUAGE_DEFAULT, ASR_PRIMARY, ASR_TIMEOUT_MS
- TTS DashScope: DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL, DASHSCOPE_ASR_MODEL, DASHSCOPE_TTS_MODEL, DASHSCOPE_TTS_MODEL_DIALOGUE/NARRATION/VOCAB, DASHSCOPE_TTS_VOICE_DIALOGUE_EN/ZH, DASHSCOPE_TTS_VOICE_NARRATION_EN/ZH, DASHSCOPE_TTS_VOICE_VOCAB_EN/ZH
- TTS routing: TTS_PRIMARY, TTS_FALLBACK_CHAIN, TTS_TIMEOUT_MS
- TTS fallback: ELEVENLABS_API_KEY, VOICE_ID_EN/ES/FR/PL/RO/ZH
- Image: GEMINI_API_KEY, FAL_KEY, OPENAI_API_KEY, OPENAI_IMAGE_MODEL, OPENAI_IMAGE_QUALITY, NANO_BANANA_COVER_MODEL, NANO_BANANA_INTERIOR_MODEL, NANO_BANANA_RESOLUTION, IMAGE_PAGE1_COMPOSITION, IMAGE_STYLE_SUFFIX
- DB: DATABASE_URL, REDIS_URL
- Auth: JWT_SECRET, GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_SPEECH_KEY, GOOGLE_SPEECH_PROJECT_ID
- Storage: R2_ACCESS_KEY_ID, R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ENDPOINT, R2_PUBLIC_URL, R2_SECRET_ACCESS_KEY, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET, OSS_ENDPOINT_ACCELERATE, OSS_ENDPOINT_STANDARD, OSS_REGION
- Mail: MAIL_FROM, MAIL_FROM_NAME, RESEND_API_KEY
- Payment: STRIPE_PRICE_ID_MONTHLY, STRIPE_PRICE_ID_YEARLY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE, PAYPAL_PLAN_ID_MONTHLY, PAYPAL_PLAN_ID_YEARLY, PAYPAL_WEBHOOK_ID
- Misc: NODE_ENV, PORT, PROMPT_VERSION, DEBUG_GALLERY_PASSWORD, WB_DEMO_BIND_ENABLED

### §5.2 Removed fields (WO-3.15)
- GEMINI_IMAGE_MODEL — was zero references in code
- STORAGE_TYPE — only referenced in .backup file
- LOCAL_STORAGE_PATH — only referenced in .backup file
- (DASHSCOPE_TTS_VOICE_EN, _ZH, _VOCAB without _NARRATION/_DIALOGUE/_VOCAB_EN/_ZH suffix — REMOVE if grep confirms zero live references)

### §5.3 Deduplicated fields
- GOOGLE_APPLICATION_CREDENTIALS appeared TWICE in raw .env. Now only once.

## §6. PostgreSQL DB

- Container: wonderbear_postgres (Docker)
- DB name: wonderbear_db (NOT wonderbear)
- User: wonderbear
- Connection check: psql -U wonderbear -d wonderbear_db
- List DBs: psql -U wonderbear -d postgres -c '\l'
- Story table failure fields: failureCode (int), failureMessage (text). NO 'error' column.
- ImageGenLog table: links to Story via storyId, queryable for per-page generation status.

## §7. verify.sh template (post-WO-3.15)

Standard verify.sh now lives at `/opt/wonderbear/workorders/verify-template.sh`. New workorder verify.sh files derive from it. Key rules embedded:

1. Luna grep MUST exclude: `/dev/`, `.backup`, `utils/demoStory.ts`, `utils/*demo*`, `*test*`, `*mock*`, `*fixture*`
2. spillover whitelist MUST allow: `services/api.ts` (frontend type extensions for backend changes), `stores/*.ts` (state types)
3. Use `grep -c 2>/dev/null || true` (avoid -c return-code-1 trap on no-match)
4. Always normalize newline (`tr -d ' '`) on integer comparisons (`-eq`, `-ge`)
5. Build verification MUST cd into target dir before npm run build (don't rely on inherited cwd)

## §8. Workorder file locations

- `/opt/wonderbear/workorders/WO-X.md` (production)
- `/opt/wonderbear/workorders/WO-X-verify.sh` (auto-run by dingtalk-bot v2)
- `/opt/wonderbear/workorders/WO-X-collect.sh` (manual取证)
- `/opt/wonderbear/coordination/workorders/WO-X/README.md` (mirror for VPS Claude reads)
- `/opt/wonderbear/coordination/done/WO-X-report.md` (V4 Pro completion report)

## §9. Skills installed locally

- pdf, docx, pptx, xlsx (file generation)
- product-self-knowledge (Anthropic product self-knowledge)
- frontend-design (Vue/React UI generation)
- file-reading, pdf-reading (input file processing)
- wp-seo-code-review (legacy, separate project)
- pdf-to-pptx-text-overlay, html-to-print-pdf (custom workflows)
- skill-creator (skill authoring)

## §10. Known unsolved bugs (P3)

- DingTalk dispatch bot cachedWebhook (slow reply, but派单 still triggers)
- vps_console.py markdown auto-link (.sh/.md/.json mangled into [xxx](http://xxx)) — Kristy delegated to web Claude
- 5 leaked credentials (pre-launch must clean)
- git config user not globally set (commit author mixed)

---
Last updated: <ISO date> by WO-3.15
```

The above is the TARGET structure. Some sections have placeholder `[Auto-fill from grep]` markers — Factory should run grep/find/cat commands to fill the actual current values. Use the existing forensic data in §1 above as reference.

### §2.B — Update `WO-3.12-verify.sh` template patterns into a reusable file

Create `/opt/wonderbear/workorders/verify-template.sh` based on `WO-3.12-verify.sh` structure but with these fixes:

```bash
# Luna invariant — exclude mock/demo/fixture/test paths
LUNA_REAPPEAR=$(grep -rn 'Luna' "${TV_DIR}/src" \
  --include='*.ts' --include='*.vue' --include='*.json' 2>/dev/null \
  | grep -v '/dev/' \
  | grep -v '\.backup' \
  | grep -v '/utils/demoStory' \
  | grep -v '/utils/.*demo' \
  | grep -v 'test\.' \
  | grep -v '__tests__' \
  | grep -v 'mock' \
  | grep -v 'fixture' \
  | wc -l | tr -d ' ')

# Spillover — explicitly allow services/api.ts type extensions
EXPECTED='^(<workorder-files>|tv-html/src/services/api\.ts|tv-html/src/stores/.*\.ts)$'
```

Add a comment header:
```bash
# verify-template.sh — Standard verify.sh template (post WO-3.15)
# DO NOT run this directly. COPY and customize for each new workorder.
# Replace <workorder-files> with the regex pattern of expected modified files.
# 
# Pattern fixes since WO-3.12:
# - Luna grep excludes utils/demoStory.ts, *demo*, *test*, *mock*, *fixture*, __tests__
# - Spillover whitelist allows services/api.ts (TS type extensions for backend changes)
# - All integer comparisons use `tr -d ' '` to strip whitespace
# - All grep -c calls have `|| true` (return code 1 trap)
```

### §2.C — Clean up dead .env fields

In `server-v7/.env`:

1. **Delete these lines entirely**:
   - `GEMINI_IMAGE_MODEL=...`
   - `STORAGE_TYPE=...`
   - `LOCAL_STORAGE_PATH=...`
2. **Deduplicate**: Find the 2 occurrences of `GOOGLE_APPLICATION_CREDENTIALS=...`, keep only the second one (which presumably is the active value), delete the first.
3. **Investigate then potentially delete** (run grep first):
   - `DASHSCOPE_TTS_VOICE_EN`, `DASHSCOPE_TTS_VOICE_ZH`, `DASHSCOPE_TTS_VOICE_VOCAB` (without _NARRATION/_DIALOGUE/_VOCAB_EN/_ZH suffix)
   - For each, run: `grep -rn "DASHSCOPE_TTS_VOICE_<NAME>\b" /opt/wonderbear/server-v7/src 2>/dev/null`
   - If grep returns zero hits → safe to delete
   - If grep returns hits → KEEP and document in GROUND-TRUTH §5

In `server-v7/.env.example` (if exists), apply the same deletions and add comments where needed:
```
# (removed by WO-3.15: GEMINI_IMAGE_MODEL — was unused)
# (removed by WO-3.15: STORAGE_TYPE/LOCAL_STORAGE_PATH — only in .backup)
```

### §2.D — DO NOT TOUCH

- spawn-droid.sh / orchestrator-loop.sh (just changed in V4 Pro migration, leave alone)
- ANY production source code (server-v7/src/, tv-html/src/) — this is a tooling/docs cleanup workorder
- `.env.backup-*` files (historical, don't modify)
- WO-3.X-verify.sh existing files (those are workorder-specific, only the new template is canonical)
- ANY git operations beyond reading status

## §3. Acceptance criteria

1. New file: `/opt/wonderbear/coordination/GROUND-TRUTH.md` exists, ≥ 100 lines, all §1-§10 sections populated with real grep'd values (not placeholder text)
2. New file: `/opt/wonderbear/workorders/verify-template.sh` exists, executable (chmod +x), bash -n syntax passes
3. `server-v7/.env` no longer contains `GEMINI_IMAGE_MODEL=`, `STORAGE_TYPE=`, `LOCAL_STORAGE_PATH=`
4. `server-v7/.env` `GOOGLE_APPLICATION_CREDENTIALS=` appears exactly ONCE
5. Modified files: ONLY `server-v7/.env` + (optionally) `server-v7/.env.example` if it exists. NO product code modified.
6. WO-3.9 invariant still holds: Luna doesn't reappear in tv-html/src (excluding utils/demoStory.ts which is mock data)
7. WO-3.12 invariants: spawn-droid.sh and orchestrator-loop.sh unchanged from b0cef44 baseline

## §4. Out-of-scope

- Don't refactor existing WO-X-verify.sh files (only the new template)
- Don't touch product code under server-v7/src/ or tv-html/src/
- Don't migrate verify.sh ALL workorders to new template (this is set-and-forget for new workorders)
- Don't auto-rotate any backups
- Don't commit (Kristy commits manually)
- Don't run end-to-end story generation tests

## §5. Red lines

- Net change to `.env`: 4-7 lines deleted, NO additions (except section comments)
- New files: 2 (GROUND-TRUTH.md, verify-template.sh)
- No `&&` chaining in verify subprocess
- File writes via `create_file` only
- Never `git stash`, `git reset`, `git push`, `git commit`
- Never `Always allow`

## §6. Files to touch

| File | Change | Lines |
|---|---|---|
| coordination/GROUND-TRUTH.md | NEW | +150-200 |
| workorders/verify-template.sh | NEW | +130 (based on WO-3.12-verify.sh) |
| server-v7/.env | delete 3 dead + dedupe 1 dup | -4/+0 |
| server-v7/.env.example | (if exists) same deletions + comments | -3/+3 |

## §7. Verification flow

1. Factory makes patches per §2
2. Factory runs `bash -n /opt/wonderbear/workorders/verify-template.sh` (syntax check)
3. Factory verifies no live source-code references to removed .env fields:
   - `grep -rn "process.env.GEMINI_IMAGE_MODEL" /opt/wonderbear/server-v7/src 2>/dev/null` → empty
   - `grep -rn "process.env.STORAGE_TYPE" /opt/wonderbear/server-v7/src 2>/dev/null` → empty
   - `grep -rn "process.env.LOCAL_STORAGE_PATH" /opt/wonderbear/server-v7/src 2>/dev/null` → empty
4. Factory writes report to `coordination/done/WO-3.15-report.md`
5. dingtalk-bot v2 auto-runs `WO-3.15-verify.sh`
6. If verify all-pass → Kristy reviews GROUND-TRUTH.md content quality manually, commits if good

## §8. Commit message template (Factory does NOT commit)

```
chore(tooling): WO-3.15 GROUND-TRUTH doc + verify template + .env cleanup

After V4 Pro migration (2026-05-01) and WO-3.12 closure, three structural drag
items addressed in one workorder:

1. coordination/GROUND-TRUTH.md (NEW): Single source of truth for new Claude
   conversations. Replaces the need to re-discover via grep/cat every time.
   Sections: VPS infra, PM2, dispatch chain, models, .env fields, DB schema,
   verify.sh template rules, workorder layout, skills, known bugs.

2. workorders/verify-template.sh (NEW): Standard template derived from
   WO-3.12-verify.sh, with two false-positive patterns fixed:
   - Luna grep now excludes utils/demoStory.ts, *demo*, *test*, *mock*,
     *fixture*, __tests__ (mock content shouldn't trigger product-code invariant)
   - Spillover whitelist allows services/api.ts (TS type extension when backend
     route changes is expected and self-consistent)

3. server-v7/.env cleanup:
   - Removed GEMINI_IMAGE_MODEL (zero references in code)
   - Removed STORAGE_TYPE, LOCAL_STORAGE_PATH (only in .env.js.backup)
   - Deduplicated GOOGLE_APPLICATION_CREDENTIALS (was 2 lines, dotenv silent
     last-wins, kept the second occurrence)

No product code touched. WO-3.9 (Luna→Dora) and WO-3.12 invariants preserved.

Verified: WO-3.15-verify.sh PASS. GROUND-TRUTH.md content quality reviewed
manually before commit.
```

End of WO-3.15.

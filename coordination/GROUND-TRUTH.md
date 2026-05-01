# WonderBear Ground Truth (Auto-maintained)

> **For new Claude conversations**: cat this file FIRST to load all baseline facts.
> **Last verified**: 2026-05-01 via WO-3.15
> **Next refresh**: When .env, PM2, dispatch chain, or schema changes

## §1. Server / Infrastructure

- VPS: 154.217.234.241 (US San Jose, AS402169 Uscloud, 4-core / 8GB, no swap)
- SSH alias: `wonderbear-vps` (passwordless, ed25519)
- Working dir: `/opt/wonderbear/`
- Backup snapshots: `/opt/wonderbear-backups/snapshot-YYYYMMDD-030001/` (daily 03:00, raw `pg_dump` + rsync)
- Tools: `/opt/wonderbear-tools/` (`spawn-droid.sh`, `orchestrator-loop.sh`, `notify.sh`, `backup-daily.sh`, `backup-verify.sh`)
- Skills: `/opt/wonderbear/coordination/`, `/opt/wonderbear/docs/orchestration/`
- Repo branches: default `main`; current release branch `release/showroom-20260429`
- Node: v20.20.2; git: 2.34.1; rg: NOT installed (use `grep -rn`); ffmpeg: NOT installed

## §2. PM2 Processes

| Process | Purpose | Cwd |
|---|---|---|
| wonderbear-server | server-v7 backend (Fastify + Prisma) | `/opt/wonderbear/server-v7` |
| wonderbear-dingtalk | DingTalk bot (Node.js) — receives `派 WO-X` and triggers spawn | `/opt/wonderbear/dingtalk-bot` |

`pm2 jlist` is the canonical liveness check. `orchestrator-loop.sh` systemd unit is **disabled and never enabled** in production — do not reference it as live infrastructure.

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

`orchestrator-loop.sh` systemd service: **disabled state, never enabled**. Don't reference it as live infrastructure.

## §4. Models in Use

### Coding agent (V4 Pro since 2026-05-01)
- Configured in `~/.factory/settings.json` `customModels` (camelCase)
- baseUrl: `https://api.deepseek.com/anthropic`
- model: `deepseek-v4-pro` (also has `deepseek-v4-flash` as alternate)
- provider: `anthropic`
- Pricing: $1.74 / $3.48 per 1M tokens (input / output)
- vs Opus 4.7 ($15 / $75): output 22× cheaper

### Story generation (server-v7 production)
- Cover: Nano Banana Pro (`gemini-3-pro-image-preview`), $0.134 / img, 2K, 16:9
- Pages 2-12: FAL Flux Pro Kontext img2img chain, $0.04 × 11
- Interior fallback: `gemini-2.5-flash-image`, $0.039 / img
- Narration TTS: DashScope CosyVoice v2 + `longxiaoxia_v2` (NOT ElevenLabs — that's fallback)
- Dialogue TTS: DashScope CosyVoice v3-flash + `longhuhu_v3`
- Vocab TTS: DashScope CosyVoice v2 + `longxiaoxia_v2`
- Story LLM: Gemini 2.5 Flash (`thinkingBudget: 0` for dialogue, `1024` for outline)
- Vocab LLM: gpt-4o-mini
- ASR primary: OpenAI Whisper; fallback chain: `google,dashscope`

## §5. .env Fields (server-v7/.env)

### §5.1 Active fields by category

- **infra**: `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`
- **mail**: `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME`
- **ai keys**: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `FAL_KEY`
- **TTS DashScope**: `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `DASHSCOPE_ASR_MODEL`, `DASHSCOPE_TTS_MODEL`, `DASHSCOPE_TTS_MODEL_NARRATION`, `DASHSCOPE_TTS_MODEL_DIALOGUE`, `DASHSCOPE_TTS_MODEL_VOCAB`, `DASHSCOPE_TTS_VOICE_NARRATION_ZH`, `DASHSCOPE_TTS_VOICE_NARRATION_EN`, `DASHSCOPE_TTS_VOICE_DIALOGUE_ZH`, `DASHSCOPE_TTS_VOICE_DIALOGUE_EN`, `DASHSCOPE_TTS_VOICE_VOCAB_ZH`, `DASHSCOPE_TTS_VOICE_VOCAB_EN`
- **TTS legacy (still referenced in src/)**: `DASHSCOPE_TTS_VOICE_ZH`, `DASHSCOPE_TTS_VOICE_EN`, `DASHSCOPE_TTS_VOICE_VOCAB` — kept because `src/services/tts.js` and `src/config/env.js` read them as fallbacks
- **TTS routing**: `TTS_PRIMARY`, `TTS_FALLBACK_CHAIN`, `TTS_TIMEOUT_MS`
- **TTS fallback (ElevenLabs)**: `ELEVENLABS_API_KEY`, `VOICE_ID_EN`, `VOICE_ID_ES`, `VOICE_ID_FR`, `VOICE_ID_PL`, `VOICE_ID_RO`, `VOICE_ID_ZH`
- **ASR routing**: `ASR_PRIMARY`, `ASR_FALLBACK_CHAIN`, `ASR_LANGUAGE_DEFAULT`, `ASR_TIMEOUT_MS`, `ASR_DUMP_ENABLED`
- **Image**: `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `NANO_BANANA_COVER_MODEL`, `NANO_BANANA_INTERIOR_MODEL`, `NANO_BANANA_RESOLUTION`, `IMAGE_PAGE1_COMPOSITION`, `IMAGE_STYLE_SUFFIX`
- **DB**: `DATABASE_URL`, `REDIS_URL`
- **Auth/STT**: `JWT_SECRET`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_SPEECH_KEY`, `GOOGLE_SPEECH_PROJECT_ID`
- **Storage R2**: `R2_ACCESS_KEY_ID`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_PUBLIC_URL`, `R2_SECRET_ACCESS_KEY`
- **Storage OSS**: `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, `OSS_BUCKET`, `OSS_ENDPOINT_ACCELERATE`, `OSS_ENDPOINT_STANDARD`, `OSS_REGION`
- **Mail**: `MAIL_FROM`, `MAIL_FROM_NAME`, `RESEND_API_KEY`
- **Payment**: `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_YEARLY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE`, `PAYPAL_PLAN_ID_MONTHLY`, `PAYPAL_PLAN_ID_YEARLY`, `PAYPAL_WEBHOOK_ID`
- **Misc**: `NODE_ENV`, `PORT`, `PROMPT_VERSION`, `DEBUG_GALLERY_PASSWORD`, `WB_DEMO_BIND_ENABLED`

### §5.2 Removed fields (WO-3.15)

- `GEMINI_IMAGE_MODEL` — was already absent from `.env`; zero references in `src/`. Confirmed dead.
- `STORAGE_TYPE` — only present in `.env.example` (live `.env` already clean) and `src/config/env.js.backup-2026-04-30-wo2-pre`. Removed from `.env.example`.
- `LOCAL_STORAGE_PATH` — same as `STORAGE_TYPE`. Removed from `.env.example`.

### §5.3 Deduplicated fields

- `GOOGLE_APPLICATION_CREDENTIALS` appeared TWICE in raw `.env` (line 54 with empty value, line 123 with the actual service-account path). dotenv silently uses the second value (last-wins). The empty first line was deleted; only the populated second occurrence remains.

## §6. PostgreSQL DB

- Container: `wonderbear_postgres` (Docker)
- DB name: `wonderbear_db` (NOT `wonderbear`)
- User: `wonderbear`
- Connection check: `psql -U wonderbear -d wonderbear_db`
- List DBs: `psql -U wonderbear -d postgres -c '\l'`
- Story table failure fields: `failureCode` (int), `failureMessage` (text). NO `error` column.
- ImageGenLog table: links to Story via `storyId`, queryable for per-page generation status.
- Backup script (`backup-daily.sh`) uses raw `pg_dump`, NOT Prisma model layer (per 教训 11).

## §7. verify.sh template (post-WO-3.15)

Standard verify.sh now lives at `/opt/wonderbear/workorders/verify-template.sh`. New workorder verify.sh files derive from it. Key rules embedded:

1. Luna grep MUST exclude: `/dev/`, `.backup`, `utils/demoStory.ts`, `utils/*demo*`, `*test*`, `*mock*`, `*fixture*`, `__tests__`
2. Spillover whitelist MUST allow: `services/api.ts` (frontend type extensions for backend changes), `stores/*.ts` (state types)
3. Use `grep -c ... 2>/dev/null || true` (avoid `-c` return-code-1 trap on no-match)
4. Always normalize newline (`tr -d ' '`) on integer comparisons (`-eq`, `-ge`)
5. Build verification MUST `cd` into target dir before `npm run build` (don't rely on inherited cwd)
6. No `&&` chaining inside verify subprocess (per 教训 12)

## §8. Workorder file locations

- `/opt/wonderbear/workorders/WO-X.md` (production workorder spec)
- `/opt/wonderbear/workorders/WO-X-verify.sh` (auto-run by dingtalk-bot v2)
- `/opt/wonderbear/workorders/WO-X-collect.sh` (manual 取证)
- `/opt/wonderbear/coordination/workorders/WO-X/README.md` (mirror for VPS Claude reads)
- `/opt/wonderbear/coordination/done/WO-X-report.md` (V4 Pro completion report)
- `/opt/wonderbear/workorders/verify-template.sh` (new canonical template, post-WO-3.15)

## §9. Skills installed locally

- `pdf`, `docx`, `pptx`, `xlsx` (file generation)
- `product-self-knowledge` (Anthropic product self-knowledge)
- `frontend-design` (Vue / React UI generation)
- `file-reading`, `pdf-reading` (input file processing)
- `wp-seo-code-review` (legacy, separate project)
- `pdf-to-pptx-text-overlay`, `html-to-print-pdf` (custom workflows)
- `skill-creator` (skill authoring)

## §10. Known unsolved bugs (P3)

- DingTalk dispatch bot `cachedWebhook` (slow reply, but派单 still triggers)
- `vps_console.py` markdown auto-link (`.sh`/`.md`/`.json` mangled into `[xxx](http://xxx)`) — Kristy delegated to web Claude
- 5 leaked credentials (pre-launch must clean)
- git `config user.{name,email}` not globally set (commit author mixed)
- VPS no swap → any concurrent sharp / image processing must be < 3 in parallel (TODO-19)

---
Last updated: 2026-05-01 by WO-3.15

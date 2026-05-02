# WonderBear Ground Truth (Auto-maintained)

> **For new Claude conversations**: cat this file FIRST to load all baseline facts.
> **Last verified**: WO-3.17 (2026-05-01 晚期 — 治理工单 + verify v3)
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

## §7. verify.sh 治理 v3(WO-3.17 起)

**所有新工单 verify 必须 source lib:**

```bash
#!/usr/bin/env bash
source /opt/wonderbear/workorders/verify-lib.sh

# 内容...
verify_summary
```

**lib 提供的检查函数:**

| 函数 | 收编规则 | 说明 |
|---|---|---|
| `check_no_backup_files` | 1 | 强制无 *.backup-* / *.bak |
| `check_no_spillover <expected> [<prev-wo>]` | 2 + 6 | git status spillover 带白名单 |
| `check_no_luna_regression` | 3 | Luna 不重现 production |
| `check_selector_exists` | 7 | CSS 选择器全栈扫(.vue + .css + .scss + .ts) |
| `check_pattern_in_file` | 4 + 5 底层 | 自动排注释 + 多行安全 |
| `check_pattern_absent_in_file` | 4 + 5 底层 | 反向断言(品牌词清理类) |
| `check_files_exist` | - | 文件存在性 |
| `check_npm_build` | - | 构建测试 |
| `check_node_require` | - | Node require 烟测 |
| `verify_summary` | - | 终结(必须最后调用) |

**禁止的写法(违反会被 WO-3.17-verify 之后的治理检查抓出):**
- ❌ 在 verify.sh 里裸写 `grep -rn ... | wc -l`(用 lib 函数代替)
- ❌ 在 verify.sh 里裸写 `git status -s | grep ...`(用 check_no_spillover)
- ❌ 在 verify.sh 不调用 `check_no_backup_files`(每工单必跑)
- ❌ 在 verify.sh 不调用 `verify_summary` 终结(exit code 不正确)

**Legacy 规则(WO-3.15 时代,现已被 lib 函数收编):**
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

## §11. WO-3.16 闭环记录

**Commit:** `3b7e6b5` (2026-05-01)

**交付内容:**
- 录音键(空格 / 麦克风按钮)按下时打断 TTS 播放,200ms 去抖
- 全局 SVG 返回按钮组件 `GlobalBackButton.vue`,5 个 screen 接入
- 多输入设备人体工学:键盘 + 触摸 + 鼠标统一行为

**WO-3.16.1 补丁:** DialogueScreen 在 WO-3.16 后期发现回归,补丁修复。

**学到的假 FAIL 模式:**
- 规则 4: grep 命中代码注释行(WO-3.16)
- 规则 5: 数组多元素同行计数失真(WO-3.16)
- 规则 6: 后续补丁 verify 未排除前置工单已改文件(WO-3.16.1)
- 规则 7: CSS 选择器在 styles/global.css 而非 .vue(WO-3.16.1)

---

## §12. WO-3.17 闭环记录(治理工单)

**Commit:** (本工单 commit hash 由 Kristy commit 后填入)

**Part A: verify 治理(治本)**
- 引入 `workorders/verify-lib.sh` 函数库,7 类假 FAIL 全部规则函数化
- `verify-template.sh` v3 改为最小骨架,强制第一行 `source verify-lib.sh`
- WO-3.18 起所有工单 verify **必须** source lib,WO-3.17-verify 检查这一点

**Part B: coordination/ 入库治理**
- 入库 `done/*-report.md` 工单完成报告
- 顶层任务草稿(2026-04-29 / 2026-04-30 ASR/TTS / TV W5)入库
- 6 个 v2lite 实验草稿迁移到 `coordination/archive/2026-04-30-v2lite/` 后入库
- 写入 `coordination/.gitignore`:`*.processed` / `markers/` / `auto-coordinator-logs/` / `droid-runs/` / `goals/`

**Part C: 自动化协调器(MVP — 静默 + 验收附嫌疑列表)**
- `coordination/auto-coordinator.sh` 主协调器(post-droid / product-confirmed / status)
- `coordination/false-fail-judge.sh` 判定器(7 条规则 + LLM 兜底,**默认放行**)
- `coordination/dingtalk-router.sh` 钉钉路由器(send-info / send-acceptance / send-decision)
- `dingtalk-bot/src/index.js` `triggerAutoVerify()` 改造:转交 auto-coordinator
- `dingtalk-bot/src/done-watcher.js` 集成 hook 注释(verify 完成后调 auto-coordinator)
- `dingtalk-bot/src/command-router.js` 加分支:`验收 WO-X` / `打回 WO-X` / `工单状态`
- 钉钉消息策略:**只在产品验收时 @ Kristy**,真 FAIL 静默写 marker 等下次复盘

**Part D: backup 文件历史清理**
- 删除 12 个 `*.backup-*` 残留(i18n locales x4, screens x6, services/api.ts x1, stores x1)
- 同步 `tv-html/.gitignore` / `server-v7/.gitignore` / `h5/.gitignore` 加 `*.backup-*` 防新增
- 治本:每工单 verify 跑 `check_no_backup_files`(verify-lib.sh)

**Part E: 本文件 GROUND-TRUTH.md 更新**
- 新增 §11 WO-3.16 闭环 / §12 WO-3.17 闭环
- §7 verify.sh template 章节升级文档为 v3
- "Last verified" → WO-3.17 / 2026-05-01

---
Last updated: 2026-05-01 by WO-3.17

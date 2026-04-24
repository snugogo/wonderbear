# HANDOFF · Image Pipeline v2 · 2026-04-24

> 给下一会话的 Claude / Factory。上一轮是"图片 Pipeline 修复 + 6 本 seed"工单,已 100% 交付。
> 本文件只写交接事实,不重复工单内容。工单原件:`FACTORY_WORKORDER_2026_04_24_IMAGE_PIPELINE.md`(附加于会话)

---

## 1. 项目当前状态

- **分支**:`main`
- **HEAD commit**:`d883f78 chore: organize image pipeline tools and reports`(已与 `origin/main` 完全同步)
- **Remote**:`git@github.com:snugogo/wonderbear.git`(SSH,用 `~/.ssh/wonderbear_deploy`,Deploy Key 已在 GitHub 上配好允许 write access;后续直接 `git push origin main` 即可)
- **Server 进程**:`node src/server.js` pid=452237,`:3000` 健康,所有 service=ok
- **.env 关键配置**:
  - `OPENAI_API_KEY` 存在
  - `GEMINI_API_KEY` 存在(尾号 `...UO8Q`,绑 WONDERBEAR 项目,Tier 2 付费,月限额 $100)
  - `FAL_KEY` 存在
  - **未设置** `OPENAI_IMAGE_MODEL`(当前代码 fallback 默认 `gpt-image-1`)
  - **未设置** `NANO_BANANA_MODEL`(当前代码 fallback 默认 `gemini-2.5-flash-image`,实测正确)

---

## 2. 已完成(最近 24h)

| # | commit | 说明 |
|---|---|---|
| 1 | 6961eae | sanitizePromptForPage1 + 10/10 单测 |
| 2 | a4d6957 | OpenAI 三次 LLM-rewrite 重试链 + Nano Banana 兜底架子 |
| 3 | 53606f3 | Nano Banana 模型名修为 `gemini-2.5-flash-image`(-preview 后缀是错的) |
| 4 | 2a6544d | FAL Flux text2image 作为 Page 1 兜底 B(export alias) |
| 5 | 3021aff | storyJob:封面 placeholder 时 Page 2-12 强制 text2image |
| 6 | 27e845f | 6 本 seed 故事生成 + 报告 |
| 7 | d883f78 | AUDIT + SEED_REPORT 移到 tools/reports/ |

**Seed 结果**:6/6 status=completed,12/12 页全成。OpenAI 命中 5/6(Try1=4,Try2=1),FAL 兜底 1/6(005 first-day-school)。主控台已审,**不重跑,保留现状**作为生产可靠性证明。

**其他**:
- SSH deploy key 配置 + git push 通道打通
- Gemini 429 根因定位:Tier 2 月限额 $10 被触达("prepayment credits depleted" 文案误导),主控台调到 $100 后恢复。Key 本身健康,无需替换
- `gpt-image-1.5` 实测证据齐全(见 §4)

---

## 3. 未解决 / 待处理

- `tools/reports/covers/` 里 6 张 PNG/JPEG **未 commit**(单文件 2.5MB 左右,13MB 总量),等主控台决定是否入库
- **Luna 名字覆盖 bug**:003-006 故事 title 全是 "Luna's XXX",scenario 里的 Theo/Cinderella/Mia/Leo 被 LLM 用 `childProfile.name`(Luna)顶了。本次工单硬边界不动,属 **LLM 文本路径 bug**,未来单开任务修
- **005 first-day-school 封面**:FAL 兜底的 jpeg,风格和另外 5 本 OpenAI PNG 不一致。主控台要求保留,不重跑
- VPS 上 server-v7 根目录遗留:`probe.mjs`、`src/app.js.bak-*`、`src/routes/device.js.bak*`、`.env.backup-20260423-084239` — 等 VPS 清理工单统一处理,本工单不碰
- 本地 E:\AI\factory-workspace\ 有一堆 `_tmp_*.mjs/.sh/.js` 调试残骸(scp 中转用的),不影响 VPS,可随手清
- `git push origin main` 第一次做过了;会话内 `setsid nohup node src/server.js` 拉起来的 server 会在 VPS 重启后丢,生产化需要 systemd unit(不在本工单)

---

## 4. 下一份工单概要

文件名:`FACTORY_WORKORDER_2026_04_24_IMAGE_UPGRADE.md`(主控台另行下发)

主题:从 `gpt-image-1` 升级到 `gpt-image-1.5`。

**前置证据**(已实测,今天最后一步):

| model 字符串 | HTTP | 结论 |
|---|---|---|
| `gpt-image-1.5` | **200**,返回合法 b64_json | **可用** |
| `gpt-image-1-5` | 400 `"model does not exist" code=invalid_value` | 拼写错 |
| `gpt-image-15` | 400 同上 | 拼写错 |
| `gpt-image-1` | 200 | 当前生产在用 |

切换成本极低:代码里已有 `const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';`(`src/services/imageGen.js` L37),只需 `.env` 加一条 `OPENAI_IMAGE_MODEL=gpt-image-1.5` + 重启 server。

主控台规划的 4 Phase(Phase 间必须停等 ACK):
1. **image-2 可用性** — `.env` 切 1.5,跑 probe_page1.js 三个探针 + benign/safety-tripping prompt,确认 200 率 + 出图质量
2. **三方对比** — 同一批 prompt 用 `gpt-image-1` / `gpt-image-1.5` / Nano Banana 各出一张,人工盲评画质
3. **Gemini 压测** — 调高月限额后,跑 N 次 rewrite 验证无 429;测 Nano Banana 连续出图稳定性
4. **6 本 seed 重跑** — 全新 6 本对比当前 seed_* storyId,看 1.5 是否有 OpenAI 命中率提升 / 风格更连贯

---

## 5. 关键路径速查

| 用途 | 路径 |
|---|---|
| VPS 代码根 | `/opt/wonderbear/server-v7/` |
| 本工单所有产物 | `tools/` 和 `tools/reports/` |
| 审计报告 | `tools/reports/IMAGE_PIPELINE_AUDIT.md` |
| Seed 生成报告 | `tools/reports/SEED_GENERATION_REPORT.md` |
| 6 张封面 PNG/JPEG | `tools/reports/covers/` (VPS);本地 `E:\AI\factory-workspace\covers\` |
| 单测脚本 | `tools/test_sanitize.js` (10/10 pass) |
| Page 1 探针 CLI | `tools/probe_page1.js` — 用法:`node tools/probe_page1.js --prompt "..." [--character "..."]` |
| 6 本 seed 批跑器 | `tools/run_seeds.mjs` — 环境变量 `SEED_FILE=/tmp/seed_dialogues.json` `SKIP_SCENARIOS=id1,id2` |
| 图片核心代码 | `src/services/imageGen.js` |
| Page 1 sanitizer | `src/utils/storyPrompt.js` (末尾 `sanitizePromptForPage1` + PAGE1_REPLACEMENT_ORDER) |
| storyJob | `src/queues/storyJob.js`(Page 1 placeholder → forceText2Image 分支 L140 附近) |
| 本地 SSH 配置 | `~/.ssh/config` 里 host = `wonderbear-vps`(PowerShell 直接 `ssh wonderbear-vps`) |

**Server 重启命令**(生产就用这个,下次有人写 systemd 再规范化):
```bash
kill <pid>
cd /opt/wonderbear/server-v7 && setsid nohup node src/server.js > /var/log/wonderbear-server.log 2>&1 < /dev/null & disown
sleep 4 && curl -s http://localhost:3000/api/health | head -c 200
```

---

## 6. 给接手的 Claude 的建议

**三个坑 / 三条主控台风格**:

1. **PowerShell → SSH → bash 三层转义是灾难**。任何含 `"`/`'`/`$`/`&`/多行 JSON 的命令,都要写本地 `.sh` 或 `.mjs` → `scp` 到 VPS → `ssh wonderbear-vps "bash /tmp/xx.sh"`。**不要**尝试在 `Execute` 里直接写 `ssh wonderbear-vps "curl -d '{...}'"`,必炸。

2. **不要凭记忆下结论,实测 10 秒能证伪**。本轮我踩的两个典型:
   - Phase 0 我基于"记忆"说 "OpenAI 只见过 gpt-image-1"——错了,实测 `gpt-image-1.5` 200
   - Gemini 429 第一次我说"余额耗尽,充值吧",被主控台一句打回:"账单页 $0.04/$10,去证伪"。根因是月限额 cap,不是余额
   **主控台对"笼统结论"零容忍。任何判断都准备好 curl / db query / 完整响应体作为证据**。

3. **主控台要倾向,不要开放题**。不要问"A 还是 B?",要问"我倾向 A,理由是 X,确认还是改 B?"。本轮 Phase 0 我按这个格式给了 R1/R2/R3,秒过。如果写成"你觉得模型名用 1 还是 1.5?"会被批浪费 token。

**三条事实性"别猜"清单**:
- ✅ `GEMINI_API_KEY`(尾 UO8Q)绑对了项目,就是 WONDERBEAR Tier 2 付费。**别重新怀疑**
- ✅ FAL Kontext 接受 `data:image/png;base64,...` URL 作为 `image_url`,Page 2-12 一致性链路不需要对象存储 uploader。**别重新猜**
- ✅ Nano Banana 正确模型名是 `gemini-2.5-flash-image`(**无 -preview 后缀**)。Workorder 老版本写的 `-preview` 是错的

**一条硬边界**:本工单的"只修图片 pipeline"规矩依然有效,别手滑去改 LLM 文本路径(例如 Luna 覆盖 bug)或 TV UI。越界 = 施工事故。

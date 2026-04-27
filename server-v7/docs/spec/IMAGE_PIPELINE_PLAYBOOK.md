# Image Pipeline Playbook (post-2026-04-27)

> **What this doc is**: the固化的图像生成流程,经 Kai 标杆 + 4 次单变量对照实验验证。
> **Audience**: 下一棒 Droid / Claude / Codex。读完 5 分钟搞清生产配置 + 故障排除路径。
> **Source of truth ranking**: 本 playbook < `docs/spec/PROMPT_SPEC_v7_1.md` < 代码本身。

---

## 1 · 生产路由(已 commit,默认值)

```
LLM
  Gemini 2.0 flash → fallback OpenAI gpt-4o-mini

Cover (P1)
  T1: Nano Banana Pro 2K (gemini-3-pro-image-preview)  16:9 native, ~13¢
  T2: OpenAI gpt-image-1.5 medium 1536×1024            ~5¢
  T3: FAL flux/dev landscape_16_9                      ~3¢

Interior (P2-P12)
  T1: FAL flux-pro/kontext img2img,referenceImageUrl=COVER (永远 Cover,不漂移)
  T2: Nano Banana Flash (gemini-2.5-flash-image)       16:9 text2image,~4¢
  T3: OpenAI gpt-image-1.5                             ~5¢

TTS
  Primary 中文: CosyVoice  /  Primary 英文: ElevenLabs
  Resilient: 单语失败不挡其他页

R2 持久化:全部图 + 音频上传到 R2 bucket,DB 存 R2 公网 URL
```

---

## 2 · 关键决策(实证锁定,不要回滚)

| 决策 | 配置 | 原因 |
|---|---|---|
| **STYLE_SUFFIX** | 旧 Miyazaki-inspired(`storyPrompt.js` 16048 字版) | v1.3 Carson Ellis 4212 字"作家+笔触"强提示词导致风格混乱 |
| **内页 ref strategy** | cover-anchored(P_n → P_1) | 链式 ref(P_n → P_{n-1})累积漂移,Kai 标杆用 cover 跨 12 页一致 |
| **Phase A prompt overrides** | 删除(P1/P8 expressive eyes 替换);P12 Dora seed 留作 ENV-gated 测试入口 | 单变量实验证明对画面不利或不必要 |
| **Cover 分辨率** | Pro 2K 2752×1536(1.792 ratio) | 16:9 native,无 sharp post-crop |
| **内页分辨率** | FAL Kontext 1392×752(1.851)| FAL 平台预设,与 Kristy 确认"视觉无差别" |

---

## 3 · ENV 开关(逃生通道)

| ENV | Default | 启用作用 |
|---|---|---|
| `USE_CHAINED_REF` | `0` | 内页 ref 改为链式(P_n → P_{n-1});出问题逃回链式 |
| `DORA_TEST_P12_OVERRIDE` | `0` | P12 替换为固定 Dora seed prompt(测试用,不生产) |
| `USE_MOCK_AI` | `0` | LLM/imageGen/TTS 全 mock,0 成本验结构层 |
| `NANO_BANANA_COVER_MODEL` | `gemini-3-pro-image-preview` | Cover Pro 模型名 |
| `NANO_BANANA_INTERIOR_MODEL` | `gemini-2.5-flash-image` | 内页 Flash 模型名 |
| `NANO_BANANA_RESOLUTION` | `2K` | Cover 分辨率,Flash 内页不读 |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1.5` | OpenAI 图像模型 |
| `OPENAI_IMAGE_QUALITY` | `medium` | OpenAI 图像质量 |
| `DEBUG_GALLERY_PASSWORD` | (set in .env) | `/debug/*` Basic Auth |

---

## 4 · 测试入口

```bash
# 1. Mock 验证(0 成本,5 秒,验结构层 13/13)
cd /opt/wonderbear/server-v7
node tools/run_dora_test_mock.mjs

# 2. 真实引擎跑 12 页 Dora(成本 ~$0.93,~5 分钟,Layer 1-4 全验)
node tools/run_dora_test_mock.mjs --real

# 3. 单变量对照(关 Phase A overrides,看 prompt 改动是否有害)
node tools/run_dora_test_mock.mjs --real --baseline

# 4. 测链式 ref(回切实验)
USE_CHAINED_REF=1 node tools/run_dora_test_mock.mjs --real --baseline

# Layer 1-4 含义:
#   Layer 1: DB Story.pages JSON 12 行齐全 + ttsUrl + ttsUrlLearning + R2 域名
#   Layer 2: R2 图(P1/P6/P12)curl HEAD 200 + size > 50KB
#   Layer 3: R2 音频(P1.zh/P6.en/P12.zh)curl HEAD 200 + size > 10KB
#   Layer 4: 16:9 native 像素 ratio 1.78 ± 0.05(P1 通过,内页 1.851 平台预设视觉无差别)
```

---

## 5 · 浏览器验收(/debug 路由)

```
Gallery 列表:    http://VPS_IP:3000/debug/gallery
单本详情:       http://VPS_IP:3000/debug/story/<storyId>

Basic Auth:     user 任意,password = .env DEBUG_GALLERY_PASSWORD

音频:           走 /debug/proxy-audio?url=<R2_URL> 同源代理(CSP default-src 'self'
                  阻断了直链 R2 跨源 audio,代理后 preload=metadata 立即显示 duration)
```

---

## 6 · 红线(任何一条触发立即停)

| 项 | 阈值 | 来源 |
|---|---|---|
| 单次 API 烧钱 | > $1 | Kristy 凌晨指令 |
| 单本累计 | > $3 | 同上 |
| 连续失败页 | ≥ 3 | 同上 |
| `/api/health` | 任一服务 fail | 立即从最近 backup 回滚 |
| PM2 status | 不是 online | 排查 logs `pm2 logs wonderbear-server --lines 50` |

---

## 7 · 故障排查路径(发生不理想时单变量隔离)

```
故障:整本视觉/一致性退化
    ↓
1. 跑 mock 验结构层(`node tools/run_dora_test_mock.mjs`)
    Layer 1 全过 = 数据流没坏 → 是真实引擎层问题
    Layer 1 有 fail = 数据库/queue/orchestrator 退化 → 看 src/queues/storyJob.js diff
    ↓
2. 跑 --real 对照新 vs Kai 标杆(`/debug/story/cmocuudx700012u0mgkjaycho`)
    一致性差 → 怀疑 ref strategy
    风格不对 → 怀疑 STYLE_SUFFIX
    缺角色特征 → 怀疑 characterDescription / dialogueSummary
    比例诡异 → 怀疑 imageConfig.aspectRatio 或 callFalKontext 参数
    ↓
3. 单变量隔离(每次只改一处,跑同 fixture):
    - 风格嫌疑 → cp storyPrompt.js.backup 临时回滚 → 跑 → 对照
    - ref 嫌疑 → set USE_CHAINED_REF=1 → 跑 → 对照
    - prompt 嫌疑 → 在 storyJob.js 加 kill switch → 跑 → 对照
    ↓
4. 找到凶手后 commit + 写 coordination/factory-to-claude/ 留痕
```

---

## 8 · backup 备份策略(pre-commit safety)

每次大改之前:
```bash
cp /opt/wonderbear/server-v7/src/<file>.js \
   /opt/wonderbear/server-v7/src/<file>.js.backup-$(date +%Y-%m-%d)-<reason>
```

backup 文件不进 git(已在 `.gitignore` 默认 `*.backup-*` ?未必,**如果不在则要加**)。
Backup 文件留 7 天后清理,或 commit 后立刻清:
```bash
rm /opt/wonderbear/server-v7/src/<file>.js.backup-*
```

当前留存的 backup(2026-04-27 session 末):
```
server-v7/src/queues/storyJob.js.backup-2026-04-27-task3-chained-ref
server-v7/src/services/imageGen.js.backup-2026-04-27-task2-dual-engine
server-v7/src/utils/storyPrompt.js.backup-2026-04-27-style-v13-sync
server-v7/src/utils/storyPrompt.js.before-task7-rollback
```

---

## 9 · 历史教训(2026-04-27 session)

| # | 错误尝试 | 教训 |
|---|---|---|
| 1 | STYLE v1.3 Carson Ellis 4212 字 | "作家 + 笔触"强提示词反而破坏风格,**减法优于加法** |
| 2 | 链式 ref P_n→P_{n-1} | 跨 12 页累积漂移,**cover-anchored 简单且鲁棒** |
| 3 | Phase A "big bright eyes"→"expressive eyes" | 单变量证明无价值,**先实证再加 prompt 改动** |
| 4 | gallery `<audio src=R2_URL>` | CSP `default-src 'self'` 默默阻断,**同源代理是稳定方案** |
| 5 | gallery `preload="none"` | 用户体验差(0:00/0:00),**preload="metadata" 立即显示 duration** |
| 6 | 给 IP 占位符 `VPS_IP` | 在 LLM 思维里替换占位符,**输出前必查实际值**(curl ifconfig.me) |

---

## 10 · 下一棒待办(任务 8+)

- [ ] FAL flux-pro/kontext 内页 ratio 1.851(平台预设)— 选 α/β/γ 修复(详 `coordination/factory-to-claude/2026-04-27-phase-b-real.md` §3)
- [ ] 清理本次 session 的 4 个 test storyId(SQL 在 task7 报告)
- [ ] 删除 `*.backup-*` 文件(commit 已落地)
- [ ] 删除 `*.bak`,`diag.mjs`,`probe.mjs` 等 untracked 临时文件
- [ ] tools/run_dora_test_mock.mjs 重命名为 run_pipeline_test.mjs(更通用)
- [ ] LLM/TTS 成本暂时不计入 Story.genCostCents,后续如要精细 dashboard 需补
- [ ] PRODUCT_CONSTITUTION.md §4.2 cost table 4-dim 数字与本次实测对账
- [ ] /debug/proxy-audio 加 R2-only host whitelist 限制(目前 startswith pub-)

—— Factory  (2026-04-27)

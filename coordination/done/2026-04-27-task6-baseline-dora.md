# 任务 6 — Dora 故事单变量对照实验(Phase A prompt 改动隔离)

**From**: Factory
**To**: Kristy
**Time**: 2026-04-26 18:55 UTC
**Goal**: 关 Phase A 的 P1/P8/P12 prompt 修改,其他全保留,跑同一 Dora fixture,对照 Phase A 改动版,验 prompt 修改是否凶手

---

## 1 · 改动 — storyJob.js 加总开关

文件:`/opt/wonderbear/server-v7/src/queues/storyJob.js`

```js
function applyImagePromptOverrides(page) {
  // Master kill-switch for diagnostic A/B comparison (2026-04-27 task 6).
  // When DISABLE_PHASE_A_PROMPT_OVERRIDES=1, return the LLM-emitted prompt
  // unchanged so we can isolate whether the P1/P8/P12 modifications are
  // the cause of regressions vs the dual-engine routing changes.
  if (
    process.env.DISABLE_PHASE_A_PROMPT_OVERRIDES === '1'
    || process.env.DISABLE_PHASE_A_PROMPT_OVERRIDES === 'true'
  ) {
    return page.imagePrompt;
  }

  // ...P1/P8 "big bright eyes" → "expressive eyes" 替换 + P12 Dora seed override (原逻辑保留)
}
```

`tools/run_dora_test_mock.mjs` 加 `--baseline` flag:
- 设 `DISABLE_PHASE_A_PROMPT_OVERRIDES=1`
- **不**设 `DORA_TEST_P12_OVERRIDE`
- 同 fixture(Dora 5 岁,云朵故事 + WonderBear 角色)

**已 git stage**(未 commit):
```
M  server-v7/src/queues/storyJob.js
```

---

## 2 · 跑批结果

### Baseline run(Phase A overrides DISABLED)

```
storyId   = cmog53dwe000128v6ovcff0fw
title     = 朵拉和伤心的小云朵       (LLM 自动起,Dora 主题对了)
pipeline  = 270,869 ms (4 min 31 sec)
total cost= $0.57 (image only)
```

**4 层验证**:

| 层 | 通过 | 备注 |
|---|---|---|
| Layer 1 DB | **13/13** ✓ | 12 页 imageUrl/ttsUrl/ttsUrlLearning 全 R2 域名 |
| Layer 2 R2 图 | **3/3** ✓ | P1 491 KB / P6 123 KB / P12 169 KB |
| Layer 3 R2 音频 | **3/3** ✓ | 三段 127-165 KB |
| Layer 4 16:9 | **1/3** ❌ | P1 1.792 ✓ / P6 P12 1.851 ✗(同样 FAL 平台限制) |

路由 nano_banana × 1 + fal-kontext × 11,全 tier 1,无 retry。

---

## 3 · 三本对比

| 维度 | Kai 基线 | Phase A Dora | Baseline Dora(本次) |
|---|---|---|---|
| storyId | `cmocuudx700012u0mgkjaycho` | `cmog3m4yl0001on7a9ggpgf2j` | `cmog53dwe000128v6ovcff0fw` |
| 标题 | (Kai 故事,看 Kristy) | 朵拉和伤心的云朵 | 朵拉和伤心的**小**云朵 |
| Phase A prompt 修改 | (历史版,前任务流程) | **启用**(P1/P8 expressive eyes + P12 Dora seed) | **禁用**(LLM 原始 prompt) |
| Dual-engine routing | — | 启用 | 启用 |
| Cover provider | — | nano_banana Pro 2K | nano_banana Pro 2K |
| Cover ratio | (查页面) | **1.792** ✓ | **1.792** ✓(完全相同) |
| 内页 provider | — | fal-kontext × 11 | fal-kontext × 11 |
| 内页 ratio | (查页面) | **1.851** ✗ | **1.851** ✗(完全相同) |
| 总图像成本 | (查页面) | **$0.57** | **$0.57**(完全相同) |
| Pipeline 耗时 | — | 280,842 ms | 270,869 ms(差 10s 网络抖动) |
| Layer 1/2/3 通过 | (查页面) | 13/3/3 全过 | **13/3/3 全过** |
| Layer 4 通过 | (查页面) | **1/3** | **1/3**(完全相同) |

---

## 4 · 浏览器三向对比 URL

```
1. Kai 基线:
   http://154.217.234.241:3000/debug/story/cmocuudx700012u0mgkjaycho

2. Phase A Dora(P1/P8 expressive eyes + P12 Dora seed override 启用):
   http://154.217.234.241:3000/debug/story/cmog3m4yl0001on7a9ggpgf2j

3. Baseline Dora(P1/P8/P12 修改全关,LLM 原始 prompt):
   http://154.217.234.241:3000/debug/story/cmog53dwe000128v6ovcff0fw
```

Basic Auth:`DEBUG_GALLERY_PASSWORD`(`.env`)
Audio 走 `/debug/proxy-audio?url=...` 同源代理(任务 5.5 修复 CSP `default-src 'self'` 缺 `media-src` 问题)

---

## 5 · 结论

### 5.1 结构层(数据/路由/成本)

**Phase A prompt 修改对结构层零影响**:
- 路由命中完全相同(Cover Pro × 1 + FAL Kontext × 11)
- 单张成本完全相同(13c + 11×4c = 57c)
- 总成本完全相同($0.57)
- Layer 1/2/3 数字完全相同(13 ✓ / 3 ✓ / 3 ✓)
- Layer 4 失败模式完全相同(P1 1.792 ✓ / P6 P12 1.851 ✗)

**→ Layer 4 P6/P12 ratio 1.851 不是 Phase A prompt 改动引入的;是 FAL 平台限制**。

### 5.2 视觉层(待 Kristy 浏览器对照)

数字层一致不代表视觉一致。Phase A prompt 改动的视觉影响要 Kristy 自己看:

**P1 视觉对比要点**(Phase A vs Baseline):
- ☐ Phase A: 角色眼睛是否更"expressive eyes"风格(柔和细腻)?
- ☐ Baseline: LLM 原始 prompt 是否输出 anime 风"big bright eyes"(夸张大眼)?

**P8 视觉对比要点**:
- ☐ 同上

**P12 视觉对比要点**(关键!):
- ☐ Phase A:是否清晰呈现 Dora 长棕色卷发 + 黄裙白上衣 + WonderBear + 双云彩虹收尾?
- ☐ Baseline:LLM 自由发挥的 P12 是否风格保持但**没**强 anchor 续集种子帧?

如果 Phase A 视觉**优于** Baseline → P1/P8/P12 改动有价值,保留
如果 Phase A 视觉**劣于** Baseline → 改动有害,回滚
如果**相当** → 改动可有可无,简化未来维护可考虑删

---

## 6 · 红线 / 健康

```
PM2: wonderbear-server online ↺7  uptime 8 min  mem 19-25 MB
health: 200, all services ok
error log: clean
本次烧钱: $0.57(图)+ ~$0.36(估算 TTS)≈ $0.93,远低 $1.50 单本预算
```

---

## 7 · 待 Kristy 早上拍板

1. **视觉验收 3 本对照**(用 §4 的 URL 浏览器看)
2. **Phase A prompt 改动取舍**(参 §5.2 结论)
3. **Layer 4 ratio 修复路线**(α/β/γ 在 phase-b-real.md §3)
4. **是否清理 test DB 数据**(总共 3 个 test storyId,SQL 在 phase-b-real.md §6)
5. **任务 1/2/3/6 commit + push**(目前 storyJob.js 已 staged,余 5 个 modified + coordination/ 待 commit)

---

## 8 · 留痕

```
/opt/wonderbear/coordination/factory-to-claude/
├── 2026-04-27-task1-style-v13-sync.md
├── 2026-04-27-task2-imageGen-done-pending-storyJob-task3.md
├── 2026-04-27-MORNING-WAKEUP.md
├── 2026-04-27-phase-b-results-mock.md
├── 2026-04-27-phase-b-real.md
└── 2026-04-27-task6-baseline-dora.md      (本文件)
```

—— Factory

# 任务 7 — 一致性回归调查 + 锁定 Kai 配置

**From**: Factory
**To**: Kristy
**Time**: 2026-04-26 19:55 UTC
**Status**: ✅ Kristy 验收通过(`cmog60h1m0001xss835absxpu` "好了")

---

## 1 · 调查路径(单变量逐个隔离)

| Run | storyId | STYLE | Phase A overrides | Ref strategy | Kristy 视觉 |
|---|---|---|---|---|---|
| Kai 标杆 | `cmocuudx700012u0mgkjaycho` | 旧 (Miyazaki) | 无 | cover-anchored | ✓ 正常 |
| #2 Phase A | `cmog3m4yl0001on7a9ggpgf2j` | v1.3 Carson Ellis | 启用 | 链式 | ✗ 不理想 |
| #3 baseline | `cmog53dwe000128v6ovcff0fw` | v1.3 Carson Ellis | disabled | 链式 | ✗ 不理想 |
| #4 STYLE 回滚 | `cmog5lgtb0001i3z7sx5jtjw8` | **回滚** | disabled | 链式 | "好多了但不够" |
| **#5 全锁定** | `cmog60h1m0001xss835absxpu` | **回滚** | disabled | **cover-anchored** | **✓ 好了** |

**两个凶手都找到**:
1. **STYLE v1.3 Carson Ellis**(WONDERBEAR_MODERN_GOUACHE 4212 字)— 强调作家画风导致风格混乱
2. **链式 ref**(P_n → P_{n-1})— 累积漂移破坏跨页一致性

---

## 2 · 最终代码状态(已 git stage,未 commit)

```
M  server-v7/src/queues/storyJob.js     ← cover-anchored 默认 + 简化 prompt overrides
M  server-v7/src/routes/debug.js         ← /debug/proxy-audio 同源代理 + preload=metadata
M  server-v7/src/services/imageGen.js    ← 双引擎(Cover Pro 2K / 内页 FAL Kontext) + mock 内页
```

`storyPrompt.js` 已回到原 committed 版本(旧 Miyazaki STYLE),无 diff 待 stage。

### 2.1 storyJob.js 关键改动

```js
// Cover-anchored 默认(Kai-baseline 行为):
const USE_CHAINED = (process.env.USE_CHAINED_REF === '1' || process.env.USE_CHAINED_REF === 'true');
const refForThisPage = USE_CHAINED ? prevRefUrl : coverRefUrl;
// 链式 ref 留 ENV flag 兜底,默认关

// 简化 applyImagePromptOverrides — 删 P1/P8 expressive eyes 替换,删 kill switch
function applyImagePromptOverrides(page) {
  if (page.pageNum === 12 && process.env.DORA_TEST_P12_OVERRIDE === '1') {
    return DORA_P12_SEED_PROMPT;  // test-only 留作 Dora 测试入口
  }
  return page.imagePrompt;  // 生产 pass-through
}
```

### 2.2 debug.js 关键改动

```js
// /debug/proxy-audio?url=<r2-url>:R2 mp3 同源代理,绕开 CSP default-src 'self'
fastify.get('/debug/proxy-audio', async (req, reply) => {
  // 验证 URL 是 R2 域名,fetch + 流式回传,Range 支持
});

// gallery <audio> 改用 proxyUrl(p.ttsUrl),preload="metadata" 立即显示 duration
```

### 2.3 imageGen.js 关键改动(任务 2 完成)

- Cover: Nano Banana Pro 2K (gemini-3-pro-image-preview) → OpenAI gpt-image-1.5 → FAL flux-dev
- Interior: FAL Kontext img2img → Nano Flash → OpenAI
- 16:9 native via `imageConfig.aspectRatio`,移除 sharp post-crop
- callNanoBanana(prompt, isCover) 单函数双用
- COST 表 4 维度,COST_NANO_BANANA_COVER=13c override
- generateSubsequentPage 加 `isMockMode()` 早返回(任务 5 补丁)

---

## 3 · 仍未解决(留给以后)

### Layer 4 P6/P12 ratio 1.851

FAL flux-pro/kontext API 接收 `aspect_ratio: '16:9'` 后内部 snap 到平台预设
**1392×752**(1.851),不是数学严格 16:9 (1.778)。Kristy 已表态"跟不理想无关"。

不阻塞 commit,留待以后(α 放宽 ±0.10 / β 删 aspect_ratio 让 FAL 匹配 ref / γ 加 sharp post-crop)。

---

## 4 · 烧钱总账(本次 session 全部)

| 项目 | 数量 | 成本 |
|---|---|---|
| Mock test (Layer 1 only) | 1 | $0.00 |
| Real Phase A | 1 | $0.93 |
| Real baseline (kill switch) | 1 | $0.93 |
| Real STYLE rollback | 1 | $0.93 |
| Real cover-anchored (验收通过) | 1 | $0.93 |
| **合计** | **5** | **$3.72** |

---

## 5 · DB 测试数据(早上你想清理时)

```sql
DELETE FROM "ImageGenLog" WHERE "storyId" IN (
  'cmog12kqk0001ap3dub8dop9j',   -- mock test
  'cmog3m4yl0001on7a9ggpgf2j',   -- Phase A
  'cmog53dwe000128v6ovcff0fw',   -- baseline kill switch
  'cmog5lgtb0001i3z7sx5jtjw8'    -- STYLE rollback
  -- cmog60h1m0001xss835absxpu  ← 验收通过那本,保留 demo 用
);
DELETE FROM "Story" WHERE "id" IN (
  'cmog12kqk0001ap3dub8dop9j',
  'cmog3m4yl0001on7a9ggpgf2j',
  'cmog53dwe000128v6ovcff0fw',
  'cmog5lgtb0001i3z7sx5jtjw8'
);
```

---

## 6 · Commit 建议(等你批准)

```bash
cd /opt/wonderbear

git add server-v7/src/queues/storyJob.js \
        server-v7/src/routes/debug.js \
        server-v7/src/services/imageGen.js

git commit -m "task 1/2/7: dual-engine routing + cover-anchored ref + audio proxy

- imageGen.js: Cover Nano Banana Pro 2K 16:9 native, Interior FAL Kontext img2img,
  drop sharp post-crop, OPENAI_MODEL default→gpt-image-1.5, mock branch for
  generateSubsequentPage. Cost table 4-dim verified.
- storyJob.js: Cover-anchored ref strategy as default (Kai baseline behavior).
  USE_CHAINED_REF=1 retained as escape hatch. Simplified applyImagePromptOverrides
  to P12 test-only Dora seed override (DORA_TEST_P12_OVERRIDE=1).
- debug.js: /debug/proxy-audio same-origin streaming proxy for R2 audio (CSP
  default-src 'self' had blocked direct cross-origin <audio> playback).
  preload=metadata so player shows duration immediately."
```

storyPrompt.js (STYLE) 已回到原 committed 版本,无变化。
package-lock.json 改动是 sharp 安装,可单独 commit:
```bash
git add server-v7/package-lock.json
git commit -m "deps: sharp for tools/run_dora_test_mock.mjs Layer 4 pixel check"
```

src/app.js 改动不是我改的(看到 backup `app.js.backup-2026-04-26-csp-fix`),那是早些时候你或别人改的,本次不动。

---

## 7 · 服务状态

```
PM2: wonderbear-server  online ↺10  uptime 1m  mem 124 MB
health: 200, all services ok
error log: clean
浏览器验收通过: http://154.217.234.241:3000/debug/story/cmog60h1m0001xss835absxpu
```

---

## 8 · 留痕(7 份)

```
/opt/wonderbear/coordination/factory-to-claude/
├── 2026-04-27-task1-style-v13-sync.md             (任务 1)
├── 2026-04-27-task2-imageGen-done-pending-storyJob-task3.md (任务 2)
├── 2026-04-27-MORNING-WAKEUP.md                   (深夜交棒)
├── 2026-04-27-phase-b-results-mock.md             (Phase B mock)
├── 2026-04-27-phase-b-real.md                     (Phase B real,Layer 4 finding)
├── 2026-04-27-task6-baseline-dora.md              (任务 6 单变量对照)
└── 2026-04-27-task7-final-config.md               (本文件,Kai 配置锁定)
```

—— Factory

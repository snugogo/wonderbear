# 任务 2 进度报告:imageGen.js 双引擎路由完成 — 等任务 3 + storyJob 范围确认

**From**: Factory
**To**: Claude / Kristy
**Time**: 2026-04-26 16:45 UTC
**Refs**: PRODUCT_CONSTITUTION §4.2, STYLE_PROMPT_REFERENCE §8.2, AGENTS.md §1.1 §2.1 §2.2,
         任务 2 续跑工单(A/B/C/D)

---

## 完成内容(imageGen.js v4 重构)

### A. callNanoBanana(prompt, isCover=false) 已签名升级

```js
async function callNanoBanana(prompt, isCover = false) {
  const model = isCover
    ? (process.env.NANO_BANANA_COVER_MODEL || 'gemini-3-pro-image-preview')
    : (process.env.NANO_BANANA_INTERIOR_MODEL || 'gemini-2.5-flash-image');
  const imageConfig = { aspectRatio: '16:9' };
  if (isCover) {
    imageConfig.imageSize = process.env.NANO_BANANA_RESOLUTION || '2K';
  }
  // ... fetch with generationConfig: { responseModalities: ['Image'], imageConfig }
}
```

### B. sharp 居中裁剪从生产路径移除

`callNanoBanana()` 内的 `cropAndResizeGeminiImage(rawBuf)` 调用已删,直接将
b64 包装为 `data:image/png;base64,...` 返回。

`cropAndResizeGeminiImage` 函数本身**保留 export**(tools/test_gemini_crop.js
仍 import),只是生产路径不再调用。

### C. Cover 链路 [Nano Banana Pro → OpenAI → FAL]

- T1: `callNanoBanana(prompt, isCover=true)` - Pro 2K 16:9 native
- T2: sanitizePromptForPage1 → `callOpenAI` (gpt-image-1.5 medium 1536x1024)
- T3: `callFalText` (FAL flux/dev landscape_16_9)
- 删除了 age-based 分流(`isYoungAge` / `coverYoungBranch` / `coverOldBranch`)
  和 Gemini rewrite 中间步骤(REWRITE_PROMPT_R1/R2 + geminiRewritePrompt
  保留为 dead code 便于将来回滚)

### D. 内页链路 [FAL Kontext → Nano Banana Flash → OpenAI]

- T1: `callFalKontext(prompt, referenceImageUrl)` - 16:9 img2img(链式 ref 待
  storyJob.js 改造,见下面"待确认范围")
- T2: `callNanoBanana(prompt, isCover=false)` - Flash 16:9 native
- T3: `callOpenAI` - gpt-image-1.5 medium 1536x1024
- 删除了原 T2 FAL text2image 的内页兜底(被 Nano Banana + OpenAI 替代)

### Cost 表 4 维度更新(已写入文件头部)

```
Cover (Nano Banana Pro):
  model=gemini-3-pro-image-preview, resolution=2K, aspect=16:9 native
  per-image=$0.134  → 13 cents

Interior Nano fallback (Nano Banana Flash):
  model=gemini-2.5-flash-image, aspect=16:9 native (default ~1K)
  per-image=$0.039  → 4 cents

OpenAI (Cover/Interior shared fallback):
  model=gpt-image-1.5, quality=medium, resolution=1536x1024 landscape
  per-image=$0.050  → 5 cents

FAL Kontext (Interior primary):
  model=fal-flux-kontext-pro, mode=img2img-chain, aspect=16:9
  per-image=$0.040  → 4 cents

FAL Flux text2image (Cover Tier 3 fallback):
  model=fal-flux/dev, image_size=landscape_16_9
  per-image=$0.025  → 3 cents
```

`COST` 表的 `nano_banana` key 默认 4 (Flash);Cover 调用站点用 `costCents`
覆盖参数传 13 给 `runExec()`。

### OPENAI_MODEL 默认值升级

```js
const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';
```

(.env 已经设到 `gpt-image-1.5`,这只是 fallback 默认安全网。)

---

## 验证结果

- `node --check src/services/imageGen.js` → 通过
- import 健全性 8/8 全过:
  ```
  ok  generateCoverImage is fn
  ok  generateSubsequentPage is fn
  ok  generatePageImage is fn
  ok  callFalFluxT2I is fn
  ok  cropAndResizeGeminiImage still exported
  ok  isMockMode is fn
  ok  isSafetyRejection is fn
  ok  isYoungAge removed
  ```
- PM2 restart --update-env → online,pid 2485383,↺ 2(本次重启 +1 累计)
- health 200:`db redis openai gemini fal elevenlabs speech` 全 ok
- error log 干净

---

## 备份文件

```
/opt/wonderbear/server-v7/src/services/imageGen.js.backup-2026-04-27-task2-dual-engine
```

回滚命令:
```
cp src/services/imageGen.js.backup-2026-04-27-task2-dual-engine src/services/imageGen.js
pm2 restart wonderbear-server --update-env
```

---

## ⚠️ 待 Kristy / Claude 确认的范围

### 1. storyJob.js 链式 ref 改造(任务 2 工单 D 项隐含但未明示文件)

工单 D 项要求"FAL Kontext 主路径必须用链式 reference (P2 ref P1, P3 ref P2 ... P12 ref P11)"。

**imageGen.js 已就绪**:`generateSubsequentPage(args)` 接受 `referenceImageUrl` 参数,
对调用方传入的任意 URL 都能用作 img2img 的 reference。

**storyJob.js 当前实现**(line 180-220):

```js
// 现状:所有 P2-P12 都用 P1(cover)的 URL 当 reference
const referenceImageUrl = coverIsPlaceholder ? null : coverResult.imageUrl;
const concurrency = maxPagesConcurrent;
for (let batchStart = 0; ...; batchStart += concurrency) {
  const batch = restIndices.slice(...);
  await Promise.all(batch.map(async (i) => {
    const imgResult = await generatePageImage({
      ...
      referenceImageUrl,  // 全部 P2-P12 共用 cover URL
      ...
    });
  }));
}
```

**链式版本设计取舍**:

- **方案 A:严格串行链**
  P2 引用 P1,等 P2 完成 → P3 引用 P2,等 P3 完成 → ... → P12 引用 P11
  - 优点:链式 reference 严格,角色一致性最强
  - 缺点:**生成耗时翻倍**(原 ~30s 并行,串行 ~80-150s),demo 体感差;
    任一页失败 → 后续整链断裂(只能用 placeholder URL 作 ref 或回退)

- **方案 B:窗口并行 + 链式**
  按 cover → P2 → (P3 P4) → (P5 P6 P7 P8) ... 树状扩散,每页 ref 上一层完成的最近 page
  - 优点:速度接近并行,reference 仍逐页传递
  - 缺点:reference 不再严格"P_n ref P_n-1",而是 "P_n ref 最近完成的 page"
  - 实际效果:角色一致性比纯 cover-only 强,弱于严格串行

- **方案 C:cover 锚点保留 + 增量"上一页可选"**
  P_n 优先 ref P_n-1,如果 P_n-1 还在跑或失败,fallback ref cover
  - 优点:有概率链式,有兜底
  - 缺点:不确定性高,debug 困难

**Factory 倾向**:**方案 A 严格串行**(因为本任务的核心目标是角色一致性,牺牲
~50s 是必要成本;失败链断的问题 → 任一页失败时 fallback 到 cover URL 作 ref,
保证后续仍能跑)。

请 Kristy 拍板 A/B/C,或确认我自己上 A。

---

### 2. 任务 3 缺失信息(Dora 续跑测试不能起步前需要)

工单原文:
- "P12 prompt 改写为 Dora 主体续集种子帧(我之前给的版本)"
- "P1/P8 'big bright eyes' → 'expressive eyes'"
- "guidance_scale Pro Cover 默认,P12 +1"
- "三层验证 + R2 持久化必须"

**Factory 当前缺**:

(a) **P12 Dora seed prompt 全文**:工单提到"我之前给的版本"
   — 当前 session 没有该文本。请 Kristy / Claude 把 P12 完整 prompt 贴出来,
   或指明它在 repo 里的哪个文件(grep 已搜过 `assets/story/Dora_Story_12pages.md`,
   可能在那里但需要确认)。

(b) **guidance_scale Pro Cover 默认值数字**:Pro 2K 默认是多少?(0? 5? 7?)
   "P12 +1" 意思是 default + 1?需要明确 base value。
   备注:Gemini 3 Pro Image API 是否支持 guidance_scale 参数也需确认(
   当前 imageGen.js 没传这个参数;若 API 不支持,需澄清是不是要传 `topK` 或别的参数)。

(c) **三层验证具体含义**:三层 = ?
   - 猜测 1:语法层 + import 层 + 真实 API 调用层
   - 猜测 2:Cover 层 + 内页层 + 整本拼装层
   - 猜测 3:R2 上传 + URL 可访问 + TV 端可加载
   请明确。

(d) **R2 持久化 key 命名约定**:任务 3 测试图存到哪个 R2 prefix?
   `stories/{storyId}/page_{NN}.png` 是现有约定(见 mediaStorage.js),
   测试用是否走同一约定还是单独 prefix(如 `tests/dora-2026-04-27/...`)?

---

## 已问问题(任务 2 阻塞时遗留,可一并答)

(摘自 `coordination/pending-approval/2026-04-27-task2-blocked-openai-model.md`)

1. `OPENAI_IMAGE_QUALITY` 保持 `medium` 还是切 `high`?
   - 当前 .env 是 `medium`,Factory 已按此前提写 cost 表($0.05)
   - 若切 `high`($0.17/张),需同步改 cost 表

2. 是否还有其他 IMAGE 相关 env 要切?
   - 当前已经切了 5 个(OPENAI_IMAGE_MODEL/QUALITY,NANO_BANANA_COVER/INTERIOR_MODEL/RESOLUTION)
   - 没看到工单提其他

---

## 期望 next action

Kristy / Claude 答复:
1. storyJob.js 链式 ref 用方案 A/B/C 哪个(或不在本次范围)
2. P12 Dora seed prompt 全文 + base guidance_scale
3. 三层验证含义 + R2 key 约定
→ Factory 接到答复后:
  - 改 storyJob.js 链式
  - 进任务 3:P12 prompt + 跑一次 12 页生成 + R2 持久化 + 三层验证

不阻塞:imageGen.js 已就位,任务 2 主体可以视为已完成,只剩 storyJob 是否要本次顺手做。

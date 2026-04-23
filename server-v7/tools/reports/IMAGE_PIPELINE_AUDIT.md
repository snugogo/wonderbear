# 图片 Pipeline 审计报告 (Phase 0)

> 产出人: Factory  日期: 2026-04-24  基线 commit: 56c0b3d

---

## 1. 入口点与调用链

Story 生成从 route 进入 → 队列 → 图片 pipeline 的完整路径:

\\\
POST /api/story/generate
  → src/routes/story.js              (handler 把 job 入队)
  → src/queues/storyJob.js           (单进程串行队列)
      runOne(job):
        Stage llm:   generateStoryJson()        ── src/services/llm.js
        Stage image:
          L123-130: generatePageImage({pageNum:1, ...})    ── src/services/imageGen.js
                      → generateCoverImage()
          L139-160: for pageNum 2..12 (concurrency=3):
                      generatePageImage({pageNum:N, referenceImageUrl: coverResult.imageUrl})
                      → generateSubsequentPage()
        Stage tts / assembly / done
\\\

关键文件 + 行号:

| 角色 | 文件 | 关键函数/行号 |
|---|---|---|
| 总调度 | \src/queues/storyJob.js\ | \unOne()\ L28, 封面 L123, 2-12 L139-160 |
| 图片生成核心 | \src/services/imageGen.js\ | \generateCoverImage\ L64, \generateSubsequentPage\ L108, \unTier\ L164, \callOpenAI\ L222, \callImagen\ L245, \callFalKontext\ L268, \callFalText\ L294 |
| Prompt 清洗 | \src/utils/storyPrompt.js\ | \sanitizeImagePrompt\ L159, \SAFE_REPLACEMENTS\ L39, \DANGEROUS_COMBOS_OPENAI\ L99, \ggressiveRewrite\ L147 |
| LLM (文本故事) | \src/services/llm.js\ | \callGeminiStory\ L267 — gemini-2.5-flash |

## 2. Page 1 当前实际调用

- 模型: **\gpt-image-1\** (非 \gpt-image-1.5\;后者施工单要求的名称未在官方公开文档中出现)
- 参数: \size=1536x1024, quality=medium, n=1\, 无 response_format (gpt-image-1 默认返回 b64_json)
- Prompt 组装: \sanitizeImagePrompt(rawPrompt, {channel:'openai', characterDesc})\ 返回 \{characterDesc}, {cleaned}, {styleSuffix}\ 拼接
- 错误分支: \unTier\ catch 内按正则 \content_policy|moderation_blocked|safety\ 分 30003/30002,**不区分 safety vs 网络错**,且**任何错误都只试一次**就进下一 tier

## 3. 当前兜底链

- **Tier 2 = Imagen 3.0** (\imagen-3.0-generate-002:predict\) — Google 官方 6/24 下线,必换
- **placeholder** — 最终兜底,返回 \mock.wonderbear.app/placeholder/pageN.webp\

## 4. Page 2-12 (不改,但确认)

- Tier 1: \callFalKontext(prompt, referenceImageUrl)\ → POST \https://fal.run/fal-ai/flux-pro/kontext\,\image_url\ = Page 1 的 URL
- Tier 2: \callFalText(prompt)\ → POST \https://fal.run/fal-ai/flux/dev\
- **referenceImageUrl 来源**: \storyJob.js:L140 referenceImageUrl = coverResult.imageUrl\ — 没有任何条件判断,placeholder 也会被当 reference 传给 FAL Kontext → 昨晚 422 根因确认

## 5. 数据模型 (Story)

- \coverUrl\ / \coverUrlHd\ 独立字段 (L212-213 in schema)
- \pages\ Json 数组,每页含 \imageUrl/imageUrlHd/text/ttsUrl\ 等
- 写入: \storyJob.js:L200-228\ 同时写 \coverUrl\ 和 \pages[].imageUrl\
- Page 1 的 \pages[0].imageUrl\ === \coverUrl\(同一来源)

## 6. 计划要改的文件清单

| 文件 | 改动 | 风险 |
|---|---|---|
| \src/utils/storyPrompt.js\ | 新增导出 \sanitizePromptForPage1\(按施工单 §3.2 的 4 条铁律字典);保留现有 \sanitizeImagePrompt\ 不动(Page 2-12 继续用) | 低 — 纯新增 |
| \src/services/imageGen.js\ | 重写 \generateCoverImage\: 三次 OpenAI 尝试(静态清洗 / LLM 改写 1 / LLM 改写 2)+ Nano Banana 兜底 A + FAL Flux 兜底 B;新增 \isSafetyRejection\、\geminiRewritePrompt\、\callNanoBanana\;删除 \callImagen\ 调用路径 | 中 — 核心文件重写,需 probe 验证 |
| \src/queues/storyJob.js\ | L139-160 批次循环前加判断:\if (coverResult.provider === 'placeholder') 对 2-12 强制走 text2image\ | 低 |
| \	ools/test_sanitize.js\ | 新增 10 个单测 | 低 |
| \	ools/probe_page1.js\ | 新增 CLI 探针 | 低 |
| \	ools/IMAGE_PIPELINE_AUDIT.md\ | 本文件(Phase 7 移到 reports/) | — |
| \	ools/SEED_GENERATION_REPORT.md\ | Phase 6 产出 | — |

## 7. 识别出的风险点 (需主控台判断)

### R1. OpenAI 模型名: \gpt-image-1\ vs \gpt-image-1.5\
施工单锁定 \gpt-image-1.5\,但当前代码在用 \gpt-image-1\,且 OpenAI 官方 2026-04 公开 API 模型列表里只有 \gpt-image-1\。\gpt-image-1.5\ 可能:(a) 是新上的预览版我未知,(b) 主控台笔误,(c) 内部别名。
**倾向 A**: 在 Phase 2 先用 \gpt-image-1\ 接通(保证可运行),同时在 probe 脚本里探测 \gpt-image-1.5\ 是否可达;如可用则切过去。
**倾向 B**: 严格按施工单用 \gpt-image-1.5\,如果 404 就视作与 safety 同等的失败并进兜底。

### R2. OpenAI 返回 b64 的 data: URL 给 FAL Kontext 做 reference 是否 work
当前 \callOpenAI\ 在 b64_json 时返回 \data:image/png;base64,...\ 作为 imageUrl。这个 data URL 会被直接作为 \image_url\ 传给 FAL Kontext。**昨晚因为 Page 1 失败成了 placeholder,没触发到这个路径**,不知是否会 422 / 或会不会因为 base64 太长被拒。
**倾向**: Phase 2 里把 OpenAI b64 上传到对象存储拿到 http URL 后再返回(统一 Nano Banana 也走此路径)。否则跑 Phase 6 时可能再爆。**但这会触发 上传对象存储这个子问题** — 当前代码根本没有上传函数,需要确认现有是否有 uploader 还是要新写。

### R3. Nano Banana 上传
施工单 §5.3 伪代码里写了 \uploadImageBuffer(buffer, mimeType)\,但项目里没有现成函数。需要确认: 是否已有 S3/CDN 的 uploader?还是接受 data: URL 作为最终 imageUrl(跟 OpenAI b64 一样)。
**倾向**: Phase 3 里先让 Nano Banana 也返回 data: URL,然后 R2 里统一解决(要么都上传,要么都保留 data URL + 确认 FAL Kontext 能接受)。

### 附带发现 (只记录不修)
- \src/routes/device.js.bak\ / \pp.js.bak-*\ / \device.js.bak-\ 等残骸文件存在
- \probe.mjs\ 在 server-v7 根目录,应该移到 tools/
- \src/services/imageGen.js\ 里 \OPENAI_CONTENT_POLICY_MARKERS\ 判断在 runTier 只用来分类 errorCode(30003 vs 30002),没有实际引导重试 — 说明当前OpenAI 被拒就走 Imagen是 tier 切换,不是 safety 分类的结果;代码逻辑其实把任何错误都算兜底

## 8. 等待 ACK 的点

请回复:
1. R1 选 A 还是 B(模型名策略)
2. R2 + R3 合并问题: 现在有没有对象存储 uploader?如果没有,接受 OpenAI/Nano Banana 都返回 data:base64 URL,然后在 storyJob 层面把它转成 http URL(或者确认 FAL Kontext + 前端都吃 data URL)?

ACK 后即进 Phase 1。

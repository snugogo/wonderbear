# Phase C · Gemini Nano Banana 兜底链路真实压测报告

**Date**: 2026-04-24
**Scenario**: `seed-dialogue-005-first-day-school` (Mia 第一天上学害怕)
**StoryId**: `cmocghr2z0001wevf27mdozx4`
**模拟条件**: `DEBUG_FORCE_OPENAI_FAIL=1`(每次 `callOpenAI` 抛一个匹配 `isSafetyRejection` 的错)
**生产模型**: `OPENAI_IMAGE_MODEL=gpt-image-1.5` + `OPENAI_IMAGE_QUALITY=high`(Plan B 已生效)
**Artifacts**: `tools/reports/phase_c_gemini/page-01.png` + `page-02..12.jpeg` + `_manifest.json`

---

## 1. 总览

- **status**: `completed`
- **12 页全成率**: **12 / 12 ✅**
- **Page 1 出图来源**: **Nano Banana**(真出图,不是 placeholder,不是 FAL text 兜底)
- **Page 2-12 出图来源**: **全部 fal-kontext**(11/11)
- **Page 1 总耗时**: 约 8 s(3 轮 OpenAI fake-fail 各 0 ms + Gemini rewrite r1/r2 约 2 s + Nano Banana 6391 ms)
- **Page 2-12 总耗时**: 约 3 分钟(串行 + 并发混合)

## 2. imageGenLog 完整链路(DB 真相)

| pageNum | provider          | success | errorCode | duration  |
|--------:|-------------------|:-------:|:---------:|----------:|
|    1    | openai            |    N    | 30003     |      0 ms |
|    1    | openai_rewrite1   |    N    | 30003     |      0 ms |
|    1    | openai_rewrite2   |    N    | 30003     |      0 ms |
|    1    | **nano_banana**   |  **Y**  |     -     | **6391 ms** |
|    2    | fal-kontext       |    Y    |     -     |  22 704 ms |
|    3    | fal-kontext       |    Y    |     -     |  15 113 ms |
|    4    | fal-kontext       |    Y    |     -     |  14 810 ms |
|    5    | fal-kontext       |    Y    |     -     |  18 721 ms |
|    6    | fal-kontext       |    Y    |     -     |  28 151 ms |
|    7    | fal-kontext       |    Y    |     -     |  15 358 ms |
|    8    | fal-kontext       |    Y    |     -     |  39 204 ms |
|    9    | fal-kontext       |    Y    |     -     |  11 037 ms |
|   10    | fal-kontext       |    Y    |     -     |  20 682 ms |
|   11    | fal-kontext       |    Y    |     -     |  13 144 ms |
|   12    | fal-kontext       |    Y    |     -     |  13 849 ms |

每条 Page 1 失败 log 的 `errorMessage` 前 80 字都是:
```
DEBUG_FORCE_OPENAI_FAIL: Your request was rejected as a result of our safety sys...
```
证明:
- `isSafetyRejection` 正确识别 DEBUG 触发的"安全拒绝",进入 rewrite 路径
- `openai_rewrite1` / `openai_rewrite2` 两条 log 的 provider 字段说明 Gemini rewrite 成功返回了改写 prompt(否则 log 里应该是 `gemini_rewrite_r1` / `gemini_rewrite_r2`,而不是 `openai_rewrite1/2`)——即完整走完 Try2 + Try3
- 最终 `nano_banana` tier=4 success=true,6391 ms 内完成 cover 生成,不是 placeholder,也没有再降级到 FAL flux/dev text2image

## 3. 12 页一致性主观打分(1-5,越高越一致)

- **角色面部特征**: **4 / 5** — 双马尾 + 黄色蝴蝶结 + 棕色大眼 + 苹果脸跨 12 页稳定;page 12 两人都戴蝴蝶结(可能是 Kontext 对主角特征的复用——可以接受)
- **服装与道具**: **4 / 5** — 白 T 恤 + 黄色半身裙始终一致;书包从蓝色(room 场景)变红色(户外场景),剧情上可能合理,但不是 Kontext 参考的严格一致性
- **风格与笔触**: **5 / 5** — 水彩纸肌理 + 柔和色板 + 童书插画风格全 12 页稳定
- **整体**: **4.5 / 5** — 以"OpenAI 主路径失败 + Gemini 风格接手"这个最差情况看,一致性水平达到可上线标准

## 4. 我的发现(对生产的意义)

1. **Nano Banana 作为 Page 1 兜底真实可用**。出图速度 ~6 s,质量达到"可当封面"标准,风格接近水彩童书。**结论**:生产上不用额外搭对象存储把 OpenAI base64 上传 CDN,Nano Banana 返回的 data URI 直接传给 FAL Kontext 作 `image_url` 就能继续 img2img。

2. **FAL Kontext 接受 data URI image_url 被再次证实**。第一次是 2026-04-23 prod demo 时验证(OpenAI → Kontext),这次是 Nano Banana → Kontext,data URI 大小约 1.9 MB 的 PNG,Kontext 11 次请求全成功(平均 19 s,p95 约 39 s),无一次 "image_download_failed"。

3. **Gemini rewrite 双轮实际发生了**。imageGenLog 里 `openai_rewrite1` / `openai_rewrite2` 的 provider 出现,意味着 `geminiRewritePrompt()` 成功返回,然后才去再 hit OpenAI 被 fake-fail。这验证了 rewrite 路径在真实网络下是可用的(不是代码能编译就行)。未来如果 OpenAI 换了更严格的 CSAM classifier,这条路径是主要防线。

## 5. 风险点(发现但本工单不动)

- **cover 被标成 jpeg vs png 混合**。Page 1 Nano Banana 返回 PNG(1.9 MB),Page 2-12 Kontext 返回 JPEG(380-460 KB)。前端播放时应该都是 `<img>` 直接渲染没问题,但如果有 CDN 上传/转码逻辑,mime 的差异需要处理。不在本工单范围。
- **Kontext p95 近 40 s(page-08)**。串行情况下 11 页 × 20 s 平均 = 4 分钟,不算快。`storyJob.js` 已有 3 并发,但 Kontext 本身慢。可接受,不优化。

## 6. Phase D 之前需要主控台确认的开放问题(2 个)

1. **DEBUG_FORCE_OPENAI_FAIL 开关保留 or 删除?**倾向 **保留**(env-guarded,默认关闭),理由:未来 OpenAI 升级安全策略时,一行 env 就能复现 Nano Banana 兜底链路是否仍工作,回归测试成本为 0。如果主控台认为"生产代码不该有 debug 开关",我这次就删。
2. **Phase D 是否跑全 6 本**(如工单),还是只跑 2-3 本试水?倾向 **跑全 6 本**(2-3 小时,花费可控),否则 1.5 high 的分布(命中率 / 一致性)样本不够。

---

**生成路径可追溯 log**:`/tmp/phase_c_run.log`(VPS)
**12 页产物**:`tools/reports/phase_c_gemini/page-{01..12}.{png,jpeg}`
**数据库事实**:`imageGenLog` 表 WHERE storyId='cmocghr2z0001wevf27mdozx4'(上面表格就是 DB 导出)

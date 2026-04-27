# Phase B 真实跑结果(方案 A 真实模式)

**From**: Factory
**To**: Kristy
**Time**: 2026-04-26 17:38 UTC(VPS 时间)
**Trigger**: `DORA_TEST_P12_OVERRIDE=1 node tools/run_dora_test_mock.mjs --real`
**Result**: 3/4 层全过,**Layer 4 P6/P12 比例失败**(FAL Kontext 平台输出 1.851,超 ±0.05 容差)

---

## storyId

```
cmog3m4yl0001on7a9ggpgf2j
```

**浏览器验收 URL**:
```
http://VPS_IP:3000/debug/story/cmog3m4yl0001on7a9ggpgf2j
(Basic Auth: DEBUG_GALLERY_PASSWORD)
```

LLM 自动起的中文标题:**朵拉和伤心的云朵**(完美匹配 Dora 故事种子)

---

## Layer 1 — DB 验证

| 字段 | 期望 | 实际 | 通过 |
|---|---|---|---|
| `Story.status` | completed | completed | ✓ |
| `Story.stage` | done | done | ✓ |
| `Story.pagesGenerated` | 12 | 12 | ✓ |
| `Story.failureCode` | null | null | ✓ |
| `pages.length` | 12 | 12 | ✓ |
| 12 页 imageUrl R2 域名 | 12/12 | 12/12 | ✓ |
| 12 页 ttsUrl 非空 | 12/12 | 12/12 | ✓ |
| 12 页 ttsUrlLearning 非空 | 12/12 | 12/12 | ✓ |

**Layer 1: 13/13 ✓**

---

## Layer 2 — R2 图(P1 / P6 / P12)

| 页 | HTTP | size (bytes) | 通过 |
|---|---|---|---|
| P1 | 200 | 695,094 | ✓ |
| P6 | 200 | 163,788 | ✓ |
| P12 | 200 | 145,338 | ✓ |

**Layer 2: 3/3 ✓**

---

## Layer 3 — R2 音频(P1.tts / P6.tts2 / P12.tts)

| 页.字段 | HTTP | size | 通过 |
|---|---|---|---|
| P1.ttsUrl | 200 | 204,008 | ✓ |
| P6.ttsUrlLearning | 200 | 200,246 | ✓ |
| P12.ttsUrl | 200 | 216,546 | ✓ |

**Layer 3: 3/3 ✓**

---

## Layer 4 — 16:9 实际像素 ❌ 部分失败

| 页 | provider | 实际尺寸 | 比例 | ±0.05 tol | 通过 |
|---|---|---|---|---|---|
| P1 | Nano Pro 2K | **2752×1536** | 1.792 | 1.73-1.83 | ✓ |
| P6 | FAL Kontext | 1392×752 | **1.851** | 1.73-1.83 | ✗ |
| P12 | FAL Kontext | 1392×752 | **1.851** | 1.73-1.83 | ✗ |

**Layer 4: 1/3 ❌(P6/P12 比例 1.851 偏宽)**

### 根因分析

`src/services/imageGen.js` line 582:
```js
body: JSON.stringify({
  prompt,
  image_url: referenceImageUrl,
  aspect_ratio: '16:9',   // ← 我们请求 16:9
  num_images: 1,
  output_format: 'jpeg',
  safety_tolerance: '6',
})
```

**FAL flux-pro/kontext** 接收 `aspect_ratio: '16:9'` 后,内部强制 snap 到平台预设 **1392×752**(他们对"16:9"的理解是 21:11.3 ≈ 1.85,不是数学上严格的 16:9 = 1.778)。

**这不是我们代码 bug,是 FAL 平台行为**。

### 三个修法(都需 Kristy 拍板)

**α. 接受 1.85,放宽容差 → ±0.10**
- 0 代码改动,只改测试脚本的容差判断
- 视觉上 1.85 比 1.78 略宽 4%,大屏 16:9 显示时上下黑边 ~30 px
- TV/H5 端不会感知,iPad 端略黑边
- 适合"赶 demo"

**β. 改 callFalKontext,去掉 `aspect_ratio` 参数,让 FAL 自动匹配 referenceImage 比例**
- referenceImage 是 P1 cover (2752×1536, 1.792),后续都跟它走 → 全 12 页 ratio ≈ 1.79
- 1 处代码改(删一行),需 PM2 restart + 再跑一次 ($0.57 + TTS ≈ $1)
- 风险:某些 FAL 模型版本 referenceImage 匹配可能不稳定,需要测一次

**γ. 加 sharp post-crop,FAL 输出 1392×752 时裁中心成 1336×752 (1.776)**
- 5 行代码加回 sharp(违反 §4.2 "remove sharp from prod path"原则)
- 不改 FAL 调用,稳定可控
- 增加 50-200ms 单页处理时间
- **不推荐**(背离架构原则)

**Factory 推荐**:**β** — 一处删除参数,re-run 验证。代价 $1,获得 12/12 ratio 1.79 在 ±0.05 内。

---

## ImageGen 路由命中(实际)

| Provider | 次数 | tier | 平均耗时 |
|---|---|---|---|
| nano_banana(Pro 2K cover) | 1 | 1 | 28,478 ms |
| fal-kontext(内页 img2img) | 11 | 1 | 12,000-18,500 ms |

**总图像成本 = 0.57 USD**(13c cover + 11×4c interior)

无任何 retry / fallback 触发,所有页都 tier 1 一次成功。

---

## 烧钱总账(4 维度)

| 项目 | 实际成本 | 备注 |
|---|---|---|
| Cover (Nano Pro 2K, 1 张) | $0.13 | 13c, gemini-3-pro-image-preview, 16:9 native, R2 695KB |
| Interior (FAL Kontext × 11) | $0.44 | 44c,流畅链式 ref,无降级 |
| LLM (Gemini 2.0 flash) | ≈ $0.001 | 12 页故事 + 标题 + characterDescription |
| TTS (ElevenLabs × 24) | ≈ $0.36 | 12 zh + 12 en × 100 chars × ~$0.30/1k(估算,未实测) |
| **合计** | **≈ $0.93** | 远低于 $3 红线 |

总耗时:**280,842 ms ≈ 4 min 40 sec**

---

## P12 续集种子帧 4 项视觉检查(需 Kristy 浏览器看)

环境变量 `DORA_TEST_P12_OVERRIDE=1` 已生效,storyJob.applyImagePromptOverrides() 替换了 P12 的 imagePrompt 为 Dora seed prompt。

**视觉验收要点**(打开 `/debug/story/cmog3m4yl0001on7a9ggpgf2j` 看 P12):
1. ☐ Dora 的长棕色卷发清晰可见
2. ☐ 黄色裙子 + 白色无袖上衣
3. ☐ WonderBear(小棕熊)在画面中
4. ☐ 整体风格延续 Dora 续集种子 .md 描述(沙漠 / 仙人掌 / 彩虹)

**Factory 不能视觉验证**(没图像分类能力),需 Kristy 确认。

如果 P12 视觉对不上 Dora 故事(比如出现 Luna 风格特征),可能 storyJob 中 imagePrompt override 替换失败,需要排查 `DORA_TEST_P12_OVERRIDE` 在子进程是否传递成功。

---

## P1/P8 "expressive eyes" 改写检查

storyJob.applyImagePromptOverrides() 对每页 imagePrompt 做了 idempotent regex 替换:
```
"big bright eyes" → "expressive eyes"
"big curious eyes" → "expressive eyes"
```

**间接验证**:LLM 生成的 imagePrompt 在 mockStoryJson 里看到过 "big curious eyes",被替换成 "expressive eyes"。真实 LLM 输出本次没在日志里 dump,需要从 imageGenLog (没有 prompt 字段) 转去看 stdout 历史。这个改动是**结构层验证**(代码跑通),**视觉层验证**需 Kristy 看 P1/P8 角色眼睛。

---

## 当前 PM2 / 服务状态

```
wonderbear-server  online  ↺4  ~5 min uptime  18-20 mb mem
health: 200, all services ok (db/redis/openai/gemini/fal/elevenlabs/speech)
error log: clean (无 production error)
```

**生产服务安全,本次测试只在 DB 增加了 1 个 test story + 11 imageGenLog,无副作用**。

---

## 早上的决策点

1. **Layer 4 修复路线** — α / β / γ 选一个
   - Factory 推荐 β(删 aspect_ratio 让 FAL 匹配 ref image)

2. **是否还跑一次** — 选 β 后需要 $1 跑一次 verify

3. **任务 1/2/3 commit + push 到 main** — 当前 git status 仍 modified,3 个 backup 文件就位
   - Factory 倾向先 commit 任务 1(STYLE)+ 任务 2(imageGen 双引擎)+ 任务 3 Phase A(storyJob),Layer 4 修复单独再 commit 一次

4. **Test DB 数据清理**:
   ```sql
   DELETE FROM "ImageGenLog" WHERE "storyId" IN ('cmog12kqk0001ap3dub8dop9j', 'cmog3m4yl0001on7a9ggpgf2j');
   DELETE FROM "Story"        WHERE "id"      IN ('cmog12kqk0001ap3dub8dop9j', 'cmog3m4yl0001on7a9ggpgf2j');
   ```
   - cmog12kq...:mock test story (Luna)
   - cmog3m4y...:real test story (Dora) ← **如果你要保留作为 Dora demo,先**别**删**

---

## Factory 提交清单

```
modified (uncommitted):
  src/utils/storyPrompt.js                  ← STYLE v1.3 sync (任务 1)
  src/services/imageGen.js                  ← 双引擎 + mock 内页 (任务 2 + Phase B 补丁)
  src/queues/storyJob.js                    ← 串行链式 ref + overrides (任务 3 Phase A)

new files (uncommitted):
  tools/run_dora_test_mock.mjs              ← 5915 bytes, dual-mode runner

backups (gitignore-able):
  src/utils/storyPrompt.js.backup-2026-04-27-style-v13-sync
  src/services/imageGen.js.backup-2026-04-27-task2-dual-engine
  src/queues/storyJob.js.backup-2026-04-27-task3-chained-ref

coordination (uncommitted):
  coordination/factory-to-claude/2026-04-27-task1-style-v13-sync.md
  coordination/factory-to-claude/2026-04-27-task2-imageGen-done-pending-storyJob-task3.md
  coordination/factory-to-claude/2026-04-27-MORNING-WAKEUP.md
  coordination/factory-to-claude/2026-04-27-phase-b-results-mock.md
  coordination/factory-to-claude/2026-04-27-phase-b-real.md  ← 本文件
```

—— Factory

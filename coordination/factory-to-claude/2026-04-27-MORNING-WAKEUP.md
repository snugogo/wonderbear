# MORNING WAKEUP — 2026-04-27 早上 (Factory 通宵交棒)

**From**: Factory
**To**: Kristy(早安)
**Time**: 2026-04-26 17:05 UTC(凌晨 1 点附近)
**Refs**: PRODUCT_CONSTITUTION §4.2 §7,STYLE_PROMPT_REFERENCE §3 §8.2,
         AGENTS.md §1.1 §2.1 §2.2 §3.1,任务 1/2/3 工单

---

## TL;DR(60 秒读完)

✅ **任务 1**(STYLE v1.3 + PM2 守护)— 完成,server `online` ↺3
✅ **任务 2**(imageGen.js 双引擎 + 16:9 + cost 4 维度)— 完成
✅ **任务 3 Phase A**(storyJob.js 链式 ref + P1/P8/P12 prompt overrides)— 完成
⏸ **任务 3 Phase B**(实际跑 12 页 Dora + 三层验证)— **停在这里等你拍板**

⏸ Phase B 不擅自跑的理由:
1. seed_dialogues.json 没有"不下雨的云"场景 — LLM 不会生成 .md 那 12 页
2. Q3 三层验证字段 (`audioZhUrl/audioEnUrl/width/height`) 跟实际 schema 不匹配
3. 需要写新 fixture-bypass + runner script(高风险,独自凌晨跑)
4. 单次成本 $0.50-1.50 + 5 分钟,失败 retry 翻倍

→ **请你早上拍 3 个方案选 1,Factory 5 分钟内就能跑完 + 报结果**(详见下面 §3)

---

## 一、任务 1 留痕(参考)

`/opt/wonderbear/coordination/factory-to-claude/2026-04-27-task1-style-v13-sync.md`

要点:
- STYLE_SUFFIXES 三个 key (default/screen_hd/print) 全部指向 WONDERBEAR_MODERN_GOUACHE 常量
  长度 4212 chars,逐字对齐 STYLE_PROMPT_REFERENCE.md §3
- PM2 6.0.14 已新装,`wonderbear-server` 进程在守护(systemd unit `pm2-root.service` 已配)
- 备份:`src/utils/storyPrompt.js.backup-2026-04-27-style-v13-sync`

---

## 二、任务 2 留痕(参考)

`/opt/wonderbear/coordination/factory-to-claude/2026-04-27-task2-imageGen-done-pending-storyJob-task3.md`

### 改动核心(`src/services/imageGen.js`)

1. **callNanoBanana(prompt, isCover=false)** 新签名,读 3 个新 env:
   - `NANO_BANANA_COVER_MODEL` → Cover 用 `gemini-3-pro-image-preview`
   - `NANO_BANANA_INTERIOR_MODEL` → 内页用 `gemini-2.5-flash-image`
   - `NANO_BANANA_RESOLUTION` → Cover 时传 `2K`

2. **删除 sharp 居中裁剪**(从生产路径)
   - `cropAndResizeGeminiImage()` 函数本身保留 export(tools/test_gemini_crop.js 还在 import)
   - callNanoBanana 内部直接用 `generationConfig.imageConfig.aspectRatio='16:9'`
   - Cover 加 `imageConfig.imageSize='2K'`(Pro 支持),Flash 不传

3. **Cover 链路 [Nano Banana Pro → OpenAI → FAL]**
   - 删除了 age-routed Young/Old 分支(isYoungAge / coverYoungBranch / coverOldBranch)
   - 删除了 Gemini rewrite 中间步骤(REWRITE_PROMPT_R1/R2 + geminiRewritePrompt 保留为 dead code)

4. **内页链路 [FAL Kontext → Nano Banana Flash → OpenAI]**
   - 替换原 FAL text2image 内页兜底

5. **OPENAI_MODEL 默认值** `gpt-image-1.5`(.env 已是这个值,只是 fallback 默认安全网)

6. **cost 表 4 维度齐**(头部注释,Cover 用 costCents override 13)

### 验证(全过)

- `node --check`:通过
- import 健全性 8/8
- PM2 ↺2,health 200,error log 干净

### 备份

```
src/services/imageGen.js.backup-2026-04-27-task2-dual-engine
```

---

## 三、任务 3 Phase A(storyJob.js 链式 ref + Dora prompt overrides)

### 改动核心(`src/queues/storyJob.js`)

**1. P1/P8 idempotent 替换**(全局,生产安全)

```js
function applyImagePromptOverrides(page) {
  let imagePrompt = page.imagePrompt;
  if (page.pageNum === 1 || page.pageNum === 8) {
    imagePrompt = imagePrompt.replace(/big bright eyes/g, 'expressive eyes');
  }
  // ...
}
```

为什么是全局而非 env-gated:
- 这是 v1.3 风格对齐(避免日系动漫审美词)
- regex 幂等,LLM 没产出"big bright eyes"时是 no-op
- 不会影响其他故事

**2. P12 Dora seed prompt 替换**(env-gated,默认关)

```js
if (page.pageNum === 12 && process.env.DORA_TEST_P12_OVERRIDE === '1') {
  imagePrompt = DORA_P12_SEED_PROMPT;
}
```

`DORA_P12_SEED_PROMPT` 常量是你 Q2 答复的全文(逐字)。

为什么 env-gated:
- 这个 prompt 是 Dora 专属测试,生产其他故事用了会出错
- 默认关 → 生产零影响
- 跑 Dora 测试时 set `DORA_TEST_P12_OVERRIDE=1` 即可

**3. P2-P12 严格串行 + 链式 ref + Q1 D 安全网**

旧:`Promise.all` 4 路并发,所有页用 cover URL 当 ref(~30s)
新:`for...of` 串行,每页 ref 上一页成功的 URL(~80-150s)

```js
let prevRefUrl = coverRefUrl;
for (const i of restIndices) {
  const page = pages[i];
  const imgResult = await generatePageImage({
    imagePrompt: applyImagePromptOverrides(page),
    referenceImageUrl: prevRefUrl,
    forceText2Image: !prevRefUrl,
    // ...
  });
  // Q1 D 安全网:任一页失败时回退到 cover URL,避免整链断裂
  if (imgResult.provider !== 'placeholder' && imgResult.imageUrl) {
    prevRefUrl = imgResult.imageUrl;
  } else {
    prevRefUrl = coverRefUrl;
  }
}
```

`maxPagesConcurrent` 选项保留在 `createStoryQueue(prisma, options)` API 表面但已忽略
(向后兼容现有测试调用方)。

### 验证(全过)

- `node --check`:通过
- `createStoryQueue` import + 5 方法全 OK(enqueue / queueDepth / runNextUntilEmpty / runImmediate)
- PM2 ↺3,health 200

### 备份

```
src/queues/storyJob.js.backup-2026-04-27-task3-chained-ref
```

---

## 四、Phase B(实际跑 12 页) — **请你拍板,Factory 5 分钟跑完**

### 当前阻塞

**A. seed scenario 不匹配**
`/tmp/seed_dialogues.json` 6 个 scenarios(ocean-song / magic-wardrobe / cinderella-slipper /
lost-star / first-day-school / screen-free-saturday)**没有 Dora 不下雨的云**。
直接跑 → LLM 生成上述某个故事 → P12 被 DORA seed 覆盖 → 故事最后一页和前 11 页对不上。

**B. Q3 schema 字段不存在**
你 Q3 答复给的 SQL:
```
SELECT pageNum, imageUrl, audioZhUrl, audioEnUrl, width, height FROM page
```

实际 prisma schema:
- 没有 `page` 表 — 12 页是 `Story.pages` JSON 列(数组)
- 字段实际叫 `ttsUrl` 和 `ttsUrlLearning`,**不是** `audioZhUrl/audioEnUrl`
- 没有 `width / height` 列(图大小没存,要查需 curl 拉图过 sharp)

**C. 需要新代码**
要走 .md 那 12 页 prompt,需要 storyJob.js 加一个 `STORY_FIXTURE_PATH` env-gated bypass
(skip generateStoryJson,从 fixture JSON 加载),再写一个 `tools/run_dora_test.mjs`。
共 50-80 行新代码 + 1 次 PM2 restart(若走 API path)。

### 三个方案让你选(早上回我一个字母即可)

#### 方案 A:不跑实际 12 页,只跑 mock 验证(0 成本,5 分钟)

- 设 `USE_MOCK_AI=1` 走 mock provider
- 验证整条 pipeline 链(LLM→imageGen→TTS→assembly)能否完成 12 页
- 验证三层(改写后:JSON 完整性 + URL 可达 + provider 路由分布)
- **优点**:零成本,纯结构验证,不试新引擎真实 IP/审核行为
- **缺点**:不验证 Nano Banana Pro/Flash 真实 16:9 native 输出 + 不验证 R2 持久化

#### 方案 B:跑现有 LLM-driven 路径(seed 1 个场景),P12 用 Dora override

- 新加 1 个 scenario(`seed-dialogue-007-dora-cloud`,模仿 .md 对话)到 seed_dialogues.json
- 改 run_seeds.mjs 跑单一 scenario
- set `DORA_TEST_P12_OVERRIDE=1` 跑
- LLM 生成的故事大致是 Dora + 不下雨的云(对话引导),P12 强制 override 为 seed 帧
- 三层验证适配 actual schema
- **优点**:0 新代码改动,只动 seed 文件 + run_seeds 包装器
- **缺点**:故事细节会跟 .md 不完全一致(LLM 自由发挥),但 P12 锚定确定

#### 方案 C:fixture-bypass 走 .md 12 页 prompt(高保真)

- storyJob.js 加 `STORY_FIXTURE_PATH` env 跳 LLM
- 写 `tools/run_dora_test.mjs` 直接 prisma + queue.runImmediate
- 100% 用 .md 那 12 页 prompt(P12 override 后)
- 三层验证适配 actual schema
- **优点**:角色 + 场景 + 结尾 100% 锚定 .md,验证最严
- **缺点**:50-80 行新代码 + PM2 restart,跑前我得用 `node --check` 再过一遍

#### Factory 倾向

**方案 B**。理由:
- 0 新代码 = 当晚就能跑,失败也容易回滚
- LLM 生成的故事即便细节有偏差,依然是"Dora 5 岁 + WonderBear + 云"的核心框架
- P12 强制 override 锚定 demo 视觉
- 投资人 demo 看到的是"故事完整 + 风格一致 + 角色锚定",不需要 100% .md 还原
- 方案 C 的 50 行新代码我现在写完没有人 review,带 bug 风险

如选 C,我会先写代码 + verify,再让你二次确认才跑。

---

## 五、Q3 三层验证 schema 适配建议

你 Q3 给的字段对不上实际 schema,我建议这样改写,你早上确认:

### Layer 1 — DB 验证(JSON 列 + Story metadata)

```js
const story = await prisma.story.findUnique({ where: { id: storyId } });
assert.equal(story.status, 'completed');
assert.equal(story.pages.length, 12);
for (const page of story.pages) {
  assert.ok(page.imageUrl);
  assert.ok(page.imageUrl.startsWith('https://'));
  assert.ok(/r2\.dev|wonderbear/.test(page.imageUrl));  // R2 域名
  assert.ok(page.ttsUrl);                               // 主 lang TTS
  assert.ok(page.ttsUrlLearning);                       // 第二 lang TTS
}
```

### Layer 2 — R2 image spot check(P1 / P6 / P12)

```bash
for url in "$P1_url" "$P6_url" "$P12_url"; do
  curl -I -s -o /dev/null -w "%{http_code} %{size_download}\n" "$url"
done
# 期望:200 + size > 50000 bytes
```

### Layer 3 — R2 audio spot check(P1.ttsUrl / P6.ttsUrlLearning / P12.ttsUrl)

```bash
for url in "$P1_zh" "$P6_en" "$P12_zh"; do
  curl -I -s -o /dev/null -w "%{http_code} %{size_download}\n" "$url"
done
# 期望:200 + size > 10000 bytes
```

### 跳过的 Q3 项

- `width / height 比例接近 1.78`:schema 没存,要查得 curl 拉图过 sharp。
  Phase B 我可以加一个"任取 1 张 P1 图过 sharp 报实际尺寸"的诊断步骤(不阻断验证)。

---

## 六、git status & 文件变更清单

```
On branch main
Your branch is up to date with 'origin/main'.

modified:   server-v7/src/services/imageGen.js     ← 任务 2(本任务)
modified:   server-v7/src/queues/storyJob.js       ← 任务 3 Phase A(本任务)
modified:   server-v7/src/utils/storyPrompt.js     ← 任务 1(已完成)
(其他 modified 是历史遗留)

Untracked(本任务备份):
  server-v7/src/services/imageGen.js.backup-2026-04-27-task2-dual-engine
  server-v7/src/queues/storyJob.js.backup-2026-04-27-task3-chained-ref
  server-v7/src/utils/storyPrompt.js.backup-2026-04-27-style-v13-sync
```

**未 commit / 未 push** — 等你跟 Claude 一起 review 完整段任务 1/2/3 后统一 commit
(AGENTS.md §1.1 不直接 push main)。

---

## 七、PM2 状态(当前)

```
id 0  wonderbear-server  fork  pid 2494015  uptime ~5min  ↺ 3  online  ~20mb
```

- error log 干净
- health 200(db redis openai gemini fal elevenlabs speech 全 ok)
- systemd `pm2-root.service` 已配,机器重启后会 auto-resurrect

---

## 八、回滚命令(任意一项失败时)

### 任务 1 回滚
```bash
ssh wonderbear-vps
cd /opt/wonderbear/server-v7
cp src/utils/storyPrompt.js.backup-2026-04-27-style-v13-sync src/utils/storyPrompt.js
pm2 restart wonderbear-server --update-env
```

### 任务 2 回滚
```bash
cp src/services/imageGen.js.backup-2026-04-27-task2-dual-engine src/services/imageGen.js
pm2 restart wonderbear-server --update-env
```

### 任务 3 Phase A 回滚
```bash
cp src/queues/storyJob.js.backup-2026-04-27-task3-chained-ref src/queues/storyJob.js
pm2 restart wonderbear-server --update-env
```

---

## 九、需要你早上做的事(按优先级)

1. **拍板 Phase B 方案**(A/B/C 中选 1)→ 我跑
2. **如选 B**,告诉我用现有 6 个 seed 中哪个最近(我猜 `004-lost-star` 走 WonderBear 单独主角最像;或者你给我 dora-cloud-rain 的 7 段 childTurns)
3. **如选 C**,确认我可以写 fixture-bypass + runner(我会先 verify 再让你二次拍板才跑)
4. 任务 1/2/3 全 ✅ 后,统一 commit + push main(需要你最后批准)
5. (非紧急)Q3 三层验证字段名(`audioZhUrl/audioEnUrl/width/height`)是否要 Kristy 醒后落 schema migration,还是 Phase B 用我建议的字段对应

---

## 十、coordination 留痕清单

```
/opt/wonderbear/coordination/
├── factory-to-claude/
│   ├── 2026-04-27-task1-style-v13-sync.md                            (任务 1)
│   ├── 2026-04-27-task2-imageGen-done-pending-storyJob-task3.md      (任务 2)
│   └── 2026-04-27-MORNING-WAKEUP.md                                  (本文件)
└── pending-approval/
    └── 2026-04-27-task2-blocked-openai-model.md                      (已解除阻塞)
```

---

晚安。早上你回一个字母 A/B/C,我 5 分钟内跑完 + 报三层验证结果。

— Factory

# TV-HTML 交接文档 — 服务器数据集成 + 生图 + 真实交互

**Date**: 2026-04-28
**From**: Kristy + Factory Droid (UI 调试窗口)
**To**: 下一个窗口 (服务器数据 / FAL 生图 / Dialogue 真实流程)
**Branch**: `fix/tv-gallery-v2` (24 modified files, 1 new file `utils/demoStory.ts`)
**当前状态**: 全部 UI 视觉 + 交互链路在 dev 模式下已调好。所有屏可达，所有按键有反应。**不要动 dev 路径，专注做 production 路径的真实数据集成**。

---

## §0 最高原则 (违反 = 一切重做)

### 0.1 不要重写 dev 路径

- 任何 `isDevBrowser` / `isDemoMode()` / `import.meta.env.DEV` 分支都是 Kristy 用来视觉测试 UI 的逃生通道
- 你的工作是**新增 production 路径**或**完善 production 路径**，不是简化 dev 分支
- 模板：
  ```js
  if (isDevBrowser) {
    // ← 不要动
  }
  // ↓ 你的工作在这下面
  ```

### 0.2 不要让 ActivationScreen 卡住

- main.ts `device.status='bound'; screen.go('home')` (line 126) 在 dev 模式下**必须保留**
- 一旦让 dev 重新走 ActivationScreen，所有 dev 测试链路会因为没有真实 OEM token 全部 401 → 死循环
- 历史教训：UI 之前完全 work，因为某次调"返回按键不锁定 ActivationScreen"的小改动**间接破坏了所有屏的进入**

### 0.3 焦点系统 (`useFocusable`) 双轨 register 不能改

- 文件：`src/services/focus/useFocusable.ts`
- 它现在用 `onMounted + watch(elRef)` 双轨注册
- v-if-gated 元素 (ready-painter 在 v-show=summary 内、scene cards 在 stage-3a v-if 内、end-overlay 按钮在 v-show=ended 内) 在 mount 时 ref 是 null
- onMounted 单轨**会静默丢失**这些焦点元素，用户按 OK 没反应
- 改回 onMounted 单轨 = 所有"按钮按了无效"bug 复发

### 0.4 改前必须验证 dev 链路

每次提交前手动跑一遍：
1. `Ctrl+L` → LearningScreen 看到小熊跟随光标
2. `Ctrl+D` → DialogueScreen 看到 ready-painter 按钮 + 按 OK 跳 GeneratingScreen
3. `Ctrl+G` → GeneratingScreen 看到进度条 + 小熊滑 + 按 OK 跳 Library
4. `Ctrl+B` → StoryBody 4 按键，按右移到小熊头像 → 按 OK 跳 LearningScreen
5. Library 选故事 → cover → body → 小熊按钮 → learning 完整链路

跑完没问题再 commit。

---

## §1 当前 UI 状态 (按屏)

### 1.1 ActivationScreen
- **dev 模式跳过**（main.ts 默认进 home）
- production: 显示 QR + 6 位绑定码 + 倒计时
- ESC 在 activation 是 no-op (root 屏)

### 1.2 HomeScreen
- 6 个 menu cards: Create / Stories(→library) / Bear Stars(→leaderboard) / Cast / My Den(→profile) / Settings
- ESC 在 home 是 no-op (root)

### 1.3 CreateScreen ("梦想工厂")
- 3 个 slot：每个可以是空（+ 创建新故事）或现有故事缩略图
- 现有缩略图右下有 "Play Full" / "Sequel" 按钮
- 点 + → `screen.go('dialogue')`
- 点 Play Full → dev 路径用 `buildDemoStory()` seed → `screen.go('story-cover')`
- 点 Sequel → `screen.go('dialogue', { parentStoryId, parentTitle })`

### 1.4 DialogueScreen ("你一句我一句")
- **3 个视觉状态**：
  - **3A** (`waiting-for-child`): bear flying + 4 scene cards + remote + "Hold mic" pill
  - **3B** (`recording`): bear 戴耳机 + mic 跳动 + "听你说"
  - **3C** (`bear-speaking` / `bear-thinking` / `uploading`): bear 说话 + 文字气泡 + (仅当 summary 存在时) "开画啦" 按钮
- **流程**：5 轮对话 → done=true → setSummary → 显示 ready-painter → 按 OK → screen.go('generating')
- **dev 路径**：onMounted 直接跳到第 5 轮 done 状态显示 ready-painter（Kristy 不需要看完整 5 轮，真实接服务器后 production 路径走）
- **production 路径**：用 `api.dialogueStart` / `api.dialogueTurn`（已在代码里，只是 dev 短路）

### 1.5 GeneratingScreen ("生成绘本中")
- 进度条 + 小熊跟着进度向右滑 (`bear_coming_soon.webp`)
- 顶部 stage 文案：思考 / 画第一页 / 画其他页 / 录音 / 快好了
- 底部圆形 play 按钮 (focused) → 跳 LibraryScreen
- **dev 路径**：`isDemoMode()` 返回 true → demo 进度从 4% 涨到 95% (40 秒)，不调 API
- **production 路径**：每 1.5s poll `api.storyStatus(storyId)` 直到 status='completed' → `loadAndNavigate` → screen.go('story-cover')

### 1.6 StoryCoverScreen
- 显示故事封面 + 标题 + 5 秒倒计时自动跳 story-body

### 1.7 StoryBodyScreen ("故事播放")
- 5 按键播放控制条:
  - `body-ctrl-lang`: 切语言
  - `body-ctrl-prev`: 上一页
  - `body-ctrl-play`: 暂停/播放
  - `body-ctrl-next`: 下一页
  - **`body-ctrl-learn`** (小熊头像): **直接跳 LearningScreen** (Kristy 原始设计)
- 翻完最后一页 → ended overlay 显示"学习"/"续集"按钮
- dev 快捷：按 `E` 直接跳 ended overlay

### 1.8 LearningScreen ("学习页")
- 中央巨大字 (focus-char) + 草地背景
- 底部小熊跟着光标横向滑 (`bear-pointer` translateX)
- 左右键移动 cursor，每个 walkable unit (CJK 单字 / Latin 单词) 居中显示
- ESC 回 StoryBody

### 1.9 LibraryScreen ("故事馆")
- 网格故事缩略图，按时间排序
- 点击 → `openStory()` → dev 用 `buildDemoStory` seed → cover

### 1.10 LeaderboardScreen ("Bear Stars")
- 4 个 tab 切换排行榜数据
- watch(activeTab) 仅在焦点已在 rows 时才 re-focus row-0（避免从 tab 切换时焦点被抢）

---

## §2 服务器数据集成清单

### 2.1 必须填充的 API 调用

| API | 在哪个屏 | 当前 dev 行为 | production 需要 |
|-----|---------|--------------|----------------|
| `api.dialogueStart` | DialogueScreen onMounted | dev 短路用 mock dialogueId | 调用 → applyStart |
| `api.dialogueTurn` | DialogueScreen.submitTurn | dev 短路用 mock 5 题 | 真实音频上传 + 真实 next question |
| `api.storyGenerate` | DialogueScreen.startGenerationAndNavigate | dev 跳 generating | 调用 → 拿到 storyId 才跳 |
| `api.storyStatus` (poll) | GeneratingScreen.runPoll | dev demo 进度动画 | 1.5s 轮询 |
| `api.storyDetail` | GeneratingScreen.loadAndNavigate | n/a | completed 后调用 → loadStory |
| `api.storyList` | LibraryScreen onMounted | dev 用 mock summaries | 真实分页 |
| `api.storyDetail` | LibraryScreen.openStory | dev 用 buildDemoStory | 真实拉取 |
| `api.storyFavorite` | CreateScreen / Library | optimistic | 真实 toggle |
| `api.storyDownload` | CreateScreen / Library | optimistic | 真实 toggle |
| `api.childList` | activation 后 / profile | n/a | 拉子用户列表 |
| `api.statsLog` | StoryBody / Learning / Dialogue | log only | 上报真实 events |

### 2.2 实际数据集成模式

**正确的 production 路径填充模式**：

```js
// ✅ DO: 在 isDevBrowser 之外加真实路径
async function submitTurn(payload): Promise<void> {
  if (isDevBrowser) {
    // ← 不要动这块
    ...mock logic...
    return;
  }

  // ↓ 你的工作：填充这里
  try {
    const { data } = await api.dialogueTurn(dialogueId, {
      round: dialogue.round,
      audioBase64: payload.audioBase64,
      audioMimeType: 'audio/wav',
      skipRemaining: payload.skipRemaining,
      locale: locale.value,
    });
    dialogue.applyTurn({...});
    if (data.done) {
      window.setTimeout(() => startGenerationAndNavigate(), 600);
    } else {
      speakOrAdvance();
    }
  } catch (e) {
    // ← 错误处理已经写好，看 handleTurnError
  }
}
```

**错误的模式**（会重蹈覆辙）：

```js
// ❌ DON'T: 删 dev 分支
async function submitTurn(payload): Promise<void> {
  // 把 isDevBrowser 分支删掉重写
  ...
}
```

---

## §3 生图集成清单

### 3.1 当前 mock
- `utils/demoStory.ts` 的 `buildDemoStory()` 返回 12 页 mock pages
- 每页有 `imageUrl`, `text`, `textLearning`, `ttsUrl` (mock 都是占位)

### 3.2 production 集成需要

参考 `wonderbear/server-v7/docs/spec/PROMPT_SPEC_v7_1.md` (注意是 v7.1，不是 v7.0)：

1. **Cover 生成**: storyGenerate POST 后服务器异步生成 cover → storyStatus 返回 cover URL
2. **12 页 body 图**: 服务器走 fal-kontext 主路径，OpenAI image-1 fallback
3. **TTS**: ElevenLabs / Edge TTS, URL 在 page.ttsUrl
4. **Learning 翻译**: 服务器侧生成 `textLearning` (双语对照)

### 3.3 图像加载性能

- **TV 硬约束**: 同一时间只能 mount 一张图（PRD §4.3 / kickoff §一硬规则 1）
- StoryBodyScreen 已遵守: `<img v-if="..." :key="pageIndex">` 用 v-if + key 强制 unmount 旧页
- **不要改这个模式**（改了会 OOM）

---

## §4 一定不能动的部分

### 4.1 文件清单

| 文件 | 为什么不能动 |
|------|-------------|
| `src/services/focus/useFocusable.ts` | 双轨 register (onMounted + watch)，删除 watch 会让 v-if-gated 按钮全部失效 |
| `src/services/focus/keyRouter.ts` | `globalBackFallback` API + Backspace/Escape 映射 |
| `src/services/focus/neighbors.ts` | 严格 axis-dominant，改 lenient 会破坏 BearStars 的 tab/row 层级 |
| `src/services/focus/store.ts` | `resetForScreenChange` 在 screen.go/back 时清 focus |
| `src/main.ts` line 100-127 | dev 跳过 activation 直接 home |
| `src/main.ts` line 96-103 | dev `onAuthError` no-op |
| `src/screens/ActivationScreen.vue` line ~30 | `import.meta.env.DEV` 短路 |
| `src/screens/StoryBodyScreen.vue` `body-ctrl-learn` | 跳 LearningScreen，不是 flashcard |
| `src/screens/LearningScreen.vue` `<script setup>` 同步 seed | onMounted 之前 seed 才能让 useFocusable register textRowEl |
| `src/screens/GeneratingScreen.vue` `isDemoMode()` 包含 `import.meta.env.DEV` | dev 永远走 demo，避免 401 弹回 |
| `src/screens/DialogueScreen.vue` ready-row `v-show="dialogue.summary"` | 不要改回 v-if (会让按钮 register 失败) |
| `src/utils/demoStory.ts` | dev 模式所有屏共享的 demo seed factory |

### 4.2 视觉状态 / CSS / 动画

- `LearningScreen.vue` 的 `.bear-pointer` opacity:0.55 + .is-following:1 (默认半透明，focus 时全亮)
- DialogueScreen 3A/3B/3C 用 v-if/v-else 切换 (不要改 v-show，会有空白屏 bug)
- GeneratingScreen 的 demoPercent 动画 (0.5s tick, +1.2%) 是 Kristy 调好的视觉节奏

### 4.3 Dev 工具

| Dev 功能 | 用途 |
|---------|------|
| 全局热键 Ctrl+L/D/G/B/H/C/I/S | 任何屏一键跳测 |
| 左上角 dev badge (`screen / focus / round / phase`) | Kristy 调试时唯一可靠真相源 |
| URL `?dev=1` / `?gallery=1` / `?screen=X` / `?demoPhase=3A\|3B\|3C` | 各种 deep-link 测试 |
| StoryBody 按 `E` 直接跳 ended overlay | 跳过 12 页等待 |

---

## §5 新窗口工作流推荐

### 5.1 第一天: 摸清产线

1. `Ctrl+F5` 打开 `localhost:5176/?dev=1`
2. 跑一遍所有 Ctrl+? 热键，理解每屏长什么样
3. 看 `wonderbear/server-v7/docs/spec/API_CONTRACT.md`
4. 找到每屏的 `if (isDevBrowser) { ... return; }` 分支，下面是 production 路径

### 5.2 接 API 顺序建议

1. **Activation + Auth** (production 走通)
2. **api.childList** (没有子用户进不了任何屏)
3. **api.storyList** + LibraryScreen (能看到自己的故事)
4. **api.dialogueStart + dialogueTurn** + DialogueScreen (能创造)
5. **api.storyGenerate + storyStatus** + GeneratingScreen (能生成)
6. **api.storyDetail** + StoryBody/Learning (能播放)

### 5.3 每接一个 API 必须验证

- ✅ production 路径 work（拿真实 token 测）
- ✅ dev 路径仍 work（`?dev=1` 能跑通完整链路）
- ✅ 全部 6 个 Ctrl+? 热键能跳到对应屏不卡

---

## §6 已知 production 待办 (作为参考)

> 不在本次交接范围内，但你接 API 时会撞到

1. `audioMimeType`: 浏览器是 `audio/webm`，硬件 GP15 是 `audio/wav` (server v7 §5.1)。已在代码里区分，但需要硬件落地后验证
2. `safetyLevel: 'warn'` + `safetyReplacement`: 服务器返回敏感词替换，DialogueScreen 已有 handle 但未真实测试
3. `bridge.startVoiceRecord`: mock 用 MediaRecorder，硬件用 SCO stream
4. 故事生成失败的 fallback: `PROMPT_SPEC_v7_1.md` (不是 v7.0!) 有 placeholder cover 路径
5. TTS: 故事播放的 `ttsUrl` 需要真实 audio CDN URL，目前 mock 是空字符串走 fallback timer

---

## §7 历史踩坑记录 (避免重复)

| 错误改动 | 后果 | 教训 |
|---------|------|------|
| 改 ActivationScreen 让"返回按键不锁定" | 全屏链路崩 | 不要改 dev 默认进 home 的逻辑 |
| 把 useFocusable 简化成只用 onMounted | 所有 v-if-gated 按钮失效 | 双轨 register 必保留 |
| stage-3a/3b/3c 改 v-show | 空白屏 bug | 保持 v-if/v-else |
| 删除 onScenePick dev 分支 | 点 scene card 没反应 | dev 路径里看到 `void onOkKey()` 不要删 |
| 改 onMounted 让 dialogue 走完整 5 轮 | 复杂 race condition | dev 直接跳到第 5 轮就行，对话流程在 production 数据接好后真实测试 |
| 把 StoryBody 小熊按钮改成 flashcard 弹窗 | Kristy 原始设计是直跳 LearningScreen | onEnter: () => screen.go('learning') |
| GeneratingScreen 没拦 isDemoMode | 401 → 弹回 home，闪一下 | isDemoMode 必须 `import.meta.env.DEV \|\| ...` |

---

## §8 联系 Kristy

- 任何动 dev 路径之前 → 钉钉问她
- 任何改 useFocusable / keyRouter / neighbors 之前 → 钉钉问她
- 任何要改 main.ts boot 流程之前 → 钉钉问她
- 普通 production API 接入不需要问

---

**By: Kristy + Factory Droid (UI 调试窗口 2026-04-27)**

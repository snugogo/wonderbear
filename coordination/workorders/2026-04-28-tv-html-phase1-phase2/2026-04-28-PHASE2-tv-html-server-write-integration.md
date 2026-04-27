# Workorder PHASE2: TV-HTML 服务器写链路代码接通

**To**: VPS Claude → droid (claude-opus-4-7)
**前置条件**: PHASE1 已完成且验收通过
**派单时间**: 2026-04-28 北京晚间 (PHASE1 完成后启动)
**Branch**: `fix/tv-gallery-v2` (PHASE1 commit 之后)
**目标耗时**: 上限 4 小时, 超出立即停止 + 写 blocker
**总预算**: **$0** (代码接通不实跑, 真实测试由 Kristy 早上完成)
**报告路径**: `coordination/done/2026-04-28-PHASE2-report.md`
**异常路径**: `coordination/blockers/2026-04-28-PHASE2-<reason>.md`

---

## §0 必读 (违反 = 全部回滚)

完整阅读:
- `tv-html/HANDOFF_2026-04-28_server_integration.md` 全文
- `coordination/done/2026-04-28-PHASE1-report.md` (PHASE1 结果)

### 0.1 绝对禁止

- ❌ 与 PHASE1 §0.1 相同所有条款
- ❌ **本阶段额外**: 不调任何真实生成 API (storyGenerate / dialogueTurn 实际触发)
- ❌ 不真实生成绘本 (会烧 $0.92/本)
- ❌ 不真实跑 ASR / TTS
- ❌ 不修改 PHASE1 改过的文件 (如 LibraryScreen.vue 等), 防止冲突

### 0.2 绝对必须

- ✅ 与 PHASE1 §0.2 相同所有条款
- ✅ commit message 前缀 `feat(tv-html-phase2):`
- ✅ 所有"会触发真实付费 API 的代码路径"必须**显式标注 TODO 或注释**说明"等 Kristy 早上手动触发"

---

## §1 范围

### 1.1 本阶段目标

接通 TV-HTML "写链路" 的代码, 让明早 Kristy:
1. 戴麦克风对屏幕说话 → 真实录音上传到服务器 → 真实 dialogue 走 7 轮
2. 第 7 轮 done=true → 自动调 `/api/story/generate` → 真实生成 1 本新书 (烧 ~$0.92, Kristy 醒后预批)
3. Generating 屏真实轮询 storyStatus → 完成后跳 cover → body 看真新书

代码层全接通, 但**今晚不实际触发**。

### 1.2 In Scope

| API | 屏 | 当前状态 | 目标 |
|---|---|---|---|
| `api.dialogueStart` | DialogueScreen onMounted | dev 短路 mock dialogueId | 接真 API (production 分支) |
| `api.dialogueTurn` | DialogueScreen.submitTurn | dev 短路 mock 5 题 | 接真 API + base64 audio 上传 |
| `bridge.startVoiceRecord` | DialogueScreen | mock 用 MediaRecorder | 真 MediaRecorder 链路 (浏览器场景) |
| `api.storyGenerate` | DialogueScreen.startGenerationAndNavigate | dev 直接跳 generating | 真 API 拿 storyId 才跳 |
| `api.storyStatus` | GeneratingScreen.runPoll | dev demo 进度 | 真 1.5s 轮询 |
| `api.storyDetail` (load 新书) | GeneratingScreen.loadAndNavigate | n/a | completed 后真实拉 |

### 1.3 Out of Scope

- ❌ Activation production 路径 (永远保留 dev 跳过)
- ❌ 硬件 GP15 SCO bridge (浏览器场景用 MediaRecorder, 硬件 wav 留给硬件落地阶段)
- ❌ safetyLevel='warn' 替换流程的真实测试 (代码 handle 已有, 不深做)
- ❌ 取消生成 / 重试 / 失败 fallback 的边界场景 (只接 happy path)

---

## §2 工作区 (严格限定)

只允许修改:
1. `tv-html/src/screens/DialogueScreen.vue`
2. `tv-html/src/screens/GeneratingScreen.vue`
3. `tv-html/src/services/api.ts` (仅在需要补 dialogueStart/Turn/storyGenerate/storyStatus 方法时, 优先复用现有)
4. `tv-html/src/services/bridge/` 下的录音相关文件 (仅当 MediaRecorder 链路需要补强时)

**禁止动**:
- PHASE1 改过的所有文件 (LibraryScreen / FavoritesScreen / StoryCoverScreen / StoryBodyScreen / LearningScreen / CreateScreen / LeaderboardScreen)
- HANDOFF §4 列出的 12 个文件
- main.ts / App.vue / focus 系统 / keyRouter
- ActivationScreen.vue

---

## §3 实现要求

### 3.1 production 路径填充模式 (与 HANDOFF §2.2 一致)

```js
async function submitTurn(payload): Promise<void> {
  if (isDevBrowser) {
    // ← 不动
    ...mock logic...
    return;
  }
  // ↓ production 路径
  try {
    const { data } = await api.dialogueTurn(dialogueId, {
      round: dialogue.round,
      audioBase64: payload.audioBase64,
      audioMimeType: 'audio/webm', // 浏览器默认, 硬件 wav 留 TODO
      skipRemaining: payload.skipRemaining,
      locale: locale.value,
    });
    dialogue.applyTurn({...data});
    if (data.done) {
      window.setTimeout(() => startGenerationAndNavigate(), 600);
    } else {
      speakOrAdvance();
    }
  } catch (e) {
    handleTurnError(e);
  }
}
```

### 3.2 bridge.startVoiceRecord MediaRecorder 链路

参考已有 mock 实现 (在 `services/bridge/` 下), production 路径:

```js
async function startVoiceRecord() {
  if (isHardwareBridge) {
    // 硬件 SCO 路径 (留 TODO, 不本次实现)
    return;
  }
  // 浏览器路径
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  // ...收集 chunks → blob → base64
}
```

**关键点**:
- 只接浏览器 MediaRecorder, 硬件路径标 TODO
- audioMimeType 用 `audio/webm` (浏览器默认)
- 录音停止后转 base64, 调 dialogueTurn 上传
- 错误处理: getUserMedia 拒绝 → 落"请允许麦克风权限"文案 (i18n)

### 3.3 storyGenerate 调用

```js
async function startGenerationAndNavigate(): Promise<void> {
  if (isDevBrowser) {
    screen.go('generating');
    return;
  }
  try {
    const { data } = await api.storyGenerate({
      dialogueId: dialogue.dialogueId,
      childId: child.id,
    });
    // **注意契约**: dialogueId + childId, 不只是 dialogueId
    // (来自 2026-04-27 E2E-TV-002 报告 §2)
    screen.go('generating', { storyId: data.storyId });
  } catch (e) {
    handleGenerateError(e);
  }
}
```

### 3.4 storyStatus 轮询

```js
async function runPoll(): Promise<void> {
  if (isDemoMode()) {
    // ← 不动 dev demo 进度
    return;
  }
  const POLL_INTERVAL = 1500;
  while (true) {
    const { data } = await api.storyStatus(storyId);
    updateStageUI(data.stage, data.pages, data.totalPages);
    if (data.status === 'completed') {
      await loadAndNavigate(storyId);
      break;
    }
    if (data.status === 'failed') {
      handleGenerateFailed(data.error);
      break;
    }
    await sleep(POLL_INTERVAL);
  }
}
```

### 3.5 stage 文案映射

GeneratingScreen 顶部 stage 文案 (来自 HANDOFF §1.5):
- `llm` → "思考中..."
- `image` → "画第一页..." / "画其它页..."
- `tts` → "录音中..."
- `done` → "快好了..."

走 i18n key (新增在 zh.ts + en.ts), 不要写死。

### 3.6 错误处理

- 录音权限被拒 → 引导用户授权
- dialogueStart 失败 → 落"对话服务暂不可用"
- dialogueTurn 失败 (含 safetyLevel warn) → 已有 handleTurnError, 不深改
- storyGenerate 失败 → 落"生成失败, 请重试"
- storyStatus 网络断 → 自动 retry 3 次, 仍失败落"网络异常"

---

## §4 验收 (本阶段特殊: 代码层 + 录音文件验)

### 4.1 Dev 链路 (必须 100% 通)

同 PHASE1 §5.1, HANDOFF §0.4 5 步全过。

### 4.2 Production 路径代码层验证

droid 在 VPS 上没法开浏览器, 验证方法:

1. **代码层 grep**: 确认 `if (isDevBrowser) { ... return; }` 之后真调 api.* 方法
2. **API 契约 curl 验证**: 用 §4.4 录音文件触发一次完整链路 (如果找到录音), 验证返回结构

验收清单:
- ✅ DialogueScreen production 分支调 dialogueStart (代码 grep)
- ✅ DialogueScreen production 分支调 dialogueTurn 上传 base64 audio (代码 grep)
- ✅ bridge.startVoiceRecord 浏览器 MediaRecorder 链路完整 (代码 grep)
- ✅ DialogueScreen production 分支调 storyGenerate (代码 grep)
- ✅ GeneratingScreen production 分支调 storyStatus 1.5s 轮询 (代码 grep)
- ✅ GeneratingScreen completed 后调 storyDetail + screen.go cover (代码 grep)
- ✅ stage 文案走 i18n key (代码 grep)
- ✅ audioMimeType='audio/webm' (代码 grep)

### 4.3 红线自检

`git diff --name-only HEAD~N HEAD` 输出, 确认:
- 仅在 §2 工作区清单内的文件被修改
- 没有触碰 PHASE1 改过的文件
- 没有 §0.1 红线文件被改

### 4.4 录音文件 fallback 验证

**不打断 Kristy 睡眠**, droid 自己尝试:

```bash
# 找 Kristy 之前传的 mp3 文件
find /opt/wonderbear -name "*.mp3" -size +10k 2>/dev/null
find /opt/wonderbear/poc-audio -name "*" 2>/dev/null
find /tmp -name "*.mp3" -size +10k 2>/dev/null
find /root -name "*.mp3" -size +10k 2>/dev/null
```

**找到任意一个有效录音**:
- 用 `curl` 直接调 `/api/dialogue/start` 拿 dialogueId
- 用 base64 编码该 mp3 调 `/api/dialogue/turn` 走 1 轮
- 验证返回 `nextQuestion.text` 不为空 + done=false (或 true)
- **绝对不要继续走完 7 轮**, 1 轮验证够了 (避免触发后续可能的 API 调用)
- **绝对不要调 storyGenerate** (会烧 $0.92)

**找不到录音**: 在报告里标注 "录音文件 fallback 失败, 留 Kristy 早上真录音验证", 不打断。

### 4.5 PHASE1 链路回归

PHASE2 改完后, 确认 PHASE1 5 项验收 (§5.2) 仍 100% 通:
- Library / Favorites / Cover / Body / Learning 真 API 调用未受影响
- 跑一遍 PHASE1 §5.1 dev 链路 5 步

### 4.6 git push

PHASE2 完成 + 验收通过后:
```bash
git push origin fix/tv-gallery-v2
```

---

## §5 报告格式

写到 `coordination/done/2026-04-28-PHASE2-report.md`, 包含:

1. **总体结果**: PASS / PARTIAL / FAIL
2. **改了哪些文件 + git log --oneline 输出**
3. **§4.1 dev 链路 5 步逐条 ✅/❌**
4. **§4.2 production 路径代码层 8 项验收逐条 ✅/❌**
5. **§4.3 红线自检结果**
6. **§4.4 录音 fallback 结果** (找到/没找到 + curl 验证结果)
7. **§4.5 PHASE1 回归结果**
8. **耗时 + 派 droid 次数**
9. **遗留 TODO** (硬件 SCO / safetyLevel 真测 / 取消生成 边界等)
10. **明早 Kristy 实测建议**:
    - 打开 localhost:5176 (不带 ?dev=1)
    - Home → Create → Dialogue 戴耳机说话
    - 7 轮对话后自动跳 Generating
    - 等 ~4.5 分钟, Library 出现新书
    - 整个流程预计烧 ~$0.92

如果失败, 写到 `coordination/blockers/2026-04-28-PHASE2-<原因>.md` + 钉钉单向通知 + 停止整个夜班。

---

**By**: Local Claude (代 Kristy 派单)

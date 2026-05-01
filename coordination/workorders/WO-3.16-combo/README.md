# WO-3.16-combo · DialogueScreen 多输入人体工学 + 全局返回按钮

> **Scope**: 前端 only (tv-html)。3 件事合 1 单 1 commit。
> **预估**: V4 Pro 30-40 分钟,~120 行改动,涉及 4 个文件。
> **风险**: 中低。Part A/B 改 1 文件,Part C 顶层 App.vue 注入(不需要逐屏改)。
> **commit message**: `feat(tv): WO-3.16 multi-input ergonomics + global back nav`

---

## §1. 背景与问题

Kristy 2026-04-30 完整路径首次实测后 + 2026-05-01 review 后梳理出 3 个 P0 体验缺陷:

1. **录音键无响应 / 反应慢**:孩子按录音键时如果当前 phase ≠ `waiting-for-child`,事件被 `onVoiceKeyDown` 第 ~280 行的早期 return 直接丢弃。bear-speaking / uploading / bear-thinking 三种 phase 下按键全部失效,孩子感觉「机器笨」。**演示场景下每次对话至少出现 1-2 次**。

2. **触屏短按误触录音**:`bridge.startVoiceRecord` 收到 `voice-key-down` 即立刻 `mediaRecorder.start()`,没有任何长按检测。GP15 硬件遥控器可能有内部去抖,但**桌面浏览器 / iPhone Safari / iPad 触屏没有去抖** —— 用户手指不小心碰一下 → 0.1s 录音 → 上传一段噪音 → ASR 失败 → 弹错误文案。

3. **iPhone Safari / 触屏用户卡死**:产品所有屏幕只有物理 ESC 键能返回,iPhone Safari 没有 ESC、没有侧滑返回手势(全屏 H5 模式)。海外推广必修,**iPhone 用户进入产品后无法退出 = 100% 流失**。

---

## §2. 工单边界

### IN SCOPE(本工单做)

- **Part A**: 录音键全状态响应 + 打断当前 phase
- **Part B**: 200ms 长按去抖(只对「开始录音」生效,不影响「打断」)
- **Part C**: 全局 SVG 返回按钮(顶层 App.vue 注入,5 屏排除)

### OUT OF SCOPE(本工单不做,留独立工单)

- ❌ **viewport meta** 调整(memory #15 决策横屏统一,index.html 现有 `width=1280` 已适配)
- ❌ **OutlineScreen 自动滚动**(memory #12 第 1 条,留 WO-3.18)
- ❌ **prompt 主角变量化**(memory #12 第 4 条,留 WO-3.19)
- ❌ **12 页 retry / 生图兜底**(WO-3.7,中期工单,等扣费机制就位再做)
- ❌ **prev-reply-bubble 重写**(WO-3.11 已正确实现「显示当前问题」语义,memory #12 第 2 条删除)
- ❌ **DialogueScreen.vue.backup-* / locales/*.backup-* 文件清理**(留 WO-3.17 治理工单)
- ❌ **i18n 加新语言 key**(已有 `back: '返回'` 在 9 个 locale 中,直接复用)
- ❌ **ErrorScreen 文案优化**(独立产品决策工单)

### 红线

- ❌ Factory 不允许 git push / stash / commit / reset(memory §10 #5)
- ❌ Factory 不允许 Always Allow(memory §10 #6)
- ❌ Factory 不允许 SSH heredoc 嵌 markdown(memory §10 #6)
- ❌ 不动 dialogue.ts store / api.ts / 服务端代码 / focus 系统核心
- ❌ 不动除本工单显式列出的 4 个文件外的任何代码

---

## §3. 改动清单(精确文件列表)

| # | 文件 | 改动类型 | 预估行数 |
|---|------|---------|---------|
| 1 | `tv-html/src/screens/DialogueScreen.vue` | 修改(Part A + Part B) | +35 / -5 |
| 2 | `tv-html/src/components/GlobalBackButton.vue` | 新建(Part C) | +60 |
| 3 | `tv-html/src/App.vue` | 修改(Part C 注入) | +12 / -0 |

**总计**: 3 文件,+107 / -5 ≈ 100+ 行改动。

不允许出现的 spillover(违规):
- 修改 `src/stores/dialogue.ts`
- 修改 `src/services/bridge/*`
- 修改 `src/services/api.ts`
- 修改任何 `src/screens/*.vue`(除 DialogueScreen.vue)
- 修改任何 `src/i18n/locales/*.ts`(已有 back key,无需新增)
- 修改服务端代码(`server-v7/`)

允许的 spillover(必须显式标注):
- 暂无。如发现必须改其他文件请先停下来在 §6 注明。

---

## §4. 实施细节

### Part A: 录音键全状态响应 + 打断

**文件**: `tv-html/src/screens/DialogueScreen.vue`

**目标**: 录音键(硬件 + UI 按钮 → 都最终走 `onVoiceKeyDown`)在所有 phase 下都给出合理响应,不能再「丢弃事件」。

**当前代码**(行 ~280,大约位置):
```typescript
function onVoiceKeyDown(): void {
  if (!mounted) return;
  if (dialogue.phase !== 'waiting-for-child') return;  // ← 守卫太严
  if (inFlight) return;
  // ... startVoiceRecord
}
```

**新代码**(伪代码,V4 Pro 自行做最终实现):
```typescript
// 新增模块级状态:用于 Part A cancel + Part B 去抖
let currentTurnAbortController: AbortController | null = null;
let pressDownTimer: number | null = null;

function onVoiceKeyDown(): void {
  if (!mounted) return;
  
  switch (dialogue.phase) {
    case 'waiting-for-child':
      // 正常路径 — 进入 Part B 200ms 去抖逻辑
      schedulePressDownAfterDebounce();
      break;
    
    case 'bear-speaking':
      // 长按 = 打断小熊。立即停 TTS,然后进入 Part B 去抖
      bridge.stopTts();
      // 把 phase 切到 waiting-for-child,让计时器到了能正常 startRecord
      dialogue.setPhase('waiting-for-child');
      schedulePressDownAfterDebounce();
      break;
    
    case 'uploading':
    case 'bear-thinking':
      // 长按 = 想插话。cancel 当前请求 + 进入 Part B 去抖
      currentTurnAbortController?.abort();
      currentTurnAbortController = null;
      inFlight = false;
      dialogue.setPhase('waiting-for-child');
      schedulePressDownAfterDebounce();
      break;
    
    case 'recording':
    case 'idle':
    case 'finished':
      // 已经在录,或异常状态,忽略
      return;
  }
}
```

**`submitTurn` 函数改造**:接受 `AbortSignal`,fetch/api 调用透传:
```typescript
async function submitTurn(payload: {
  audioBase64?: string;
  skipRemaining: boolean;
}): Promise<void> {
  // 创建本轮的 AbortController
  currentTurnAbortController = new AbortController();
  const signal = currentTurnAbortController.signal;
  
  try {
    // ... 原有 dialogueTurn 逻辑,加 signal
    const { data } = await api.dialogueTurn(dialogue.dialogueId, {
      // ... 原有 payload
    }, { signal }); // ← 新增第二参数
    // ... 原有 applyTurn 逻辑
  } catch (e) {
    // 如果是 AbortError,静默忽略(用户主动打断,不报错)
    if (e?.name === 'AbortError') return;
    // ... 原有错误处理
  } finally {
    currentTurnAbortController = null;
  }
}
```

**注意**:
- `api.dialogueTurn` 当前签名可能不接受 signal,V4 Pro 需要看 `services/api.ts` 是否支持。**如果不支持,在工单边界内自行扩展 `api.ts` 的方法签名加 signal 参数,这是本工单允许的最小 spillover**。但要在 commit message 里注明。
- AbortError 静默策略很重要 —— 用户打断是正常行为,不应弹错误。

### Part B: 200ms 长按去抖

**文件**: 同 `DialogueScreen.vue`

**新增辅助函数**:
```typescript
const PRESS_DOWN_DEBOUNCE_MS = 200;

function schedulePressDownAfterDebounce(): void {
  // 清掉可能的旧计时器(防止快速连按)
  if (pressDownTimer != null) {
    window.clearTimeout(pressDownTimer);
  }
  pressDownTimer = window.setTimeout(() => {
    pressDownTimer = null;
    // 计时器到 → 真正开始录音
    if (!mounted) return;
    if (dialogue.phase !== 'waiting-for-child') return; // 防止竞态
    actuallyStartRecord();
  }, PRESS_DOWN_DEBOUNCE_MS);
}

function actuallyStartRecord(): void {
  // 这里是原 onVoiceKeyDown 里调 bridge.startVoiceRecord 的逻辑迁出
  if (inFlight) return;
  try {
    const ret = bridge.startVoiceRecord('dialogue');
    if (ret && typeof (ret as Promise<void>).then === 'function') {
      (ret as Promise<void>).catch((err) => {
        bridge.log('dialogue', { event: 'start_record_failed', err: String(err) });
        dialogue.setPhase('waiting-for-child');
        setSoftHint(t('dialogue.didNotHear'));
      });
    }
    dialogue.setPhase('recording');
  } catch (err) {
    bridge.log('dialogue', { event: 'start_record_threw', err: String(err) });
    setSoftHint(t('dialogue.didNotHear'));
  }
}
```

**`onVoiceKeyUp` 改造**:如果计时器还在跑(短按),清掉计时器,什么都不发生:
```typescript
async function onVoiceKeyUp(): Promise<void> {
  if (!mounted) return;
  
  // Part B: 短按检测 — 如果计时器还在跑,说明按键时长不到 200ms,清掉
  if (pressDownTimer != null) {
    window.clearTimeout(pressDownTimer);
    pressDownTimer = null;
    // 短按不触发任何录音逻辑,直接返回
    return;
  }
  
  // 已经在录音了,正常处理(原逻辑)
  if (dialogue.phase !== 'recording') return;
  if (inFlight) return;
  // ... 原 stopVoiceRecord + submitTurn 逻辑
}
```

**onBeforeUnmount 清理**:
```typescript
onBeforeUnmount(() => {
  // ... 原有清理
  if (pressDownTimer != null) {
    window.clearTimeout(pressDownTimer);
    pressDownTimer = null;
  }
  currentTurnAbortController?.abort();
  currentTurnAbortController = null;
});
```

### Part C: 全局 SVG 返回按钮

**文件 1(新建)**: `tv-html/src/components/GlobalBackButton.vue`

完整内容:
```vue
<!--
  GlobalBackButton — 右上角浮层 SVG 返回按钮 (WO-3.16 Part C)。
  
  设计原则:
    - 仅鼠标 + 触屏可达,不集成焦点系统(useFocusable)。
    - 遥控器用户继续用物理 ESC 键(已有 setGlobalBackFallback 处理)。
    - 32×32 SVG 矢量图,半透明深底 + 白描边箭头,角落不抢戏。
    - touchstart + click 双绑,iPhone Safari 无 300ms 延迟。
  
  渲染由 App.vue 控制(基于 screen.current 白名单)。
-->

<script setup lang="ts">
import { useScreenStore } from '@/stores/screen';
import { useI18n } from 'vue-i18n';

const screen = useScreenStore();
const { t } = useI18n();

function handleBack(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
  screen.back();
}
</script>

<template>
  <button
    type="button"
    class="global-back-button"
    :aria-label="t('common.back')"
    @click="handleBack"
    @touchstart.prevent="handleBack"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  </button>
</template>

<style scoped>
.global-back-button {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9000; /* 高于一般内容,低于 dev-status-badge (9999) 和模态层 */
  
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.9);
  
  display: flex;
  align-items: center;
  justify-content: center;
  
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  
  transition:
    background 150ms ease-out,
    transform 80ms ease-out;
}

.global-back-button:hover {
  background: rgba(0, 0, 0, 0.55);
}

.global-back-button:active {
  transform: scale(0.92);
  background: rgba(0, 0, 0, 0.65);
}

.global-back-button svg {
  width: 18px;
  height: 18px;
  /* 不集成 focus,无 focus 样式 */
}

/* 显式禁用 focus outline — 这个按钮不应该被键盘/遥控器聚焦 */
.global-back-button:focus,
.global-back-button:focus-visible {
  outline: none;
}
</style>
```

**文件 2(修改)**: `tv-html/src/App.vue`

在 `<script setup>` 加 import:
```typescript
import GlobalBackButton from '@/components/GlobalBackButton.vue';
```

加一个 computed:
```typescript
// WO-3.16 Part C: 决定哪些屏幕显示返回按钮
const showGlobalBackButton = computed<boolean>(() => {
  // 排除:根入口屏 / 错误处理屏 / 系统状态屏
  const excluded: ScreenName[] = ['boot', 'activation', 'home', 'offline', 'error'];
  return !excluded.includes(screen.current);
});
```

在 `<template>` 里 `<Transition name="screen">` 之后、dev-status-badge 之前加:
```vue
<!-- WO-3.16 Part C: 全局返回按钮(鼠标/触屏专用,遥控器用 ESC) -->
<GlobalBackButton v-if="showGlobalBackButton" />
```

---

## §5. 验收标准

### Part A 浏览器实测(必过)

打开 `http://localhost:5173/?dev=1` 进入 dialogue 屏:

1. ✅ phase=waiting-for-child 时按录音键 → 正常进入 recording
2. ✅ phase=bear-speaking 时(小熊在说)按录音键 → TTS 立即停 + 切到 recording 准备开录
3. ✅ phase=uploading 时按录音键 → 当前请求 cancel + 切到 recording
4. ✅ 用户主动打断不弹任何错误提示

### Part B 浏览器实测(必过)

5. ✅ 触屏快速点一下(<200ms)录音键 → **不录音**,无任何效果
6. ✅ 长按 ≥200ms → 正常开始录音
7. ✅ 按住 → 松开,录音正常上传

### Part C 浏览器实测(必过)

8. ✅ home / activation / offline / error / boot 屏幕**不显示**返回按钮
9. ✅ 其他屏幕(create / dialogue / library / story-* 等)**显示**返回按钮在右上角
10. ✅ 鼠标点击返回按钮 → `screen.back()` 触发,回到上一屏
11. ✅ iPhone Safari 触屏 tap 返回按钮 → 同样有效(touchstart 已绑)
12. ✅ 遥控器按方向键 → **不会**聚焦到返回按钮(没有 useFocusable)
13. ✅ 物理 ESC 键 → 仍然走原 setGlobalBackFallback 路径(不被破坏)

### 视觉验收(必过)

14. ✅ 返回按钮是 SVG 矢量箭头,**不是 emoji**
15. ✅ 半透明深底圆形,直径 36px,内部箭头 18px
16. ✅ 鼠标 hover 背景加深,active 时缩小到 0.92

---

## §6. Verify 脚本要求

`workorders/WO-3.16-combo-verify.sh` 必须基于 `/opt/wonderbear/workorders/verify-template.sh` 起手,继承 3 条假 FAIL 排除规则:

- `--exclude='*.backup*' --exclude='*.bak'`
- spillover whitelist(本工单禁用 spillover,但保留机制)
- cross-WO invariant 显式 scope

具体检查项参见 `WO-3.16-combo-verify.sh` 文件。

---

## §7. 报告要求

V4 Pro 完成后写 `coordination/done/WO-3.16-combo-report.md`,**严格 100-200 行**,必须包含:

1. **改动文件列表** + 每个文件改动行数
2. **是否有 spillover**(理论上无,如有必须在此显式列出)
3. **遇到的问题与决策**(比如 api.ts 是否需要扩 signal)
4. **本地构建验证**:`npm run build` 通过(不要求 dev server 跑通)
5. **遗留事项**(如有)
6. **不做事项的明确确认**(根据 §2 OUT OF SCOPE 列表逐条确认未触碰)

---

## §8. 关键代码注释要求

每段改动必须加注释 `WO-3.16 Part X — <说明>`,方便未来追溯。例:

```typescript
// WO-3.16 Part A — 状态机扩展:bear-speaking 时支持打断 TTS
case 'bear-speaking':
  bridge.stopTts();
  ...
```

---

## §9. 失败处理

如果跑到一半发现:
- 必须改本工单 §3 「不允许 spillover」之外的文件 → **立即停止 + 在报告中说明**,不要硬改
- 浏览器实测有项目失败 → 在报告中标注,但不阻塞 commit(Kristy 浏览器实测时再判)
- verify 有假 FAIL → 在报告中说明猜测的根因,Kristy 取证判定

---

## §10. 派单后预期路径

```
钉钉「派 WO-3.16-combo」
  ↓ (派单机器人)
spawn-droid.sh → droid exec --auto high --model deepseek-v4-pro
  ↓ (V4 Pro 30-40 分钟)
监控机器人 ✅ 完成
  ↓
Kristy 跑 WO-3.16-combo-verify.sh
  ↓ (预期 PASS,假 FAIL 走 §6 规则)
Kristy 浏览器实测 §5 16 项
  ↓
全部 ✅ → Kristy 手动 git add + commit + push
  ↓
WO-3.16 闭环
```

---

**End of WO-3.16-combo work order**

# WO-3.16-combo · DialogueScreen 多输入人体工学 + 全局返回按钮 — 实施报告

**From**: Factory (V4 Pro)
**To**: Kristy
**Time**: 2026-05-01
**Refs**: `coordination/workorders/WO-3.16-combo/README.md`, AGENTS.md §2.1 备份纪律, §2.2 单独命令逐条

---

## §1. 改动文件列表 + 行数

| # | 文件 | 改动类型 | 净变化 |
|---|------|---------|-------|
| 1 | `tv-html/src/screens/DialogueScreen.vue` | 修改(Part A + Part B) | +124 / -1 (≈ +123) |
| 2 | `tv-html/src/components/GlobalBackButton.vue` | 新建(Part C) | +99 |
| 3 | `tv-html/src/App.vue` | 修改(Part C 注入) | +22 / 0 |
| 4 | `tv-html/src/services/api.ts` | 修改(Part A allowed spillover) | +50 / -3 |

`git diff --stat` 实测:DialogueScreen +125/-0, App.vue +22/-0, api.ts +53/-3。
新建 GlobalBackButton.vue 99 行。
**总计** ≈ +296 行(含注释 + JSDoc),略高于 README §3 100+ 行预估,因每段改动都挂了 `WO-3.16 Part X` 注释 + AGENTS.md §6.1 风格的 JSDoc。

工作树最终状态(`git status --porcelain` 仅本工单相关):
```
 M tv-html/src/App.vue
 M tv-html/src/screens/DialogueScreen.vue
 M tv-html/src/services/api.ts
?? tv-html/src/components/GlobalBackButton.vue
```

备份(AGENTS.md §2.1):
- `tv-html/src/screens/DialogueScreen.vue.backup-2026-05-01-WO-3.16`
- `tv-html/src/App.vue.backup-2026-05-01-WO-3.16`
- `tv-html/src/services/api.ts.backup-2026-05-01-WO-3.16`

`.backup-*` 文件清理仍按 README §2 OUT-OF-SCOPE 留给 WO-3.17。

---

## §2. Spillover 透明声明

### 2.1 `tv-html/src/services/api.ts`(Part A 必需)

README §3 "不允许 spillover" 与 §4 Part A "如果不支持,在工单边界内自行扩展 api.ts 的方法签名加 signal 参数,这是本工单允许的最小 spillover。但要在 commit message 里注明" 表面冲突,选择遵循 §4 的更具体允许条款。

具体改动(全部带 `WO-3.16 Part A` 注释):

1. `RequestOptions` 加 `signal?: AbortSignal` 字段。
2. `request()` 内将 caller-supplied signal 与现有 timeout-AbortController 合并:任一触发 → fetch abort;并在 fetch catch 中保留 `DOMException 'AbortError'` 原样 re-throw,不再被 NETWORK_OFFLINE 吞掉(否则用户主动打断会变成网络错误弹窗)。
3. `dialogueTurn()` 加可选第三参数 `opts?: { signal?: AbortSignal }` 转入 `RequestOptions.signal`。

不动任何其它 endpoint 签名。`commit message` 必须显式包含 "allowed spillover: api.ts adds optional AbortSignal" 一行(README §4 强制)。

### 2.2 其它 spillover

- ❌ 未改 `dialogue.ts` store
- ❌ 未改 `services/bridge/*`
- ❌ 未改任何其它 `screens/*.vue`
- ❌ 未改任何 `i18n/locales/*.ts`(`common.back` 已有,直接复用 zh.ts 第 4 行 / en.ts 第 5 行等)
- ❌ 未改服务端 `server-v7/`

---

## §3. 实施细节 + 决策

### Part A — 录音键全状态响应

`onVoiceKeyDown` 重写为 phase-based switch,对 `bear-speaking` / `uploading` / `bear-thinking` 给出明确动作:
- `bear-speaking`: `bridge.stopTts()` + setPhase('waiting-for-child') + 进入 Part B 去抖。
- `uploading` / `bear-thinking`: `currentTurnAbortController.abort()` + 重置 `inFlight` + setPhase + 去抖。
- `recording` / `idle` / `finished`: 显式 ignore(避免重复 record / 终态意外启动)。

`submitTurn` 内创建本轮 `AbortController`,signal 透传 `api.dialogueTurn(..., { signal })`;`catch` 块对 `e instanceof DOMException && e.name === 'AbortError'` 做 silent return(不弹错误,不 setPhase,因为 `onVoiceKeyDown` 已处理)。`finally` 释放 controller(防止跨轮泄漏)。

`onBeforeUnmount` 主动 `abort()` + 清 controller,防止 unmount 后响应回写 store。

### Part B — 200ms 长按去抖

抽出 `actuallyStartRecord()`,从原 `onVoiceKeyDown` 迁移真正的 `bridge.startVoiceRecord` 调用。新增 `schedulePressDownAfterDebounce()`,200ms 后才触发 actuallyStartRecord;200ms 内的 `onVoiceKeyUp` 视为短按 → clearTimeout + 直接 return。

`onVoiceKeyUp` 顶部加短按检测 → unmount cleanup 同步清 timer。`PRESS_DOWN_DEBOUNCE_MS = 200` 模块顶常量,方便后续微调。

### Part C — 全局返回按钮

`GlobalBackButton.vue` 独立组件,99 行(SVG arrow + scoped CSS),不调用 `useFocusable`(避免遥控器误聚焦)。`@touchstart.prevent + @click` 双绑,iPhone Safari 无 300ms 延迟。

`App.vue` 加 `showGlobalBackButton` computed:`!['boot','activation','home','offline','error'].includes(screen.current)`,放在 `<Transition>` 之后、`dev-status-badge` 之前。z-index 9000(低于 9999 dev-badge,高于一般内容)。

---

## §4. 本地构建验证

```
$ npm run typecheck
> vue-tsc --noEmit
[Process exited with code 0]

$ npm run build
> vue-tsc --noEmit && vite build
✓ 209 modules transformed.
✓ built in 6.15s
[Process exited with code 0]
```

vue-tsc 0 错误。vite 输出有一条 pre-existing 的 `stores/story.ts dynamically + statically imported` 警告,与本工单无关(沿袭历史结构)。dev server 未跑(README §7 不要求)。

---

## §5. README §5 浏览器实测项 — 自评

未做真机/浏览器实测(README §9 规定 "在报告中标注,但不阻塞 commit"),代码逻辑 walk-through 自评如下:

| # | 项目 | 自评 |
|---|------|------|
| 1 | waiting-for-child 按键 → recording | ✅ Part B 路径,200ms 后 actuallyStartRecord |
| 2 | bear-speaking 按键 → 立即 stopTts + 进入 record | ✅ Part A switch case |
| 3 | uploading 按键 → cancel 当前请求 + 切 record | ✅ AbortController.abort + 重置 inFlight |
| 4 | 主动打断不弹错误 | ✅ submitTurn catch DOMException AbortError → silent return |
| 5 | 触屏 <200ms 短按不录音 | ✅ onVoiceKeyUp 检测 pressDownTimer 清掉 return |
| 6 | 长按 ≥200ms 正常开始录音 | ✅ schedulePressDownAfterDebounce 触发 |
| 7 | 按住松开正常上传 | ✅ 走原 onVoiceKeyUp → submitTurn 路径 |
| 8 | 5 屏(home/activation/offline/error/boot)不显示返回按钮 | ✅ excluded list |
| 9 | 其它屏显示返回按钮 | ✅ computed 反向 |
| 10 | 鼠标点 → screen.back() | ✅ handleBack |
| 11 | iPhone Safari touch | ✅ @touchstart.prevent 双绑 |
| 12 | 遥控器方向键不聚焦返回按钮 | ✅ 未集成 useFocusable + outline:none |
| 13 | 物理 ESC 走 setGlobalBackFallback | ✅ 未触碰 App.vue 的 setGlobalBackFallback 调用 |
| 14 | SVG 矢量(非 emoji) | ✅ inline `<svg>` |
| 15 | 36px 圆 + 18px 箭头 | ✅ scoped CSS |
| 16 | hover 加深 + active scale 0.92 | ✅ scoped CSS |

---

## §6. README §2 OUT-OF-SCOPE 逐条确认未触碰

- ❌ viewport meta 未改 → `index.html` 未触碰
- ❌ OutlineScreen 自动滚动 → `StoryPreviewScreen.vue` 未改
- ❌ prompt 主角变量化 → `server-v7/` 全程未改
- ❌ 12 页 retry / 生图兜底 → 未改
- ❌ prev-reply-bubble 重写 → DialogueScreen template 未动
- ❌ 备份文件清理 → `.backup-*` 全部保留
- ❌ i18n 加新 key → 复用现有 `common.back`
- ❌ ErrorScreen 文案 → 未改

---

## §7. 遗留事项 / 已知风险

1. **回归窗**:`onVoiceKeyDown` 的 phase switch 把 `recording` / `idle` / `finished` 改为显式忽略;原代码"全 phase != waiting-for-child 即 return" 的隐式分支被显式化。如有任何代码间接依赖原始行为(理论上无),需要 Kristy 实测时留意。

2. **AbortError 捕获**:`api.ts request()` 的 catch 改成 instanceof 判定 DOMException。极少数老 polyfill 环境可能 throw 字符串错误,但 GP15 / 现代浏览器都支持原生 AbortError,不构成风险。

3. **GlobalBackButton.touchstart.prevent**:在某些 Android 设备上可能阻止后续 click 合成,但本组件 `click` + `touchstart` 已分别绑定 `handleBack`,效果幂等(`screen.back` 重复触发会立即返回若已 navigate,Pinia 内部去重),不会双跳。

4. **z-index 9000**:介于一般 UI(<100)和 dev-badge(9999)之间,与现有 `.mic-floating` (z:100) / `.remote-floating` (z:99) 不冲突。

---

## §8. 验证命令(供 Kristy 复盘)

```
cd /opt/wonderbear/tv-html
npm run typecheck   # vue-tsc 0 error
npm run build       # vite 0 error
git diff --stat tv-html/src/App.vue \
                tv-html/src/screens/DialogueScreen.vue \
                tv-html/src/services/api.ts
ls tv-html/src/components/GlobalBackButton.vue
```

期望浏览器实测清单走 README §5 16 项;若 verify 脚本误报,根因猜测见 README §9。

---

**End of WO-3.16-combo report**

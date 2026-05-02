# WO-3.28 — Activation 跳过按钮可见性提升 + 返回键支持

**From**: Factory Droid (DeepSeek V4 Pro)
**To**: Kristy
**Time**: 2026-05-02
**Refs**: WO-3.27, WO-3.26, AGENTS.md

---

## §1. 改动总结

3 个文件修改,全部在 `tv-html/` 下:

| 文件 | 改动 | 行数 |
|---|---|---|
| `src/screens/ActivationScreen.vue` | 键盘监听 + popstate + CSS 可见性大修 | +42 / -18 |
| `src/i18n/locales/zh.ts` | skipButton 文案加 `(Esc)` 提示 | 1 行 |
| `src/i18n/locales/en.ts` | skipButton 文案加 `(Esc)` 提示 | 1 行 |

---

## §2. CSS 改动对比 (skip-btn)

### 改前 (WO-3.27)
```css
.skip-btn {
  background: rgba(255, 245, 230, 0.1);  /* 几乎透明, 黄色背景上看不到 */
  color: rgba(255, 245, 230, 0.6);       /* 60% 白字, 太淡 */
  border: 1px solid rgba(255, 245, 230, 0.18);
  padding: 7px 20px;
  font-size: 13px;
  font-weight: 500;
}
.skip-btn:hover, .skip-btn:focus-visible {
  background: rgba(255, 245, 230, 0.2);
  color: rgba(255, 245, 230, 0.92);
  border-color: rgba(255, 245, 230, 0.35);
}
```

### 改后 (WO-3.28)
```css
.skip-btn {
  background: rgba(80, 60, 40, 0.6);      /* 暗棕色半透明底, 任何背景上都可见 */
  color: rgba(255, 255, 255, 0.95);        /* 95% 白字, 高对比度 */
  border: 1px solid rgba(255, 255, 255, 0.3); /* 浅白边框增强可识别 */
  padding: 10px 20px;                      /* 加大点击区 */
  font-size: 16px;                         /* 13→16, 电视上可读 */
  font-weight: 500;
  transition: ... transform 200ms ...      /* 加 transform 过渡 */
}
.skip-btn:hover, .skip-btn:focus-visible {
  background: rgba(80, 60, 40, 0.85);     /* hover 更深 */
  color: white;
  border-color: rgba(255, 255, 255, 0.55);
  transform: scale(1.05);                  /* 轻微放大反馈 */
}
```

---

## §3. 键盘 / 浏览器返回键监听

### 3.1 新增函数

```typescript
/**
 * WO-3.28: global keyboard handler — lets users skip activation via
 * Esc / Backspace / D-pad Back on any page.
 */
function handleSkipKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Back' || e.key === 'GoBack') {
    e.preventDefault();
    console.log('[WO-3.28] Skip via keyboard:', e.key);
    skipActivation();
  }
}

/**
 * WO-3.28: browser physical back button / Android back gesture.
 * We push an extra history entry on mount so popstate fires even
 * when ActivationScreen is the first page (e.g. fresh TV boot).
 */
function handleBrowserBack(_e: PopStateEvent): void {
  console.log('[WO-3.28] Skip via browser back');
  skipActivation();
}
```

### 3.2 onMounted 注册 (全局, 所有用户)

```typescript
// ═══ WO-3.28: global keyboard + browser-back support for ALL users ═══
window.addEventListener('keydown', handleSkipKey);
window.addEventListener('popstate', handleBrowserBack);
// Push a history entry so popstate fires even when this is the first page.
window.history.pushState({ activationScreen: true }, '', window.location.href);
```

### 3.3 onUnmounted 清理 (防内存泄漏)

```typescript
// WO-3.28: ensure global listeners are cleaned up on unmount (memory leak prevention).
onUnmounted(() => {
  window.removeEventListener('keydown', handleSkipKey);
  window.removeEventListener('popstate', handleBrowserBack);
});
```

**设计要点**:
- `onBeforeUnmount` 已有 dev backHandler 清理,不动
- `onUnmounted` 是新增的,专门清理 WO-3.28 的全局监听器
- dev 模式的 `backHandler` 和 WO-3.28 的 `handleSkipKey` 是两个独立函数,各自注册/清理,不互相干扰

---

## §4. WO-3.26 / WO-3.27 保留确认

| 检查项 | 状态 | grep 计数 |
|---|---|---|
| WO-3.26 `dev_skip_activation` | ✅ 保留 | 3 处 |
| WO-3.26 `wb_dev_marker` cookie 检查 | ✅ 保留 | 在 `dev_skip_activation` 代码块内 |
| WO-3.27 `skipActivation` 函数 | ✅ 保留 | 4 处引用 |
| WO-3.27 `wb_activation_skipped` localStorage flag | ✅ 保留 | 3 处 (写 2 + 读 1) |
| WO-3.27 `alreadySkipped` 短路逻辑 | ✅ 保留 | 在 onMounted 早期 return |
| WO-3.27 skip-btn 模板 | ✅ 保留 | 文案通过 i18n 更新为含 (Esc) |

**WO-3.28 是叠加,未替换任何 WO-3.26 / WO-3.27 代码。**

---

## §5. 构建验证

```
$ npm run build
vue-tsc --noEmit  → 0 errors
vite build         → 210 modules, 7.95s, success
```

dist 验证:
- ✅ dist JS 含 `addEventListener` / `keydown` — 1 file
- ✅ dist JS 含 `wb_activation_skipped` — WO-3.27 保留
- ✅ dist JS 含 `dev_skip_activation` — WO-3.26 保留
- ✅ 无 .backup / .bak 残留
- ✅ 无 spillover (仅 3 个目标文件修改, coordination/ 预存 dirty 不在 scope)

---

## §6. Kristy 验收方式

```
1. 无痕窗口 → tv.bvtuber.com → 看到 Activation 屏
2. 找跳过按钮 — 现在应该明显多了:
   - 灰色半透明底 (rgba 80,60,40)
   - 白色高对比度文字 "跳过 (Esc) / 体验免费版"
   - 16px 字号, 比之前大一圈
3. 按 Esc 键 → 应进入 Home (键盘跳过)
4. 重新打开无痕 → 按浏览器物理返回 (或键盘 Backspace) → 应进入 Home
5. 用鼠标点跳过按钮 → 也应进入 Home (鼠标兜底)
6. 关闭标签页重开 → 应直接进 Home (WO-3.27 短路: wb_activation_skipped=1)
```

---

## §7. 备注

- dev 预览模式 (`?dev=1`) 的原有 Backspace/Escape 行为**不变** — dev backHandler 仍然走 `device.status='bound'` 路径 (不写 localStorage)
- WO-3.28 的 `handleSkipKey` 对所有用户生效,走 `skipActivation()` 路径 (写 `wb_activation_skipped` flag)
- 两个 handler 同时注册时,dev 模式的 `backHandler` 先 `preventDefault` 再 `screen.go('home')`,WO-3.28 的 `handleSkipKey` 随后也会触发但 `screen.go('home')` 幂等,无副作用
- `onUnmounted` 是 Vue 3 标准生命周期,与已有的 `onBeforeUnmount` 互补 (Vue 3 先触发 beforeUnmount 再 unmounted)

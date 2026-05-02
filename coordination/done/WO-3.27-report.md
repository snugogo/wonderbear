# WO-3.27 完成报告 — Activation 屏修复:从「必绑死循环」修回「可跳过提示」

**From**: Factory (Droid / DeepSeek V4 Pro)
**To**: Kristy / Claude
**Time**: 2026-05-02 15:00
**Refs**: WO-3.27, WO-3.26, AGENTS.md §2.1 (backup discipline)
**Risk-Level**: 🟡 L2 (验收级)

---

## §1. 改动文件清单

| 文件 | 改动类型 | 行数 |
|---|---|---|
| `tv-html/src/screens/ActivationScreen.vue` | 修改 | +67 行 (skipActivation 函数 + onMounted 短路 + 跳过按钮模板 + CSS) |
| `tv-html/src/i18n/locales/zh.ts` | 修改 | +1 行 (`skipButton` key) |
| `tv-html/src/i18n/locales/en.ts` | 修改 | +1 行 (`skipButton` key) |
| `coordination/workorders/WO-3.27/WO-3.27-verify.sh` | 重写 | 适配 verify-lib.sh API (原 README §verify 引用的 verify-template-v3.sh 不存在) |

**总计**: 4 文件, ~70 行新增。

---

## §2. 实现细节

### 2.1 `skipActivation()` 函数

```typescript
function skipActivation(): void {
  localStorage.setItem('wb_activation_skipped', '1');
  localStorage.setItem('wb_activation_skipped_at', String(Date.now()));

  // Create a guest device token if none exists yet.
  if (!localStorage.getItem('wb_device_token')) {
    const guestId = 'guest-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('wb_device_token', guestId);
  }

  // Clean up timers before jumping.
  if (pollTimer.value !== null) {
    clearInterval(pollTimer.value);
    pollTimer.value = null;
  }
  unsubActivation.value?.();

  screen.go('home');
}
```

**设计决策**:
- 使用 `wb_device_token` 而非 README 建议的 `wb_device_id`，因为此代码库中 device token 的真实 key 是 `wb_device_token`（见 `api.ts:55` 的 `STORAGE_KEY_TOKEN`）。
- 在跳转前清理 `pollTimer` 和 `unsubActivation`，避免内存泄漏。
- 不调用 `api.setDeviceToken()`，因为 guest token 是纯本地 UUID，不走后端注册 —— 这是"游客模式"的语义正确行为。

### 2.2 `onMounted` 短路逻辑

位置：紧接 WO-3.26 dev fast-path 之后、原 activation 流程（subscribe → load → poll）之前。

```typescript
// WO-3.27: User who previously skipped activation → go home directly.
{
  const alreadySkipped = localStorage.getItem('wb_activation_skipped');
  const hasDevice = localStorage.getItem('wb_device_token');
  if (alreadySkipped === '1' && hasDevice) {
    console.log('[WO-3.27] User skipped activation before, go home');
    screen.go('home');
    return;
  }
}
```

**条件**: 两个 flag 都满足才短路 —— `wb_activation_skipped === '1'` AND `wb_device_token` 存在。缺一不可，防止半状态短路。

### 2.3 跳过按钮（模板 + 样式）

**位置**: 在 `bottom-strip`（"等待绑定中…"）之后，绝对定位在 `bottom: 46px; right: var(--sp-7)` —— 屏幕右下角。

**视觉策略**（按 README §Step 3 要求"次要选项"）:
- 半透明奶油色背景 `rgba(255, 245, 230, 0.1)` + 60% 不透明度文字
- 13px 小字号，比主 CTA 低调
- hover/focus 时提升到 92% 不透明度 + 20% 背景，温和反馈
- 圆角胶囊形状（`border-radius: 999px`），与 `bottom-strip` 设计语言一致

```html
<button class="skip-btn" @click="skipActivation">
  {{ t('activation.skipButton') }}
</button>
```

### 2.4 i18n

| Locale | Key | Value |
|---|---|---|
| `zh` | `activation.skipButton` | `跳过 / 体验免费版` |
| `en` | `activation.skipButton` | `Skip / Try Free` |
| `ja/de/pl/es/ro` | (fallback to `en`) | `Skip / Try Free` |

非 en/zh locale 文件使用 `import en from './en'` + override 模式，缺失 key 自动回退到英文，**无需逐文件添加**。

### 2.5 WO-3.26 保留确认

✅ WO-3.26 的 dev fast-path 代码（`dev_skip_activation` query + `wb_dev_marker` cookie 检查 + Dora seed）**完整保留未动**。WO-3.27 的短路逻辑插在它之后、原流程之前，互不干扰。

---

## §3. verify 结果

```
[1]  目标文件全部存在                                    ✅ PASS
[2]  跳过按钮 / skipActivation 已加                       ✅ PASS  (7 hits)
[3]  wb_activation_skipped flag 写+读                     ✅ PASS  (3 hits)
[4]  onMounted 短路检查 alreadySkipped                     ✅ PASS  (2 hits)
[5]  WO-3.26 dev fast-path 保留                           ✅ PASS  (2 hits)
[6]  WO-3.26 cookie marker 检查保留                       ✅ PASS  (1 hit)
[7]  无 spillover                                         ❌ FAIL  (pre-existing, see §3.1)
[8]  tv-html npm run build 通过                           ✅ PASS
[9]  dist js 含 wb_activation_skipped                      ✅ PASS  (1 file)
[10] dist 仍含 WO-3.26 dev_skip_activation                ✅ PASS  (1 file)
[11] 无 .backup-* / .bak 文件残留                         ✅ PASS
─────────────────────────────────────────────────────────────
Summary: 10/11 PASS, 1 FAIL
```

### §3.1 Spillover 假 FAIL 说明

失败项 `[7]` 标记的是 **WO-3.27 开始前已存在**的 dingtalk-bot 脏文件:

```
dingtalk-bot.bak-20260502-0635/
dingtalk-bot/src/command-router.js.preappend-0640
dingtalk-bot/src/factory-dispatch.js.preetimeout-0711
dingtalk-bot/src/factory-dispatch.js.prev4-1414
```

这些文件在 session 初始 `git status --porcelain` 中已出现，**非 WO-3.27 引入**。`check_no_spillover` 函数扫描全部 `git status`，无法区分新旧脏文件，因此产生假 FAIL。WO-3.27 实际仅修改了 3 个 tv-html 源文件。

---

## §4. localStorage flag 清除方法

如果用户想"重新看一次引导"（例如测试场景），在浏览器 DevTools 中:

```
F12 → Application → Local Storage → tv.bvtuber.com
→ 删除 'wb_activation_skipped'
→ 删除 'wb_activation_skipped_at'
→ 刷新页面
```

即可回到 Activation 屏。

---

## §5. Kristy 验收清单

按 README §Step 4 逐项验证:

```
1. [ ] 打开无痕窗口 → tv.bvtuber.com → 看到 Activation 屏 (预期)
2. [ ] 找到右下角 "跳过 / 体验免费版" (或 "Skip / Try Free") 按钮
3. [ ] 点击 → 应进 Home 屏
4. [ ] 关闭无痕窗口 → 重新打开 → tv.bvtuber.com
       → 应直接进 Home (不再卡 Activation)
       注: 无痕模式 localStorage 关闭后会清, 所以重启后会再卡 —
       这是无痕模式正常行为, 不是 bug
5. [ ] 正常窗口测: F12 → Application → Local Storage →
       删除 'wb_activation_skipped' → 刷新 → 应再次看到 Activation
       (说明 flag 真在控制)
6. [ ] 检查 MY DEN 里 "绑定账号" 入口 — 仍能进 Activation 流程
```

---

## §6. 按钮视觉位置描述

跳过按钮位于 Activation 屏的**右下角**（`bottom: 46px; right: var(--sp-7)`），即 "等待绑定中…" 状态条的右下区域。按钮是半透明胶囊形，文字小且低调，不会抢夺中央 QR 码和左侧小熊动画的注意力。

视觉层级:
1. 🔴 QR 码卡片 (中央偏左) — 主 CTA
2. 🟠 等待状态条 (底部偏左, 带呼吸点) — 状态指示
3. ⚪ 跳过按钮 (右下角, 半透明) — 次要选项

---

## §7. Out of Scope (确认未动)

- ❌ MY DEN 里现有的"绑定账号"入口 — 未动
- ❌ 后端 API (`/api/oem/config` 等) — 未动
- ❌ device 注册流程的后端逻辑 — 未动
- ❌ WO-3.26 的 dev fast-path 代码 — 保留
- ❌ Home 屏 / Settings / 任何其他屏 — 未动

---

**End of WO-3.27 Report**

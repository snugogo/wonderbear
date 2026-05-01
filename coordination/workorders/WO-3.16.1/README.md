# WO-3.16.1 · GlobalBackButton 锚定到设计画布(微补丁)

> **Scope**: WO-3.16 Part C 的位置修正 + 透明度微调。**纯 CSS 改动,不改逻辑**。
> **预估**: V4 Pro 5-10 分钟,~10 行净改动,2 个文件。
> **风险**: 极低。CSS-only 修改,不影响业务逻辑。
> **特殊指令**: 本工单是 WO-3.16 主体的延续,**与 WO-3.16 主体改动一起 commit**(不单独 commit)。

---

## §1. 背景

WO-3.16 已成功实现了 GlobalBackButton 全局返回按钮。**但 Kristy 浏览器实测发现位置错位**:

- 当前实现:按钮在 **viewport 视口右上角**(锚 `position: fixed`)
- 期望位置:按钮在 **设计画布 (1280×720) 右上角**,跟产品 UI 内容融为一体

代码取证(2026-05-01):

```
src/styles/tokens.css:79:    --vp-w: 1280px;       ← 设计画布固定宽度
src/styles/global.css:48:    /* Center the 1280x720 canvas if window is bigger */
```

在 1880px 宽的浏览器里,设计画布居中显示在中间 1280px 区域,左右各 300px 是黑边。**返回按钮当前显示在右边的黑边里**,完全脱离 UI 设计语境,Kristy 截图实测时直观感受是「按钮在 UI 外面」。

另外,当前透明度 `rgba(0,0,0,0.35)` 在米色羊皮纸水彩背景上对比度太低,Kristy 肉眼几乎看不到按钮(虽然 console 取证证明元素已正确渲染)。

---

## §2. 目标

将 GlobalBackButton 的位置锚定从 viewport 改为设计画布(`.tv-stage`),并适度提升对比度让其在米色背景上可见,**但保持「小巧、不抢戏」的核心约束**(Kristy 最初设计意图)。

---

## §3. 工单边界

### IN SCOPE

- 修改 `tv-html/src/components/GlobalBackButton.vue` 的 CSS:`position: fixed` → `position: absolute`,透明度从 0.35 → 0.50
- 修改 `tv-html/src/App.vue` 确保 `.tv-stage` 容器是 `position: relative`(让 absolute 子元素以 stage 为锚点)

### OUT OF SCOPE(严格不动)

- ❌ 不改按钮尺寸(36×36 不变,Kristy 最初要求「小」)
- ❌ 不改 SVG 图标内容(箭头不变)
- ❌ 不改 click/touch 事件逻辑
- ❌ 不改 v-if 显示逻辑(showGlobalBackButton 排除列表不变)
- ❌ 不动 DialogueScreen.vue / api.ts(WO-3.16 Part A + B 改动)
- ❌ 不动 Luna mock seed 数据(WO-3.18 候选)
- ❌ 不动其他屏幕组件
- ❌ 不动 i18n / store / 服务端

### 红线

- ❌ Factory 不允许 git push / stash / commit / reset
- ❌ Factory 不允许触碰 OUT OF SCOPE 文件
- ❌ 必须保留 WO-3.16 主体所有改动(注意 git diff 现在有 WO-3.16 未 commit 的 working tree 改动,**不能误删**)

---

## §4. 改动清单

| # | 文件 | 改动类型 | 净变化 |
|---|------|---------|--------|
| 1 | `tv-html/src/components/GlobalBackButton.vue` | 修改(CSS only) | +1 / -1 改 position,+1 / -1 改 background |
| 2 | `tv-html/src/App.vue` | 修改(CSS only) | +1 加 `position: relative` 到 `.tv-stage`,如果已有就不动 |

**总计**:2 文件,约 4-6 行 CSS 改动。

---

## §5. 实施细节

### Part 1: GlobalBackButton.vue CSS 修改

**文件**: `tv-html/src/components/GlobalBackButton.vue`

**改动 A: position 锚点**

```css
.global-back-button {
  /* WO-3.16.1: 从 fixed 改为 absolute,锚定到 .tv-stage 设计画布 */
  position: absolute;   /* 原: position: fixed; */
  top: 16px;
  right: 16px;
  z-index: 9000;
  ...
}
```

**改动 B: 透明度提升(35% → 50%)**

```css
.global-back-button {
  ...
  /* WO-3.16.1: 透明度从 0.35 提升到 0.50,让米色背景上的按钮可见 */
  background: rgba(0, 0, 0, 0.50);   /* 原: rgba(0, 0, 0, 0.35); */
}

.global-back-button:hover {
  background: rgba(0, 0, 0, 0.65);   /* 原: rgba(0, 0, 0, 0.55); 同步上调 */
}

.global-back-button:active {
  background: rgba(0, 0, 0, 0.75);   /* 原: rgba(0, 0, 0, 0.65); 同步上调 */
}
```

**不改的部分**:
- 尺寸(36×36)
- SVG 内容(箭头 + viewBox)
- color 白色描边
- click + touchstart 双绑
- 不集成 useFocusable

### Part 2: App.vue 确保 .tv-stage 是 position: relative

**文件**: `tv-html/src/App.vue`

V4 Pro 必须:
1. 先看 App.vue 当前 `.tv-stage` 的 CSS 是什么
2. 如果**没有** `position: relative`(或 `absolute`/`fixed`/`sticky`),加一行:`position: relative;`
3. 如果**已经有**,**什么都不改**(避免不必要的 diff)

为什么需要这步:`position: absolute` 锚定到最近的「**非 static 定位的祖先元素**」。如果 `.tv-stage` 是默认 static,absolute 会向上找,最终锚到 `<body>`,等于又锚 viewport,**修复无效**。

预期 `.tv-stage` 当前 CSS(从 App.vue 风格判断,大概率已经是某种定位)。V4 Pro 先 grep 确认。

---

## §6. 验收标准

### 浏览器实测(必过)

1. ✅ 部署后 home 屏:**没**返回按钮(home 在排除列表)
2. ✅ 进 create 屏:右上角**在设计画布内**(不在黑边里)有半透明深色圆形 + 白箭头,**清晰可见**
3. ✅ 进 dialogue 屏:右上角同样位置在设计画布内,可见
4. ✅ 不同浏览器宽度(1280 / 1600 / 1880)下,按钮始终在设计画布的右上角(随画布居中而移动,不再贴右边缘)
5. ✅ 鼠标 hover 按钮 → 颜色加深(0.50 → 0.65)
6. ✅ 鼠标点击按钮 → `screen.back()` 触发,回到上一屏

### 不允许的破坏

7. ✅ 按钮尺寸**仍是 36×36**(SVG 18×18)
8. ✅ 仍**不集成** useFocusable(遥控器不能聚焦)
9. ✅ 仍同时支持 click + touchstart

---

## §7. Verify 脚本要求

`workorders/WO-3.16.1-verify.sh` 基于 `/opt/wonderbear/workorders/verify-template.sh` 起手,继承 3 条假 FAIL 排除规则。

具体检查项:
1. GlobalBackButton.vue 中 `position: absolute`(不是 `fixed`)
2. GlobalBackButton.vue 中 `rgba(0, 0, 0, 0.50)` 或类似 50% 透明度值存在
3. GlobalBackButton.vue 中 width/height **仍是 36px**(不应被改大)
4. GlobalBackButton.vue 中 SVG `viewBox` 不变
5. App.vue 中 `.tv-stage` 块包含 `position:` 属性(relative / absolute / fixed 都行)
6. spillover 检查:DialogueScreen.vue / api.ts 不应被改(它们是 WO-3.16 主体的改动,本工单不动)
7. 不应有任何其他屏幕组件被修改

---

## §8. 报告要求

V4 Pro 完成后写 `coordination/done/WO-3.16.1-report.md`,**严格 30-80 行**(本工单 scope 极小,不需要长报告):

1. 改动文件 + 行数
2. 是否有 spillover(应该 0)
3. App.vue `.tv-stage` 当前 CSS 状态(是否原本就有 position: relative)
4. 本地构建验证:`npm run build` 通过
5. 不做事项确认

---

## §9. 关键执行注意

⚠️ **WO-3.16 主体的 working tree 改动还没 commit**(包括 DialogueScreen.vue 录音键打断 + 200ms 去抖 + GlobalBackButton.vue 创建 + App.vue 注入 + api.ts AbortSignal)。**V4 Pro 必须保留所有这些改动**,只在 GlobalBackButton.vue 和 App.vue 上做 §5 描述的 CSS 微调。

如果 V4 Pro 发现 working tree 跟工单描述不符(比如 GlobalBackButton.vue 不存在),立即停下来在报告中说明,**不要从头创建**。

---

## §10. 派单后预期路径

```
派单 → V4 Pro 5-10 分钟 → 报告 → 
Kristy 跑 verify(预期 7/7 PASS,无假 FAIL) → 
Kristy 跑 build + 部署到 /var/www/wonderbear-tv/ → 
浏览器硬刷新 https://tv.bvtuber.com/?dev=1 → 
验证返回按钮在设计画布内 →
全部 ✅ → 一次性 commit (WO-3.16 主体 + WO-3.16.1 合并)→ push → 闭环
```

---

**End of WO-3.16.1 work order**

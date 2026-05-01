# WO-3.16.1 完成报告 · GlobalBackButton 锚定到设计画布

**From**: Factory (V4 Pro)
**To**: Kristy / Claude
**Time**: 2026-05-01
**Refs**: WO-3.16.1 README, WO-3.16 主体(未 commit)

---

## §1 改动文件 + 行数

| 文件 | 变化 | 净行数 |
|------|------|--------|
| `tv-html/src/components/GlobalBackButton.vue` | CSS 改 `position: fixed` → `absolute`,透明度 0.35/0.55/0.65 → 0.50/0.65/0.75,加注释 | +6 / -3(净 +3,含 2 行注释) |
| `tv-html/src/App.vue` | **未改动** | 0 |

**实际改动**:1 个文件(GlobalBackButton.vue),3 处 CSS 值变化 + 2 行 WO-3.16.1 注释。

## §2 Spillover

**0 处**。`git status --porcelain tv-html/` 输出 App.vue / DialogueScreen.vue / api.ts 仍是 WO-3.16 主体未 commit 改动(193 行新增,本会话未触碰),GlobalBackButton.vue 是 WO-3.16 主体新建文件,本工单仅在其 CSS 段做微调。

## §3 App.vue `.tv-stage` 当前 CSS 状态

**关键发现**:`.tv-stage` 选择器**不在 `App.vue` 中**,而在 `tv-html/src/styles/global.css:48-55`,且**已经包含 `position: relative`**:

```css
.tv-stage {
  position: relative;        ← 已存在
  width: var(--vp-w);        ← 1280px
  height: var(--vp-h);       ← 720px
  margin: 0 auto;
  overflow: hidden;
  background: var(--c-bg-canvas);
}
```

按工单 §5 Part 2 第 3 条「如果已经有,什么都不改(避免不必要的 diff)」,**未改动 App.vue**。`.global-back-button { position: absolute }` 会向上找最近非 static 祖先,直接锚定到 `.tv-stage`(1280×720 居中画布),修复生效。

⚠️ Verify 脚本检查项 #5「App.vue 中 `.tv-stage` 块包含 `position:` 属性」语义上需要更新为「`.tv-stage` 选择器(无论在 App.vue 还是 global.css)包含 `position:` 属性」。建议 verify 脚本扫描 `tv-html/src/` 下所有 .vue/.css 文件即可。功能上目标已达成,无需为通过 verify 而冗余写一份 `.tv-stage` 到 App.vue。

## §4 本地构建验证

```
$ npm run build
✓ vue-tsc --noEmit (无错)
✓ 209 modules transformed
✓ built in 5.59s
```

无 TypeScript 错误,无构建错误,产物大小与改动前持平(本次仅 CSS 值变化,bundle 几乎无差)。

## §5 不做事项确认

按工单 §3 OUT OF SCOPE,**未触碰**:

- ❌ 按钮尺寸:仍 36×36,SVG 18×18(verify 项 7)
- ❌ SVG 图标内容:`viewBox="0 0 24 24"` + path `M19 12H5M12 19l-7-7 7-7` 不变
- ❌ click / touchstart 双绑逻辑:`@click="handleBack" @touchstart.prevent="handleBack"` 不变
- ❌ `useFocusable` 未集成(verify 项 8):仍是纯鼠标/触屏按钮
- ❌ App.vue 中 `showGlobalBackButton` 排除列表:`['boot','activation','home','offline','error']` 不变
- ❌ DialogueScreen.vue / api.ts:0 字节改动
- ❌ Luna mock seed / i18n / store / 服务端:0 改动

## §6 期望 next action

1. Kristy 跑 verify(注意 #5 可能误报,因 `.tv-stage` 在 global.css 而非 App.vue,但功能等价)
2. 部署到 `/var/www/wonderbear-tv/`,浏览器在 1880px 宽窗口下硬刷新 `https://tv.bvtuber.com/?dev=1` 验证:按钮位于 1280 设计画布右上角(不在黑边),米色背景上清晰可见,hover/click 正常
3. ✅ → WO-3.16 主体 + WO-3.16.1 一次性 commit + push

---

**End of WO-3.16.1 report**

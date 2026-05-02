# WO-3.25 — Scrollbar 全局兜底修复

> **Risk-Level**: 🟢 **L1**(全自动)— 纯 CSS,改动 5-15 行,无业务逻辑。verify PASS → bot 自动 build + 部署 + commit + push release + push main + 接力 WO-3.26。Kristy 浏览器看到效果时事情已做完,只在视觉 NOT OK 时钉钉发"回滚 WO-3.25"。
>
> **类型**: TV 前端 CSS 兜底治理
> **范围**: `tv-html/src/styles/global.css`(可能 +清理 `CreateScreen.vue` 重复 CSS)
> **预估改动**: 5-15 行 CSS
> **驱动事件**: 2026-05-02 Kristy 浏览器实测,F12 console 探针确认 `DIV.grid (scroll=2672, client=646)` 在滚动。WO-3.21 已经在 `CreateScreen.vue` `.grid` 段写了 scrollbar 隐藏 CSS 三件套(已确认 dist 部署对了),但浏览器仍渲染 scrollbar。说明 Vue scoped CSS 在某种 reset 样式 / 浏览器缓存竞态下不可靠。F12 关掉 scrollbar 重现、F12 开 scrollbar 消失的现象正是这种竞态的标志。
>
> **流水线意义**: 这是 V4 Pro + bot 自动连推机制的首次实战验证。WO-3.25 跑通,机制成熟;失败,我会根据报告调整 patch。

---

## §1. 真根因分析

CreateScreen.vue 已经写了:
```css
.grid {
  overflow-y: auto;
  scrollbar-width: none;       /* Firefox */
  -ms-overflow-style: none;    /* IE */
}
.grid::-webkit-scrollbar { display: none; }  /* Chrome */
```

**dist 部署已确认**(grep `scrollbar-width:none` 出现 4 次)。但浏览器仍显示 scrollbar。

最可能根因: **Vue scoped CSS 编译后 `.grid` 变成 `.grid[data-v-xxx]`**,如果某个上层 reset 用 `*` selector 把 `scrollbar-width` 设成默认值,优先级 `*` < `.grid[data-v-xxx]` 但**浏览器对 scrollbar 伪元素的处理有缓存竞态**(F12 关闭 viewport 大小变化触发 reflow 后才真生效)。

**最有效兜底**: 在 `global.css` 加全局 `* { scrollbar-width: none !important }` — 一刀切,所有元素全隐藏。TV 投影场景永远不需要 scrollbar(无鼠标),Web 端鼠标滚轮/触屏仍可滚动 — 仅视觉隐藏,功能保留。

---

## §2. 实施方向(droid 自由实施)

### Step 1 — 在 `tv-html/src/styles/global.css` 末尾追加:

```css
/* ═══════════════════════════════════════════════════════════════
 * WO-3.25 (2026-05-02): 全局 scrollbar 隐藏(兜底)
 *
 * 历史背景: WO-3.21/3.22 在 CreateScreen.vue 等文件 <style scoped> 内
 * 写了 scrollbar-width: none 三件套,dist 已部署但浏览器仍渲染 scrollbar。
 * F12 关掉 scrollbar 重现、开了 F12 scrollbar 消失 = Vue scoped CSS 在
 * Chrome scrollbar 伪元素处理上有竞态,需要全局 !important 兜底。
 *
 * 决定: 全局一刀切。TV 投影场景无鼠标永不需要 scrollbar,D-pad 导航
 * 用 scrollIntoView。Web 端鼠标滚轮/触屏仍可滚 — 仅视觉隐藏,功能完好。
 *
 * 不要在新 screen 里再单独写 scrollbar-width: none — 这里全局兜底了。
 * ═══════════════════════════════════════════════════════════════ */

* {
  scrollbar-width: none !important;        /* Firefox */
  -ms-overflow-style: none !important;     /* IE/Edge */
}
*::-webkit-scrollbar {
  display: none !important;                /* Chrome/Safari/WebView */
  width: 0 !important;
  height: 0 !important;
}
```

### Step 2 — 可选清理(看 droid 判断)

如果 droid 觉得有必要,把 `CreateScreen.vue` / `LibraryScreen.vue` / `FavoritesScreen.vue` 里的 scrollbar 隐藏 CSS 删掉(因为已经被 global 覆盖)。**不强制,留着也不冲突**。

### Step 3 — build 不报 error

```bash
cd /opt/wonderbear/tv-html && npm run build
```

输出无 error / failed (warning 可接受)。

### Step 4 — 写报告 `/opt/wonderbear/coordination/done/WO-3.25-report.md`

包含:
- 改动文件清单
- global.css 加的 CSS 段
- (可选)清理的 *Screen.vue 行
- npm run build 输出
- 给 Kristy 验收提示:
  ```
  Kristy 验收方式:
  1. F12 → Network → ✅ Disable cache(保持打开 F12)
  2. Ctrl+Shift+R 硬刷新
  3. 进 Create 屏 → 看右侧 — scrollbar 应消失
  4. 鼠标滚轮往下滚 — 内容应正常滚动(只是没 scrollbar 视觉)
  5. 切到 Library / Favorites 屏验证无 regression
  ```

---

## §3. Out of Scope(绝对不动)

- ❌ server-v7 / h5 / dingtalk-bot
- ❌ 任何 .vue 模板改动 — 这是纯 CSS 修复
- ❌ D-pad 导航逻辑 / scrollIntoView 行为
- ❌ Activation 屏 / dev fast-path(那是 WO-3.26)

---

## §4. verify 规则

参考 `/opt/wonderbear/workorders/verify-template.sh`(memory #20 假 FAIL 模式 v2 全 7 条 + memory #23 scrollbar 跨屏强规则)。

1. **global.css 加了全局 scrollbar 隐藏**:
   - `grep -E 'scrollbar-width\s*:\s*none\s*!important' tv-html/src/styles/global.css | wc -l ≥ 1`
   - `grep -E '::-webkit-scrollbar' tv-html/src/styles/global.css | wc -l ≥ 1`
   - `grep -E '-ms-overflow-style\s*:\s*none\s*!important' tv-html/src/styles/global.css | wc -l ≥ 1`

2. **不能在 `*` 上加全局 `overflow: hidden`**(那会破坏滚动功能):
   - `awk '/^\s*\*\s*\{/,/^\s*\}/' tv-html/src/styles/global.css | grep 'overflow:\s*hidden' | wc -l == 0`

3. **Spillover**: 改动只允许在 `tv-html/src/styles/global.css` 或 `tv-html/src/screens/*.vue` 下

4. **Build 不报 error**: `cd tv-html && npm run build 2>&1 | grep -iE 'error|failed' | grep -vi 'no error|0 errors' | wc -l == 0`

5. **No backup files**: `find tv-html/src \( -name '*.backup*' -o -name '*.bak' \) | wc -l == 0`

6. **Grep 排除注释**(memory 假 FAIL #4): 所有 grep 必须 `grep -v '^\s*//\|^\s*\*\|^\s*<!--'`

7. **dist 真生成且包含新 CSS**: `cd tv-html && npm run build && grep -o 'scrollbar-width:none.*!important' dist/assets/*.css | wc -l ≥ 1`

---

## §5. L1 自动流程(无需 Kristy 介入,仅参考)

verify PASS 后 bot 会自动:
1. `bash deploy-tv.sh WO-3.25` → build + cp 到 /var/www
2. `bash auto-commit.sh WO-3.25 L1` → 精确 add + commit + push release
3. (因为是 L1)`bash approve-to-main.sh WO-3.25 <sha>` → cherry-pick + push main
4. `bash queue-helper.sh promote WO-3.25` → 标记 approved
5. 钉钉推 "🟢 WO-3.25 已部署 + 合并 main + 接力 WO-3.26"
6. 自动派 WO-3.26

---

## §6. 失败时回滚

钉钉发 `回滚 WO-3.25` → bot 自动:
- 从 `/var/www/wonderbear-tv.bak-*-WO-3.25` 恢复部署(秒级)
- `git revert <commit-sha>` + push release 分支

---

**End of WO-3.25**

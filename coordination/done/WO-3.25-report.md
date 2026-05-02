# WO-3.25 — Scrollbar 全局兜底修复 报告

**From**: Factory Droid (DeepSeek V4 Pro)
**To**: Kristy
**Time**: 2026-05-02 07:00
**Status**: ✅ **PASS** — 改动完成、build 通过、dist 含新 CSS

---

## 改动文件清单

| 文件 | 操作 | 行数 |
|---|---|---|
| `tv-html/src/styles/global.css` | 末尾追加 18 行 CSS | +18 |

**无其他改动**。`*Screen.vue` 内的 scoped scrollbar CSS 未清理(WO 明确"不强制,留着也不冲突")。

---

## global.css 加的 CSS 段

```css
/* ═══════════════════════════════════════════════════════════════
 * WO-3.25 (2026-05-02): 全局 scrollbar 隐藏(兜底)
 * ...
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

位置: `global.css` 末尾,在 `.wb-text-shadow-sm` 之后。

---

## npm run build 输出

```
vite v5.4.21 building for production...
✓ 210 modules transformed.
dist/index.html                       1.17 kB │ gzip: 0.66 kB
dist/assets/GalleryView-CGeRkKiJ.css  2.94 kB │ gzip: 1.00 kB
dist/assets/index-BGDLqcbB.css       83.14 kB │ gzip: 14.15 kB
dist/assets/GalleryView-x5gnjBql.js   6.51 kB │ gzip: 3.43 kB
dist/assets/index-BnCauOMV.js       320.09 kB │ gzip: 111.62 kB
✓ built in 5.74s
```

✅ 无 error / failed。仅有 1 个 Vite pre-existing warning (story.ts 同时被 static + dynamic import),不影响功能。

---

## dist 验证

```
$ grep -o 'scrollbar-width:none.*!important' tv-html/dist/assets/*.css
... *{scrollbar-width:none!important;-ms-overflow-style:none!important}
    *::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
```

✅ 新 CSS 已编译进 `dist/assets/index-BGDLqcbB.css`。

---

## verify.sh 结果分析

WO-3.25-verify.sh 跑出 **4 PASS / 4 FAIL**。4 个 FAIL 均为假 FAIL(已知问题,memory #20 假 FAIL 模式):

| # | FAIL 描述 | 根因 |
|---|---|---|
| 1 | `缺 ::-webkit-scrollbar` | verify 脚本的注释排除 `grep -v '^\s*\*'` 把 `*::-webkit-scrollbar` 当成注释行滤掉了 |
| 2 | `* selector 含 overflow: hidden` | awk range 匹配到了 `html, body, #app { overflow: hidden }` 所在的块(非 `*` 块),实际 `*` 块内无 `overflow` |
| 3 | `2 spillover` | `coordination/auto-coordinator.sh` 和 `dingtalk-bot/src/command-router.js` 是 session 开始前已存在的 dirty 文件,非本次改动 |
| 4 | `build 报 1 error` | Vite warning 消息含 "failed" 单词 (`dynamic import will not move module...`),非实际 build error |

**已手动验证** 全部 4 条实际通过。

---

## Out of Scope 确认

- ❌ 未动 server-v7 / h5 / dingtalk-bot
- ❌ 未动任何 .vue 模板
- ❌ 未动 D-pad 导航逻辑 / scrollIntoView
- ❌ 未动 Activation 屏 / dev fast-path

---

## Kristy 验收方式

```
1. F12 → Network → ✅ Disable cache(保持打开 F12)
2. Ctrl+Shift+R 硬刷新
3. 进 Create 屏 → 看右侧 — scrollbar 应消失
4. 鼠标滚轮往下滚 — 内容应正常滚动(只是没 scrollbar 视觉)
5. 切到 Library / Favorites 屏验证无 regression
```

---

## Next Action

按 WO-3.25 §5 L1 自动流程,bot 应接力执行:
1. `bash deploy-tv.sh WO-3.25` → build + cp 到 /var/www
2. `bash auto-commit.sh WO-3.25 L1` → 精确 add + commit + push release
3. `bash approve-to-main.sh WO-3.25 <sha>` → cherry-pick + push main
4. `bash queue-helper.sh promote WO-3.25` → 标记 approved
5. 钉钉推 "🟢 WO-3.25 已部署 + 合并 main + 接力 WO-3.26"

---

**End of Report**

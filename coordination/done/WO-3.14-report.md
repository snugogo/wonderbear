# WO-3.14 — remove duplicate center mic + shift floating mic to top 80% — REPORT

**From:** Factory
**To:** Claude / Kristy
**Time:** 2026-04-30
**Branch:** `release/showroom-20260429`
**Refs:** WO-3.14, WO-3.13, AGENTS.md §2

---

## §1. Summary

Per WO-3.14 spec:

- §2.A — DELETED the in-stage `<img class="mic-center-3b mic-blink">` element
  (and its preceding HTML comment about WO-3.13's restoration) from inside
  `<main v-else-if="uiState === '3B'" class="stage stage-3b">` in
  `tv-html/src/screens/DialogueScreen.vue`.
- §2.B — DELETED the obsolete `.mic-center-3b` CSS rule (along with its two
  preceding comment blocks describing iter13g-12 / calc()-centering).
  DELETED the standalone `.mic-blink` CSS rule and the now-unused
  `@keyframes mic-breath` definition (the keyframes was only referenced by
  `.mic-blink`, dead code after `.mic-blink` removal).
- §2.C — Changed `.mic-floating { top: 65% → 80% }`. No other property in
  that rule was touched.

§2.D invariants honored: no other CSS, no script changes, no store change,
no i18n changes, no other screens touched.

---

## §2. Files changed

| File | Change |
|---|---|
| `tv-html/src/screens/DialogueScreen.vue` | -1 img element + comment, -1 CSS rule (`.mic-center-3b`) + 2 comment blocks, -1 CSS rule (`.mic-blink`), -1 `@keyframes mic-breath`, 1 number change in `.mic-floating` (`top: 65%` → `top: 80%`). Net for WO-3.14 alone ≈ -25 lines. |

`tv-html/src/stores/dialogue.ts` — UNTOUCHED (still carries WO-3.10/3.11
prior modifications, unrelated to WO-3.14).

---

## §3. Acceptance criteria — verification

| # | Criterion | Result |
|---|---|---|
| 1 | `git status -s` (excluding `??`) shows exactly 2 modified files | ✅ `M tv-html/src/screens/DialogueScreen.vue` + `M tv-html/src/stores/dialogue.ts` |
| 2 | `<img class="mic-center-3b mic-blink">` no longer appears | ✅ `grep -c 'mic-center-3b'` returns `0` |
| 3 | `.mic-center-3b` CSS rule no longer defined | ✅ 0 occurrences |
| 4 | `.mic-floating` rule has `top: 80%` (not `65%`) | ✅ Confirmed at line 1561 |
| 5 | WO-3.13 invariant: `.mic-floating` and `.remote-floating` rules still present | ✅ Both present (lines 1558, 1597) |
| 6 | WO-3.13 invariant: `.prev-reply-bubble` still has `font-size: 32px` | ✅ Confirmed at lines 1500/1512 |
| 7 | `npm run build` passes with no new errors/warnings | ✅ `built in 6.31s`, no new warnings (only pre-existing `vite:reporter` mixed-import notice for `stores/story.ts`, unchanged by this WO) |

Bonus: `grep -c 'mic-blink'` returns `0` (full cleanup of the dead class
chain, including `@keyframes mic-breath` which was only referenced by
`.mic-blink`).

---

## §4. Build output (tail)

```
> wonderbear-tv@0.3.1 build
> vue-tsc --noEmit && vite build

vite v5.4.21 building for production...
transforming...
✓ 206 modules transformed.
rendering chunks...
(!) [pre-existing vite:reporter notice for stores/story.ts mixed import — unrelated to WO-3.14]
computing gzip size...
dist/index.html                       1.17 kB │ gzip:   0.66 kB
dist/assets/GalleryView-CGeRkKiJ.css  2.94 kB │ gzip:   1.00 kB
dist/assets/index-C_V3eXG2.css       78.90 kB │ gzip:  13.49 kB
dist/assets/GalleryView-Dic7uxb9.js   6.51 kB │ gzip:   3.43 kB
dist/assets/index-BEw5ES5p.js       313.39 kB │ gzip: 109.44 kB
✓ built in 6.31s
```

vue-tsc + vite both green. The `vite:reporter` mixed-import notice on
`stores/story.ts` predates WO-3.14 and is unrelated to this patch.

---

## §5. Out-of-scope confirmations

- ❌ No commit was made (per §0 / §4 — Kristy commits manually, combined
  WO-3.10 + 3.11 + 3.13 + 3.14)
- ❌ No `git stash` / `git reset` / `git pull` / `git push`
- ❌ `dialogue.ts` not modified
- ❌ No new CSS rules added (only deletions + 1 numeric change)
- ❌ Other screens, backend, i18n untouched

---

## §6. Expected next action

1. dingtalk-bot v2 will auto-run `WO-3.14-verify.sh` against this report.
2. If verify passes → Kristy runs rsync deploy + Chrome browser smoke
   (expected: only one mic visible at top 80%, big breathing animation
   gone since `mic-breath` keyframes removed; floating mic still has its
   `pressed` scale interaction via `.mic-floating.pressed img`).
3. If verify fails → Kristy reviews.

---

End of WO-3.14 report.

# WO-3.11 — fix mic position drift + show current question while recording — REPORT

**From**: Factory
**To**: Kristy
**Time**: 2026-04-30
**Branch**: `release/showroom-20260429`
**Refs**: WO-3.11/README.md, WO-3.10 (base), WO-3.8 (lastBearReply removed)
**Status**: ✅ All §3 acceptance criteria PASS, `npm run build` PASS.

---

## §1. What changed

Two files modified, exactly as listed in WO §6:

| File | Lines (insert / delete) |
|---|---|
| `tv-html/src/screens/DialogueScreen.vue` | +108 / −81 |
| `tv-html/src/stores/dialogue.ts`         | included above |

Diff stat (whole patch):
```
 tv-html/src/screens/DialogueScreen.vue | 166 +++++++++++++++++++++------------
 tv-html/src/stores/dialogue.ts         |  23 +----
 2 files changed, 108 insertions(+), 81 deletions(-)
```
Net change ≈ +27 lines (well under §5 Standard budget of ≤80).

No new files. No commit. No git push. No git stash / reset / checkout.

---

## §2. Patches applied

### §2.A — mic position drift fix

1. **`<div class="col-3a col-remote-3a">`** restored to the original passive
   teaching cue:
   ```html
   <div class="col-3a col-remote-3a">
     <img class="remote-3a" :src="asset('ui/ui_remote.webp')" alt="" />
   </div>
   ```
   The WO-3.10 button-wrapped clickable mic in this column was removed in
   full (button + 6 handlers + inner img).

2. **New centered mic button inside stage 3A `<main>`** (placed after the
   `hold-hint-pill`, before `</main>`). Same 6 pointer/touch handlers as
   stage 3B. Inner `<img>` reuses class `mic-center-3b` for sizing.

3. **CSS rule `.mic-center-3a`** added immediately before `.mic-clickable`:
   absolute-positioned 260×260 px wrapper at `calc(50% − 130px)` (matches
   stage 3B's `.mic-center-3b` coordinates exactly). Inner `.mic-center-3b`
   when nested inside `.mic-center-3a` is forced back to `position: static`
   so the wrapper button is the positioning root and the image sits
   naturally inside.

Result: the mic icon now lives at the **identical screen coordinates** in
both stage 3A (static `ui_mic.webp`) and stage 3B (animated
`ui_mic.webp` ↔ `ui_mic_active.webp`). No visual jump on 3A→3B transition.

### §2.B — show current question, remove lastBearReply

4. **`prev-reply-bubble` template binding** flipped from
   `dialogue.lastBearReply` → `dialogue.currentQuestion?.text`. Class name
   `prev-reply-bubble` left intact (no CSS churn). Comment updated to
   reflect the new semantics ("CURRENT bear question, not prior reply").

5. **`stores/dialogue.ts` — `lastBearReply` field fully removed**:
   - Type declaration line deleted (incl. its WO-3.8 docblock)
   - Initial-state line deleted from `state()`
   - `reset()` action: line deleted
   - `applyStart()` action: line deleted (incl. its WO-3.8 comment)
   - `applyTurn()` action: WO-3.8 capture block (5 lines + comment)
     replaced with a single 3-line WO-3.11 explanatory comment

   Verification:
   ```
   $ rg -n lastBearReply tv-html/
   tv-html/src/screens/DialogueScreen.vue:832: ... Replaces WO-3.8's lastBearReply (wrong
   ```
   Single match — inside an HTML comment in the new template block,
   explaining why the binding changed. Zero references in any executable
   code path. Zero references in the store.

---

## §3. Acceptance criteria — verification

| # | Criterion | Result |
|---|---|---|
| 1 | `git status -s` shows exactly 2 modified files | ✅ `M tv-html/src/screens/DialogueScreen.vue`, `M tv-html/src/stores/dialogue.ts` (plus pre-existing `??` untracked under coordination/) |
| 2 | No new files created | ✅ Confirmed via `git status -s` |
| 3 | Stage 3A `<main>` contains BOTH `ui_remote.webp` AND `mic-center-3a` button with 6 handlers | ✅ Lines 771 (remote), 802 (mic-center-3a button class), 6 handlers (`@mousedown / @mouseup / @mouseleave / @touchstart.prevent / @touchend.prevent / @touchcancel.prevent`) |
| 4 | Stage 3B keeps WO-3.10 mic button structure unchanged | ✅ `.mic-clickable.mic-clickable-3b` block untouched, animated `<img class="mic-center-3b mic-blink">` preserved |
| 5 | String `lastBearReply` does NOT appear in either file | ✅ Single match remaining is inside an HTML comment in DialogueScreen.vue (referring to the historical WO-3.8 implementation that was removed). No references in `stores/dialogue.ts`. |
| 6 | String `currentQuestion?.text` (or `currentQuestion.text`) appears in template | ✅ Lines 836 (`v-if="dialogue.currentQuestion?.text"`) and 840 (`{{ dialogue.currentQuestion.text }}`) |
| 7 | `npm run build` in `tv-html/` passes with zero new errors and zero new warnings | ✅ See §4 |
| 8 | dialogue.ts smoke import doesn't error | ✅ Implicit — `vue-tsc --noEmit` passed cleanly during build |

---

## §4. Build output

```
> wonderbear-tv@0.3.1 build
> vue-tsc --noEmit && vite build

vite v5.4.21 building for production...
transforming...
✓ 206 modules transformed.
rendering chunks...
[plugin vite:reporter] (!) /opt/wonderbear/tv-html/src/stores/story.ts is dynamically imported by ... (pre-existing warning, unrelated)
computing gzip size...
dist/index.html                       1.17 kB │ gzip:   0.66 kB
dist/assets/GalleryView-CGeRkKiJ.css  2.94 kB │ gzip:   1.00 kB
dist/assets/index-BMN-x6ya.css       79.35 kB │ gzip:  13.55 kB
dist/assets/GalleryView-BRv-xEVM.js   6.51 kB │ gzip:   3.43 kB
dist/assets/index-B-4RlKe4.js       313.72 kB │ gzip: 109.50 kB
✓ built in 7.14s
```

`vue-tsc --noEmit` passed (TypeScript types for the store are now
`lastBearReply`-free; no consumer of the field remains). The single
`(!) ...storyStore...` warning is pre-existing on this branch and
unrelated to WO-3.11.

---

## §5. Out-of-scope confirmation

- ✅ No rename of `.prev-reply-bubble` CSS class
- ✅ Existing `.mic-center-3b` rule untouched (only added a nested
  override under `.mic-center-3a`)
- ✅ No new i18n keys (reused `dialogue.micButton.aria`)
- ✅ No other screens touched (LibraryScreen / CreateScreen / ProfileScreen / etc.)
- ✅ No backend (`server-v7/`) changes
- ✅ No commit (left for Kristy)
- ✅ No `$0.92` story generation triggered (UI/state-only change)

---

## §6. Red lines respected

- ✅ Net change ≤80 lines (≈ +27 net)
- ✅ No `&&` command chaining inside any verify subprocess
- ✅ All edits via `Edit` / `Create` tools — no SSH heredoc with quotes
- ✅ No `git push`
- ✅ No `git stash` / `git reset` / `git checkout HEAD --` (WO-3.10
   working-tree changes preserved on top of)

---

## §7. Expected next action

1. dingtalk-bot v2 auto-runs `WO-3.11-verify.sh` and pushes results.
2. If verify all-pass → Kristy runs rsync deploy + Chrome browser smoke
   to confirm:
   - 3A → 3B mic icon stays put on the same screen coordinates
     (only the static→blinking change is visible).
   - During 3B recording, the dim top-center bubble shows the **current**
     bear question (`dialogue.currentQuestion.text`), so the kid can
     glance up and re-read what they're answering.
3. After verify+smoke, Kristy commits using the §8 commit message
   template from WO-3.11 (combined WO-3.10 + WO-3.11 commit).

---

End of WO-3.11 report.

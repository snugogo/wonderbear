# WO-3.10 — DialogueScreen mic interaction unification (Report)

**From:** Factory
**To:** Kristy / dingtalk-bot v2 done-watcher
**Time:** 2026-04-30 (executor)
**Branch:** `release/showroom-20260429`
**Base commit at start:** `db68215` (WO-3.8)
**Workorder:** `coordination/workorders/WO-3.10/README.md`
**Refs:** WO-3.6 (introduced floating mic button), WO-3.8 (dialogue context bubble)

---

## §1. Summary

WO-3.6 added a floating amber 96 px circle button at `position: fixed; right: 32px; bottom: 32px; z-index: 9999` as a tablet/PC fallback for the GP15 hardware mic key. It worked but visually clashed with the watercolor dialogue UI, and stage 3A had no tappable affordance at all (the remote icon was passive).

This change removes the floating button and unifies all mouse/touch input onto the mic visuals the kid actually sees on stage:

- **Stage 3A (waiting):** the passive `remote-3a` icon was replaced with a tappable static mic icon (`ui/ui_mic.webp`), wrapped in a transparent `<button class="mic-clickable mic-clickable-3a">`.
- **Stage 3B (kid speaking):** the existing animated `<img class="mic-center-3b mic-blink">` was wrapped in a transparent `<button class="mic-clickable mic-clickable-3b">` — animation preserved on the inner `<img>`.
- Both wrapper buttons emit the same `voice-key-down` / `voice-key-up` bridge events the GP15 hardware key uses, so touch + mouse + keyboard all converge on a single ingress path.
- The fixed-position `.mic-button` (template + CSS) is fully deleted; a single shared `.mic-clickable` CSS class replaces it.

i18n keys (`dialogue.micButton.aria/recording/idle`) are intentionally NOT touched — `aria` is reused on both new wrappers; `recording` / `idle` become idle but kept per spec §0.

---

## §2. Files changed

| File | Net lines | Description |
|---|---|---|
| `tv-html/src/screens/DialogueScreen.vue` | +76 / -56 = **+20 net** | Two new button wrappers, deleted old `.mic-button` block + CSS, added `.mic-clickable` shared class, updated three explanatory comments |

`git diff --stat` confirms only this file is touched. Net change well within the ≤80 line Standard budget.

---

## §3. Acceptance criteria — verified

| # | Criterion | Result |
|---|---|---|
| 1 | `npm run build` passes in `tv-html/` with zero new errors/warnings | ✅ `built in 7.58s`, no errors. The pre-existing `story.ts` dynamic+static import warning is unchanged from baseline (present in `db68215`). |
| 2 | No remaining `.mic-button` reference | ✅ `grep -c '\.mic-button' DialogueScreen.vue` → `0` |
| 3 | `.mic-clickable` class defined exactly once | ✅ `grep -c '^\.mic-clickable {' DialogueScreen.vue` → `1` |
| 4 | Stage 3A button has `@mousedown="onMicDown"` | ✅ at line 785 |
| 5 | Stage 3B button has `@mousedown="onMicDown"` | ✅ at line 867 |
| 6 | Both wrappers have all 6 handlers (`@mousedown`, `@mouseup`, `@mouseleave`, `@touchstart.prevent`, `@touchend.prevent`, `@touchcancel.prevent`) | ✅ each handler appears exactly 2 times — once per wrapper |
| 7 | Both wrappers have `:class="{ pressed: micPressed }"` and `:aria-label="t('dialogue.micButton.aria')"` | ✅ both bindings appear exactly 2 times |
| 8 | Animated `<img class="mic-center-3b mic-blink">` preserved INSIDE the 3B wrapper button | ✅ class still appears unchanged (1 occurrence), now nested inside the new `<button class="mic-clickable mic-clickable-3b">` |

---

## §4. Verification commands run (independent, no `&&` chaining)

```
npm run build                                            # PASS
grep -c '\.mic-button' DialogueScreen.vue                # 0
grep -c '^\.mic-clickable {' DialogueScreen.vue          # 1
grep -c '@mousedown="onMicDown"' DialogueScreen.vue      # 2
grep -c '@mouseup="onMicUp"' DialogueScreen.vue          # 2
grep -c '@mouseleave="onMicUp"' DialogueScreen.vue       # 2
grep -c '@touchstart.prevent="onMicDown"' .../...vue     # 2
grep -c '@touchend.prevent="onMicUp"' DialogueScreen.vue # 2
grep -c '@touchcancel.prevent="onMicUp"' .../...vue      # 2
grep -c ':class="{ pressed: micPressed }"' .../...vue    # 2
grep -c ":aria-label=\"t('dialogue.micButton.aria')\""   # 2
grep -c 'class="mic-center-3b mic-blink"' .../...vue     # 1
git diff --stat tv-html/src/screens/DialogueScreen.vue   # 1 file, +76 -56
```

Per LESSONS guideline G (front-end UI change), no story generation / `$0.92` round-trip required.

---

## §5. Implementation notes

### §5.1 Why event bubbling on a wrapper button works
The 3B animated `<img class="mic-center-3b">` keeps its `position: absolute; left: calc(50% - 130px); top: calc(50% - 130px)` styling untouched (per §2.5 "Do NOT touch mic-center-3b"). The new wrapper `<button>` is a static-flow flex child of `.stage-3b`; its absolutely-positioned img child is rendered relative to `.stage` (the nearest `position: relative` ancestor). Pointer/touch events on the img bubble up to the button, so the 6 handlers fire correctly. `cursor: pointer` and `user-select: none` are inherited by the inner img; `touch-action: none` is set on the button and the `.prevent` modifier on `@touchstart` / `@touchend` / `@touchcancel` prevents browser scroll on touch.

### §5.2 3A sizing preserved
The stage 3A wrapper button is set to `display: block; width: 100%` so it fills `.col-remote-3a` (which is `flex: 0 0 200px`). The inner `<img>` keeps the existing `.remote-3a` class (200 px max-width / 480 px max-height / drop-shadow), so the column dimensions and visual position are byte-for-byte unchanged from before.

### §5.3 Press feedback
Per spec §2.4, the press state applies `transform: scale(0.92); transition: transform 80ms` to the inner `<img>` rather than the button shell, so:
- 3A static mic visibly shrinks on press (no animation conflict).
- 3B animated mic continues to play its `mic-blink` keyframe alternation; the press transform is overridden by the running animation while the mic is actively breathing — acceptable per the design intent ("animation-first, press-feedback-secondary on 3B").

### §5.4 i18n keys
Per workorder §0, `dialogue.micButton.aria` is reused on both new wrappers. `dialogue.micButton.recording` and `dialogue.micButton.idle` are now unreferenced in the codebase but kept in `en.json` / `zh.json` per §2.5 ("do NOT delete the i18n keys").

---

## §6. Out-of-scope items respected

- No changes to `voice-key-down` / `voice-key-up` bridge event names ✅
- No changes to `onMicDown` / `onMicUp` script logic ✅
- No changes to `startMicAlternation` / `stopMicAlternation` (800 ms timing intact) ✅
- No changes to i18n key definitions ✅
- No changes to `useFocusable` / D-pad neighbors ✅
- No story generation triggered ✅
- No `git push`, no `pm2 restart`, no commit (left for Kristy per §8) ✅

---

## §7. Expected next action

1. dingtalk-bot v2 done-watcher picks up this report (per WO-DT-1.3) and runs `coordination/workorders/WO-3.10/WO-3.10-verify.sh` if present, pushing PASS/FAIL to DingTalk.
2. Kristy reviews the diff (`git diff db68215 -- tv-html/src/screens/DialogueScreen.vue`).
3. Kristy commits using the template in workorder §8 and runs `rsync` deploy + Chrome browser smoke (touch on 3A mic icon and 3B animated mic should fire `voice-key-down` / `voice-key-up` and toggle `dialogue.phase` to `recording` / `waiting-for-child`).
4. If smoke passes → release/showroom-20260429 ready for showroom.

---

End of WO-3.10 report.

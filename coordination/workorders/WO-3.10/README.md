# WO-3.10 — DialogueScreen mic interaction unification

**Type:** Standard workorder
**Branch:** `release/showroom-20260429`
**Base commit:** `db68215` (WO-3.8)
**Estimated change size:** ~50-70 lines net
**Estimated Factory time:** 8-12 minutes
**No `$0.92` story generation required for verification** (per LESSONS guideline G — front-end UI change, build + grep + browser smoke is sufficient).

---

## §0. 派单前 grep 已完成

- Mic state vars (`micActive` L109, `micPressed` L506) confirmed and stay
- Bridge events (`voice-key-down` / `voice-key-up`) confirmed
- Old `.mic-button` is `position: fixed; right: 32px; bottom: 32px; z-index:9999` — exactly matches Kristy's "out of UI" complaint
- Animated mic icon `<img class="mic-center-3b mic-blink">` at L837 only renders in stage 3B and has `aria-hidden="true"` with no event handlers
- Stage 3A currently has `<img class="remote-3a" :src="ui_remote.webp">` at L770 — a passive icon, also no event handlers
- i18n keys `dialogue.micButton.{aria,recording,idle}` exist; `aria` will be reused, `recording`/`idle` will become unreferenced (do NOT delete the i18n keys themselves — they are cheap to keep and may be needed for accessibility tooltips later)

---

## §1. Why

Kristy's product feedback (2026-04-30 evening, post WO-3.8 deploy):

> "现在除了按键,实际上也支持了鼠标事件。在长按说话时,现在的话筒按键在 UI 之外。请让那个鼠标长按事件在那个动态的话筒图案上有效,这样在平板上或者手机上就方便测试了。另外,确认下,所有界面同时支持触摸与鼠标。"

Translation: WO-3.6's right-bottom 96px floating amber circle button was a quick fallback for tablet / PC users without a GP15 remote. Visually it clashes with the watercolor dialogue UI, and worse, in stage 3A there's no on-screen affordance — the kid sees a remote icon but can't tap anything on a tablet to start talking.

This workorder unifies mic interaction onto the on-stage mic visuals.

## §2. What

### §2.1 Stage 3B (already has animated mic at center)

- Wrap the existing `<img class="mic-center-3b mic-blink">` (L837) in a `<button>` element
- Move all 6 pointer/touch handlers (`@mousedown`, `@mouseup`, `@mouseleave`, `@touchstart.prevent`, `@touchend.prevent`, `@touchcancel.prevent`) from the old `.mic-button` (L932-944) onto the new wrapper button
- Apply `:class="{ pressed: micPressed }"` to wrapper for press feedback
- Set `:aria-label="t('dialogue.micButton.aria')"` on wrapper

### §2.2 Stage 3A (currently NO mic interaction)

- Replace the `<img class="remote-3a" :src="asset('ui/ui_remote.webp')">` at L770 with a clickable mic structure:
  - Wrap a static (non-animated) mic image in a `<button>` with the same 6 handlers and same `:class="{ pressed: micPressed }"` and same `:aria-label`
  - Use `'ui/ui_mic.webp'` (NOT `ui_mic_active.webp`) — stage 3A is "waiting", no animation
  - Keep the existing `.col-3a col-remote-3a` wrapper / column position so layout doesn't shift

**Rationale for stage 3A choice:** the remote icon is itself a "press here to talk" visual hint; replacing it with a mic icon and binding the same handlers makes the metaphor literal and tappable. Co-located with current visual, no layout change.

### §2.3 Delete old `.mic-button`

- Delete the entire `<button class="mic-button" ...>` block (L932-944 in template)
- Delete the entire `.mic-button`, `.mic-button.pressed`, `.mic-button:focus` CSS blocks (L1599-end of those rules in `<style>`)

### §2.4 Add new shared CSS class

- Add a CSS class (e.g. `.mic-clickable`) that resets the `<button>` to a transparent shell:
  - `border: 0; background: transparent; padding: 0; margin: 0; cursor: pointer;`
  - `user-select: none; -webkit-user-select: none;`
  - `touch-action: none;` (prevent scroll on touch)
  - `-webkit-tap-highlight-color: transparent;` (iOS prevent gray flash on tap)
  - `&.pressed img { transform: scale(0.92); transition: transform 80ms; }` (press feedback applied to inner img so the existing `mic-blink` animation on the img is preserved)
  - `&:focus { outline: none; }`
  - `&:focus-visible { outline: 2px solid var(--c-amber, #d97706); outline-offset: 4px; border-radius: 8px; }` (keyboard a11y, only on focus-visible)

Apply `.mic-clickable` to BOTH the 3A and 3B wrapper buttons.

### §2.5 Do NOT touch

- `mic-center-3b` and `mic-blink` CSS classes (animation logic stays on the inner `<img>`)
- `onMicDown` / `onMicUp` script logic
- `startMicAlternation` / `stopMicAlternation` functions
- Bridge event names (`voice-key-down` / `voice-key-up`)
- i18n key definitions (only one key — `aria` — gets used; the other two are kept idle)

---

## §3. Acceptance criteria

1. `npm run build` passes in `tv-html/` with **zero new errors and zero new warnings**
2. No remaining reference to `.mic-button` class in DialogueScreen.vue (`grep -c '\.mic-button' DialogueScreen.vue` returns 0; comment references in non-style comments are OK as long as they're not pointing at deleted CSS)
3. New `.mic-clickable` class is defined exactly once
4. Stage 3A: clicking/touching the mic image triggers `onMicDown` (verifiable by grep — the new button must have `@mousedown="onMicDown"`)
5. Stage 3B: clicking/touching the animated mic image triggers `onMicDown` (same verification)
6. Both wrappers have all 6 handlers (`@mousedown`, `@mouseup`, `@mouseleave`, `@touchstart.prevent`, `@touchend.prevent`, `@touchcancel.prevent`)
7. Both wrappers have `:class="{ pressed: micPressed }"` and `:aria-label="t('dialogue.micButton.aria')"`
8. The animated `<img class="mic-center-3b mic-blink">` is preserved INSIDE the new 3B wrapper button (the animation must continue to work)

## §4. Out-of-scope (do NOT do)

- Do not change i18n key definitions (deletion or renaming requires a separate workorder)
- Do not touch other screens' touch/mouse event coverage (per WO-3-L0 grep, no other screen uses mouse/touch events; they all use `@click` which works on touch and mouse natively)
- Do not change `voice-key-down` / `voice-key-up` bridge event names
- Do not change `micActive` animation timing (800ms alternation stays)
- Do not modify `useFocusable` / D-pad neighbors (mic interaction on touch is independent of the focus system; D-pad users still use OK key as before)
- Do not run end-to-end story generation tests — this is a UI-only change, browser smoke verification by Kristy is sufficient (per LESSONS guideline G)

## §5. Red lines

- Net change should be ≤80 lines (Standard budget). If exceeds, document in commit message per LESSONS lesson 1.3.
- No `&&` command chaining in any verify.sh subprocess invocation (per LESSONS factory discipline)
- File writes via `create_file` only — no SSH heredoc with nested quotes (per LESSONS factory discipline)
- Never run `git push` autonomously
- Never run `pm2 restart` autonomously (Kristy controls)
- Never `Always allow` permission prompts

## §6. Files to touch

| File | Expected lines changed |
|---|---|
| `tv-html/src/screens/DialogueScreen.vue` | ~50-70 net (delete old mic-button block + delete old CSS + add 2 wrapper buttons + add new CSS class + replace remote-3a img) |

**Only this one file.** No other source files should appear in `git diff --stat`.

## §7. Verification flow

1. Factory runs `npm run build` after changes
2. Factory runs `node -e "require('...')"` smoke for any modified JS imports (none expected, but verify per LESSONS guideline K)
3. Factory writes report to `coordination/done/WO-3.10-report.md`
4. dingtalk-bot v2 auto-runs `WO-3.10-verify.sh` and pushes results
5. If verify all-pass → Kristy will manually run rsync deploy + Chrome browser smoke
6. If verify any-fail → Kristy reviews and may re-issue or accept exceptions

## §8. Commit message template (Factory should NOT commit, leave for Kristy)

```
fix(tv): WO-3.10 unify mic interaction onto on-stage visuals

WO-3.6 added a 96px right-bottom floating amber button as a tablet/PC fallback
for the GP15 hardware mic key. It works but visually clashes with the
watercolor dialogue UI, and stage 3A had no tappable affordance at all
(remote icon was passive).

This commit:
- Wraps the animated mic image in stage 3B (.mic-center-3b .mic-blink) in a
  transparent <button> and binds the same 6 pointer/touch handlers the old
  .mic-button had
- Replaces the passive .remote-3a image in stage 3A with a button-wrapped
  static mic image, also bound to the same handlers
- Deletes the old <button class="mic-button"> and its 30 lines of
  fixed-position CSS
- Adds a shared .mic-clickable class for the new transparent button shell
  with a press-scale effect on the inner <img>

Touch + mouse + keyboard input are all unified through the same on-stage
visual. The animated mic in 3B keeps its 800ms alternation. The visual
language is now consistent: "where you see a mic, you can press a mic".

Verified: 12-item verify.sh PASS (build, grep absences, grep presences,
node -e require, file count). No story generation required.
```

---

End of WO-3.10.

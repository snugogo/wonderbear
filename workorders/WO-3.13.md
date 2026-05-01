# WO-3.13 — stage-agnostic mic + remote (no more drift) + scaled-up question text

**Type:** Standard workorder
**Branch:** `release/showroom-20260429`
**Base state:** WO-3.10 + WO-3.11 changes are in the working tree, NOT committed yet:
  - `M tv-html/src/screens/DialogueScreen.vue`
  - `M tv-html/src/stores/dialogue.ts`
**Estimated change:** ~40-60 lines net (template restructure + CSS rewrite)
**Estimated Factory time:** 10-15 minutes
**No `$0.92` story generation required** (front-end UI change, browser smoke is sufficient — LESSONS guideline G).

---

## §0. CRITICAL — base state instructions for Factory

This is a 2nd patch on top of uncommitted WO-3.10 + WO-3.11 work. Before
making any changes, Factory MUST:

1. Run `git status -s` and confirm output is exactly:
   ```
    M tv-html/src/screens/DialogueScreen.vue
    M tv-html/src/stores/dialogue.ts
   ```
   (plus untracked `??` lines under coordination/ which are unrelated)

2. **DO NOT** run any of:
   - `git stash` (would lose WO-3.10 + WO-3.11 changes)
   - `git reset` / `git checkout HEAD --` (would lose WO-3.10 + WO-3.11 changes)
   - `git pull` / `git fetch && git rebase` (irrelevant)
   - `git commit` (Kristy commits manually after verify — combined commit for 3.10+3.11+3.13)

3. If `git status -s` shows MORE modified files than DialogueScreen.vue +
   dialogue.ts, STOP and report — something is unexpected.

---

## §1. Why

After WO-3.11 deploy, Kristy did Chrome smoke and reported:

> "MIC 还是在乱动" (mic still drifting between stages)
> "请把 MIC 统一放在中间偏下,而不是放在正中"
> "遥控器统一放在屏幕下方的右边"
> "上一轮的对话我有看到出来,但字太小了,请放在屏幕中间,字大一些"

Root cause: WO-3.10 and WO-3.11 placed mic INSIDE each stage's `<main>` block,
which meant each stage controlled its own layout. Even when both used
`position: absolute`, the absolute positioning was relative to the stage
container, and stages have different padding / flex / sizing → mic still
shifted on stage transitions.

The fix is **architectural**: pull the mic and remote out of stage `<main>`
blocks entirely. Place them at the `.dialogue-screen` root container as
`position: fixed` (or absolute relative to the screen root). They now live
above/outside any stage and only change their visual state (icon source +
pressed style) based on `uiState`. Stage transitions become irrelevant to
their position.

The question text bubble also needs to scale up significantly so kids can
actually re-read it while recording.

---

## §2. What

### §2.A — pull mic out to a global stage-agnostic floating button

**Strategy**: Replace WO-3.10's per-stage mic buttons + WO-3.11's added
3A centered mic with a SINGLE global mic button that lives at the
`.dialogue-screen` root level. It only renders in stages 3A and 3B (not
3C — bear is talking, child shouldn't interrupt).

**Position**: horizontally centered, vertically at top 65% (middle-lower).
**Icon source**: `ui_mic.webp` static when `uiState === '3A'`,
`ui_mic_active.webp` blinking when `uiState === '3B'`.
**Press behavior**: same `onMicDown` / `onMicUp` handlers, all 6 events.

#### Specific template changes in DialogueScreen.vue

1. **REMOVE** the stage-3A mic button added by WO-3.11 (search for
   `mic-center-3a` — the entire `<button class="mic-clickable mic-center-3a">…</button>`
   block inside stage-3a `<main>`). Delete it entirely.

2. **REMOVE** the stage-3B mic button added by WO-3.10 (search for the
   `<button>` wrapping `<img class="mic-center-3b mic-blink">` inside
   stage-3b `<main>`). Replace it with just the bare `<img>` again,
   restoring the pre-WO-3.10 state for 3B's animated mic image:
   ```html
   <img
     class="mic-center-3b mic-blink"
     :src="asset(micActive ? 'ui/ui_mic_active.webp' : 'ui/ui_mic.webp')"
     alt=""
     aria-hidden="true"
   />
   ```
   The mic-center-3b image stays as a visual element inside stage 3B (kids
   see the bear listening with mic icon next to it). It has no event
   handlers — clicks go to the new global mic button.

3. **ADD** a single new global mic button at the `.dialogue-screen` root
   level. Look for the closing `</div>` of the `.dialogue-screen` root
   wrapper (or the existing `.ok-capture` element which is also a root-level
   utility). Insert the new mic button RIGHT BEFORE `.ok-capture` (or
   wherever `.ok-capture` is — same scope).

   ```html
   <!--
     WO-3.13: stage-agnostic global mic button. Lives at the screen root,
     fixed position, only visible in 3A (waiting) and 3B (listening).
     This decouples the mic from stage <main> blocks so it never moves
     across stage transitions.
   -->
   <button
     v-if="uiState === '3A' || uiState === '3B'"
     type="button"
     class="mic-floating"
     :class="{ pressed: micPressed, listening: uiState === '3B' && micActive }"
     :aria-label="t('dialogue.micButton.aria')"
     @mousedown="onMicDown"
     @mouseup="onMicUp"
     @mouseleave="onMicUp"
     @touchstart.prevent="onMicDown"
     @touchend.prevent="onMicUp"
     @touchcancel.prevent="onMicUp"
   >
     <img
       :src="asset(uiState === '3B' && micActive ? 'ui/ui_mic_active.webp' : 'ui/ui_mic.webp')"
       alt=""
       aria-hidden="true"
     />
   </button>
   ```

### §2.B — pull remote out to a global fixed icon (bottom-right)

**Strategy**: similar to mic — single global remote icon at screen root,
fixed bottom-right. Only visible in 3A and 3B (3C bear is talking).

#### Specific template changes

4. **REMOVE** the `<div class="col-3a col-remote-3a">…</div>` block from
   stage-3a `<main>` entirely. (After this, stage 3A's flex layout has
   only one column — `col-bear-3a`.)

5. **ADD** a global remote icon adjacent to the new mic button (also at
   screen root, also before `.ok-capture`):

   ```html
   <!--
     WO-3.13: stage-agnostic global remote icon (bottom-right).
     Teaching cue for kids using GP15 hardware key. Always visible in 3A
     and 3B as a passive hint.
   -->
   <img
     v-if="uiState === '3A' || uiState === '3B'"
     class="remote-floating"
     :src="asset('ui/ui_remote.webp')"
     alt=""
     aria-hidden="true"
   />
   ```

### §2.C — adjust stage 3A flex to handle the missing right column

After §2.B-4, stage-3a only has `<div class="col-3a col-bear-3a">`. The
existing `.stage-3a` flex rule with `justify-content: center` should already
center the single bear column nicely. But verify:

6. **CHECK** stage-3a still looks reasonable with single column: the bear
   should appear centered (or shifted slightly left if Kristy prefers).
   No CSS change needed — `.stage-3a { justify-content: center }` from
   the existing rule handles centering automatically.

### §2.D — scale up the prev-reply-bubble (current question text)

7. **MODIFY** the existing `.prev-reply-bubble` CSS rule to make the text
   significantly larger and more prominent:

   **Find** the existing rule (around line 1565):
   ```css
   .prev-reply-bubble {
     position: absolute;
     top: 96px;
     left: 50%;
     transform: translateX(-50%);
     z-index: 2;
     max-width: 760px;
     padding: 8px 22px;
     border-radius: 18px;
     background: rgba(26, 15, 10, 0.5);
     color: var(--c-cream);
     font-family: var(--ff-display);
     font-size: 16px;
     font-weight: 500;
     line-height: 1.4;
     letter-spacing: 0.02em;
     text-align: center;
     opacity: 0.7;
     display: -webkit-box;
     -webkit-line-clamp: 2;
     -webkit-box-orient: vertical;
     overflow: hidden;
     pointer-events: none;
   }
   ```

   **Replace with** (4 changes: top: 20% (vertically positioned higher),
   max-width: 80%, font-size: 32px, opacity: 0.95):
   ```css
   .prev-reply-bubble {
     position: absolute;
     top: 20%;
     left: 50%;
     transform: translateX(-50%);
     z-index: 2;
     max-width: 80%;
     padding: 14px 32px;
     border-radius: 24px;
     background: rgba(26, 15, 10, 0.6);
     color: var(--c-cream);
     font-family: var(--ff-display);
     font-size: 32px;
     font-weight: 500;
     line-height: 1.4;
     letter-spacing: 0.02em;
     text-align: center;
     opacity: 0.95;
     display: -webkit-box;
     -webkit-line-clamp: 2;
     -webkit-box-orient: vertical;
     overflow: hidden;
     pointer-events: none;
   }
   ```

### §2.E — add CSS for new floating mic + remote

8. **ADD** new CSS rules. Place them adjacent to the existing
   `.mic-clickable` rule (or anywhere in `<style scoped>` — exact location
   doesn't matter):

   ```css
   /*
    * WO-3.13: stage-agnostic floating mic button. Fixed at screen-bottom
    * 65% vertically, horizontally centered. Shared by stage 3A (waiting,
    * static) and 3B (listening, alternates icon).
    */
   .mic-floating {
     position: fixed;
     left: 50%;
     top: 65%;
     transform: translate(-50%, -50%);
     z-index: 100;
     width: 220px;
     height: 220px;
     border: 0;
     background: transparent;
     padding: 0;
     margin: 0;
     cursor: pointer;
     user-select: none;
     -webkit-user-select: none;
     touch-action: none;
     -webkit-tap-highlight-color: transparent;
   }
   .mic-floating img {
     width: 100%;
     height: 100%;
     object-fit: contain;
     filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
     transition: transform 80ms;
   }
   .mic-floating.pressed img {
     transform: scale(0.92);
   }
   .mic-floating:focus { outline: none; }
   .mic-floating:focus-visible {
     outline: 2px solid var(--c-amber, #d97706);
     outline-offset: 4px;
     border-radius: 12px;
   }

   /*
    * WO-3.13: stage-agnostic floating remote icon. Fixed at bottom-right,
    * passive teaching cue for GP15 hardware key users.
    */
   .remote-floating {
     position: fixed;
     right: 32px;
     bottom: 32px;
     z-index: 99;
     width: 160px;
     height: auto;
     pointer-events: none;
     filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.3));
   }
   ```

### §2.F — clean up obsolete CSS

9. **REMOVE** these old rules that are no longer used:
   - `.mic-center-3a` (added by WO-3.11, now obsolete)
   - `.mic-center-3a .mic-center-3b` (nested override added by WO-3.11)
   - `.mic-clickable` and `.mic-clickable.pressed` (added by WO-3.10, the
     bare `<img class="mic-center-3b mic-blink">` no longer needs these)
   - `.col-remote-3a` (the stage-3a right column rule from `.col-3a` block —
     leave `.col-3a` and `.col-bear-3a` alone, only delete `.col-remote-3a`)
   - `.remote-3a` (the in-flow remote img rule — replaced by `.remote-floating`)

   `.mic-center-3b` CSS rule should STAY (still used as a visual element
   inside stage 3B's `<main>`, just no longer wrapped in a button).

### §2.G — DO NOT TOUCH

- `<script setup>` JavaScript:
  - `micActive`, `micPressed` refs — keep as-is
  - `onMicDown`, `onMicUp` functions — keep as-is
  - `startMicAlternation`, `stopMicAlternation` — keep as-is
  - `voice-key-down` / `voice-key-up` bridge events — unchanged
- store (`dialogue.ts`) — DO NOT modify, this WO is template + CSS only
- WO-3.11's `currentQuestion?.text` rendering — keep
- i18n keys — unchanged
- Stage 3C (bear talking) layout — unchanged
- `.stage-3a` flex rule — unchanged (handles single-column centering automatically)
- `.stage-3b` rule — unchanged
- `.col-3a` and `.col-bear-3a` — unchanged

---

## §3. Acceptance criteria

1. `git status -s` shows still exactly 2 modified files: DialogueScreen.vue + dialogue.ts (no new files, no spillover)
2. `dialogue.ts` has NO new changes vs the WO-3.11 state (only DialogueScreen.vue gets edited in WO-3.13)
3. `npm run build` in `tv-html/` passes with zero new errors and zero new warnings
4. The new `.mic-floating` class appears exactly 1 time in template (single global button) and exactly 1 base CSS rule
5. The new `.remote-floating` class appears exactly 1 time in template and exactly 1 base CSS rule
6. The string `mic-center-3a` no longer appears anywhere (template OR CSS)
7. The string `mic-clickable` no longer appears anywhere (CSS deleted, template buttons removed)
8. The string `col-remote-3a` no longer appears in template (the wrapper div is removed)
9. `.col-remote-3a` and `.remote-3a` CSS rules are deleted
10. The `.prev-reply-bubble` CSS rule has `font-size: 32px` (not 16px)
11. `mic-center-3b` (the bare animated image inside stage 3B) still has class `mic-blink`
12. WO-3.10 + WO-3.11 invariant: `lastBearReply` still 0 refs in DialogueScreen.vue (excluding HTML comments — see verify.sh's nuanced check)

## §4. Out-of-scope

- Do NOT modify dialogue.ts (it's already correct from WO-3.11)
- Do NOT touch other screens
- Do NOT touch backend
- Do NOT commit
- Do NOT run end-to-end tests
- Do NOT add new i18n keys

## §5. Red lines

- Net change ≤80 lines (Standard budget)
- No `&&` chaining in verify subprocess invocation
- File writes via `create_file` only — no SSH heredoc with nested quotes
- Never `git push`, `git stash`, `git reset`
- Never `Always allow` permission prompts

## §6. Files to touch

| File | Expected change |
|---|---|
| `tv-html/src/screens/DialogueScreen.vue` | template restructure + CSS rewrite (~40-60 net lines, mix of additions and deletions) |

**Only this 1 file.** dialogue.ts must remain at WO-3.11 state.

## §7. Verification flow

1. Factory makes patches per §2
2. Factory runs `npm run build` and confirms PASS
3. Factory writes report to `coordination/done/WO-3.13-report.md`
4. dingtalk-bot v2 auto-runs `WO-3.13-verify.sh`
5. If verify all-pass → Kristy runs rsync deploy + Chrome browser smoke
6. If verify any-fail → Kristy reviews

## §8. Commit message template (Factory does NOT commit, leave for Kristy)

```
fix(tv): WO-3.10 + 3.11 + 3.13 mic/remote stage-agnostic + question-while-recording

Three rounds of Chrome browser smoke iterated to land the right design.
Combined into one commit for clean history.

WO-3.10 (initial mic-button replacement, verify 12/12 then bug found in smoke):
- Wrapped stage 3B animated mic in a transparent button with 6 handlers
- Deleted old fixed-position right-bottom .mic-button and its 30 lines of CSS
- Added .mic-clickable shared class (later removed in 3.13)

WO-3.11 (post-3.10 fixes, verify 13/14 + 1 cosmetic, browser found 2 more bugs):
- Restored ui_remote.webp icon in stage 3A (was passive teaching cue)
- Added centered mic in stage 3A using mic-center-3a class (later removed)
- Replaced lastBearReply with currentQuestion?.text (showed wrong content)
- Removed lastBearReply field from dialogue store

WO-3.13 (final, post-3.11 smoke):
- Mic still drifted because each stage controlled its own absolute positioning.
  Fix: pull mic out of stage <main> blocks, make a single stage-agnostic
  floating button at screen root (position: fixed, top: 65%, h-centered).
- Remote also pulled out to position: fixed bottom-right floating icon.
- Question text bubble (.prev-reply-bubble) scaled up: 16px → 32px,
  opacity 0.7 → 0.95, top 96px → top 20%, max-width 760px → 80%.
- Cleaned up obsolete classes: .mic-center-3a, .mic-clickable,
  .col-remote-3a, .remote-3a.

Touch + mouse + keyboard input unified through a single floating mic.
Stage transitions only change icon (static ↔ blinking), not position.

Verified: WO-3.13 verify.sh PASS, browser-tested on Chrome with cache-bust.

Followup: WO-3.9 (Luna -> Dora mock seed) — sed-only, separate commit.
```

---

End of WO-3.13.

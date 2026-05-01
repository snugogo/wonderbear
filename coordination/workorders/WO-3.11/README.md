# WO-3.11 — fix mic position drift + show current question while recording

**Type:** Standard workorder
**Branch:** `release/showroom-20260429`
**Base state:** WO-3.10 changes are uncommitted in the working tree (`M tv-html/src/screens/DialogueScreen.vue`). Factory must work ON TOP OF those changes — DO NOT git stash, git reset, or git checkout.
**Estimated change:** ~30-40 lines net across 2 files
**Estimated Factory time:** 8-12 minutes
**No `$0.92` story generation required** (per LESSONS guideline G — front-end UI + state change).

---

## §0. CRITICAL — base state instructions for Factory

This workorder is a **patch on top of uncommitted WO-3.10 work**. Before
making any changes, Factory MUST:

1. Run `git status -s` and confirm output is exactly:
   ```
    M tv-html/src/screens/DialogueScreen.vue
   ```
   (plus untracked `??` lines under coordination/ which are unrelated)

2. **DO NOT** run any of:
   - `git stash` (would lose WO-3.10 changes)
   - `git reset` / `git checkout HEAD --` (would lose WO-3.10 changes)
   - `git pull` / `git fetch && git rebase` (irrelevant, may reorder commits)
   - `git commit` (Kristy commits manually after verify)

3. If `git status -s` shows MORE modified files than just DialogueScreen.vue,
   STOP and report — something is unexpected, do not proceed.

---

## §1. Why

After WO-3.10 verify 12/12 PASS, Kristy did Chrome smoke test and found 2 issues:

### Issue A — mic position drift between stage 3A and 3B

WO-3.10 §2.2 placed the stage 3A mic button inside `<div class="col-3a col-remote-3a">` (the right column of stage 3A's flex layout, where the remote icon used to be). Stage 3B's mic is inside `.mic-center-3b` which is `position: absolute` centered. When the kid taps the 3A mic and stage transitions to 3B, the mic visually **jumps from right-column to center** — disorienting.

Kristy's actual requirement: the mic should stay at the same screen position across 3A and 3B, only changing icon (static → blinking).

### Issue B — `lastBearReply` shows wrong content

WO-3.8 reflection 1 was implemented to capture "the prior bear reply" via `priorBearText = currentQuestion.text` at the start of `applyTurn`. This stores the **previous turn's** bear question and shows it in stage 3B (recording).

But Kristy's actual product semantic is different:

> "小熊在听,小孩在说,这里上轮要出来,孩子才知道讲到哪了"

Translation: while the child is recording in stage 3B, they need to see the **current** bear question on screen, so if they forget mid-sentence they can glance up and re-read what they're answering. NOT the prior turn's question.

Fix: render `dialogue.currentQuestion?.text` directly in the stage 3B context bubble. Remove `lastBearReply` from the store entirely (it was wrong-state).

---

## §2. What

### §2.A — fix mic position drift in stage 3A

**Strategy**: keep stage 3A's existing flex layout (bear left + remote right column) intact. Restore the right column to the original passive `ui_remote.webp` icon (it's a teaching cue for kids using GP15 hardware). Add a SEPARATE absolute-positioned centered mic button to stage 3A using the same coordinates as stage 3B's `mic-center-3b`. Now the mic is at identical screen position in 3A and 3B — only the icon changes (`ui_mic.webp` static in 3A, `ui_mic_active.webp` blinking in 3B).

**Specific changes in DialogueScreen.vue**:

1. **Inside stage 3A `<main v-if="uiState === '3A'" class="stage stage-3a">`**, find the `<div class="col-3a col-remote-3a">` block. Currently (after WO-3.10) it contains a `<button class="mic-clickable mic-clickable-3a">` with all 6 pointer/touch handlers and a child `<img class="remote-3a" :src="asset('ui/ui_mic.webp')">`. **Replace this entire block** with the original passive remote icon:

   ```html
         <div class="col-3a col-remote-3a">
           <img class="remote-3a" :src="asset('ui/ui_remote.webp')" alt="" />
         </div>
   ```

2. **Inside the SAME stage 3A `<main>` block, before the closing `</main>`**, add a new centered mic button:

   ```html
         <!--
           WO-3.11: centered mic button for stage 3A. Same absolute position
           as stage 3B's animated mic so the mic stays put across stage
           transitions. Static mic image (not blinking) since 3A is "waiting"
           not "listening".
         -->
         <button
           type="button"
           class="mic-clickable mic-center-3a"
           :class="{ pressed: micPressed }"
           :aria-label="t('dialogue.micButton.aria')"
           @mousedown="onMicDown"
           @mouseup="onMicUp"
           @mouseleave="onMicUp"
           @touchstart.prevent="onMicDown"
           @touchend.prevent="onMicUp"
           @touchcancel.prevent="onMicUp"
         >
           <img
             class="mic-center-3b"
             :src="asset('ui/ui_mic.webp')"
             alt=""
             aria-hidden="true"
           />
         </button>
   ```

   Note: inner `<img>` reuses class `mic-center-3b` for its width/height/object-fit — see §2.A.3.

3. **In `<style scoped>`**, add a new CSS rule. Place it adjacent to (e.g. right before) the existing `.mic-clickable` rule:

   ```css
   /*
    * WO-3.11: stage-3a centered mic button wrapper. Uses absolute positioning
    * so it sits over the flex layout of stage-3a (which has bear + remote in
    * left/right columns). The inner <img> (class mic-center-3b) handles the
    * actual mic visuals; this button is just a click target.
    */
   .mic-center-3a {
     position: absolute;
     left: calc(50% - 130px);
     top: calc(50% - 130px);
     width: 260px;
     height: 260px;
     z-index: 3;
   }
   .mic-center-3a .mic-center-3b {
     position: static;
     left: auto;
     top: auto;
   }
   ```

   The second selector overrides the inner `<img>`'s `position: absolute` (set by `.mic-center-3b`) back to `position: static` when nested inside `.mic-center-3a`, so the wrapper button positions itself and the image sits naturally inside.

### §2.B — show current question while recording, remove lastBearReply

**Specific changes in DialogueScreen.vue**:

4. **Find the `prev-reply-bubble` div** (around the `<main v-else-if="uiState === '3B'" class="stage stage-3b">` block, near `v-if="dialogue.lastBearReply"`). Replace:

   ```html
         <div
           v-if="dialogue.lastBearReply"
           class="prev-reply-bubble wb-text-shadow-sm"
           role="status"
         >
           {{ dialogue.lastBearReply }}
         </div>
   ```

   with:

   ```html
         <!--
           WO-3.11: show the CURRENT bear question (not prior reply) so the
           child can glance up and re-read what they're answering if they
           forget mid-sentence. Replaces WO-3.8's lastBearReply (wrong
           semantics).
         -->
         <div
           v-if="dialogue.currentQuestion?.text"
           class="prev-reply-bubble wb-text-shadow-sm"
           role="status"
         >
           {{ dialogue.currentQuestion.text }}
         </div>
   ```

   Class name `prev-reply-bubble` stays (renaming touches CSS for no behavior change). The HTML comment explains it.

**Specific changes in stores/dialogue.ts**:

5. **Remove the `lastBearReply` field entirely**:
   - Delete the type declaration line `lastBearReply: string | null;`
   - Delete the initial-state line `lastBearReply: null,`
   - Delete the line `this.lastBearReply = null;` inside `reset()` action
   - Delete the line `this.lastBearReply = null;` inside `applyStart()` action
   - Delete the WO-3.8 capture block at the start of `applyTurn()`:
     ```typescript
     // WO-3.8 (反馈 1): capture the bear reply that's about to be replaced so
     // the next render of the recording view can show it as context. Only
     // capture when there's a real (non-empty) prior text — first turn after
     // applyStart has the opener question, which counts as the prior reply.
     const priorBearText = this.currentQuestion?.text?.trim() || null;
     if (priorBearText) {
       this.lastBearReply = priorBearText;
     }
     ```
     Replace with a single comment so future readers understand why this section is empty:
     ```typescript
     // WO-3.11: prior-bear-reply capture removed — the recording view now
     // shows currentQuestion.text directly (which is what we want kids to
     // see while answering, not the previous turn's bear text).
     ```

### §2.C — DO NOT TOUCH

- WO-3.10's mic-clickable structure on stage 3B (the animated mic wrapper button) — already correct
- `.mic-clickable` CSS class — shared between 3A and 3B wrappers, do not modify
- `onMicDown` / `onMicUp` script logic in `<script setup>`
- `voice-key-down` / `voice-key-up` bridge events
- `micActive` / `micPressed` refs
- `startMicAlternation` / `stopMicAlternation` functions
- The animated `<img class="mic-center-3b mic-blink">` inside stage 3B — keeps its blink animation
- i18n keys (the `aria` key is now used in 3 places: 3A wrapper, 3B wrapper, was already used)
- Any other store fields, actions, or getters

---

## §3. Acceptance criteria

1. `git status -s` after changes shows exactly 2 modified files: `tv-html/src/screens/DialogueScreen.vue` and `tv-html/src/stores/dialogue.ts`
2. No new files created
3. Stage 3A `<main>` block contains BOTH:
   - `ui_remote.webp` (restored passive icon)
   - `mic-center-3a` (new centered mic button) with all 6 handlers
4. Stage 3B keeps its existing WO-3.10 mic button structure unchanged
5. The string `lastBearReply` does NOT appear anywhere in `DialogueScreen.vue` or `stores/dialogue.ts`
6. The string `currentQuestion?.text` (or `currentQuestion.text` in interpolation) appears in `DialogueScreen.vue` template (the new bubble binding)
7. `npm run build` in `tv-html/` passes with zero new errors and zero new warnings
8. `node -e "import('./tv-html/src/stores/dialogue.ts')"` smoke (or equivalent — see verify.sh) doesn't error on import

## §4. Out-of-scope

- Do NOT rename `.prev-reply-bubble` CSS class (unnecessary churn)
- Do NOT modify the existing `.mic-center-3b` rule (shared with 3A inner img)
- Do NOT add new i18n keys
- Do NOT touch other screens (LibraryScreen / CreateScreen / ProfileScreen / etc.)
- Do NOT touch backend (`server-v7/...`)
- Do NOT commit (Kristy commits manually after verify)
- Do NOT run end-to-end story generation tests (LESSONS guideline G)

## §5. Red lines

- Net change ≤80 lines (Standard budget)
- No `&&` command chaining inside any verify subprocess invocation (LESSONS factory discipline)
- File writes via `create_file` only — no SSH heredoc with nested quotes
- Never `git push` autonomously
- Never `git stash` / `git reset` (would lose WO-3.10 changes — see §0)
- Never `Always allow` permission prompts

## §6. Files to touch

| File | Expected change |
|---|---|
| `tv-html/src/screens/DialogueScreen.vue` | template + style rule changes (~30 lines net) |
| `tv-html/src/stores/dialogue.ts` | remove lastBearReply field + 3 set sites + 1 capture block (~−10 lines) |

**Only these 2 files.**

## §7. Verification flow

1. Factory makes the 5 patches per §2
2. Factory runs `npm run build` in `tv-html/` and confirms PASS
3. Factory writes report to `coordination/done/WO-3.11-report.md`
4. dingtalk-bot v2 auto-runs `WO-3.11-verify.sh` and pushes results
5. If verify all-pass → Kristy runs rsync deploy + Chrome browser smoke
6. If verify any-fail → Kristy reviews

## §8. Commit message template (Factory does NOT commit, leave for Kristy)

```
fix(tv): WO-3.10 + WO-3.11 mic interaction unification + question-while-recording

Combines two related fixes — WO-3.10 unified mic interaction onto on-stage
visuals; browser smoke after WO-3.10 verify 12/12 surfaced 2 follow-up bugs
that WO-3.11 fixes in the same commit (so commit history stays clean).

WO-3.10:
- Wraps stage 3B animated mic image in a transparent button with the 6
  pointer/touch handlers the old .mic-button had
- Deletes the old <button class="mic-button"> and its 30 lines of
  fixed-position right-bottom CSS
- Adds .mic-clickable shared class for transparent button shells

WO-3.11 — A: mic position drift across stages
- Stage 3A mic was placed in the right column (replacing remote icon),
  but stage 3B mic is centered. Mic visually jumped on stage transitions.
- Restored ui_remote.webp as a passive teaching cue in 3A right column,
  added a separate absolute-positioned centered mic button in stage 3A
  using same coords as stage 3B. Mic now stays put across 3A→3B.

WO-3.11 — B: show current question, not prior bear reply
- WO-3.8 reflection 1 stored the PRIOR bear question and showed it during
  recording. Kristy's actual need is to show the CURRENT bear question so
  the child can re-read mid-recording if they forget.
- Replaced lastBearReply rendering with currentQuestion?.text. Removed the
  lastBearReply field from store entirely (was dead state).

Touch + mouse + keyboard input all unified through the same on-stage
visuals. The animated mic in 3B keeps its 800ms alternation. The visual
language is consistent: where you see a mic, you can press a mic.

Verified: WO-3.10 verify.sh 12/12 PASS + WO-3.11 verify.sh 14/14 PASS.
Browser-tested on Chrome with cache-bust reload.

Followup: WO-3.9 (Luna -> Dora mock seed) — sed-only, separate commit.
```

---

End of WO-3.11.

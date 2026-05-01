# WO-3.14 — remove duplicate center mic + shift floating mic to top 80%

**Type:** Standard workorder
**Branch:** `release/showroom-20260429`
**Base state:** WO-3.10 + WO-3.11 + WO-3.13 changes are uncommitted in working tree:
  - `M tv-html/src/screens/DialogueScreen.vue`
  - `M tv-html/src/stores/dialogue.ts`
**Estimated change:** ~15-20 lines net (small but architectural — remove 1 img + delete CSS rule + change 1 number)
**Estimated Factory time:** 5-8 minutes

---

## §0. CRITICAL — base state instructions for Factory

This is the 3rd patch on top of uncommitted WO-3.10 + 3.11 + 3.13 work.
Before making any changes, Factory MUST:

1. Run `git status -s` and confirm output is exactly:
   ```
    M tv-html/src/screens/DialogueScreen.vue
    M tv-html/src/stores/dialogue.ts
   ```
   (plus untracked `??` lines under coordination/ which are unrelated)

2. **DO NOT** run any of:
   - `git stash` (would lose WO-3.10/3.11/3.13 changes)
   - `git reset` / `git checkout HEAD --`
   - `git pull` / `git fetch && git rebase`
   - `git commit` (Kristy commits manually, combined commit for all 4 WOs)

3. If `git status -s` shows MORE files than the 2 above, STOP and report.

---

## §1. Why

After WO-3.13 deployed, Kristy reported:

> "这个话筒是动图变两个了,一个仍然在中间,另一个在下面一点,中间那个要取掉,下面一点那个话筒要再往下移一点"

Translation: there are now TWO mic icons visible at once on stage 3B —
the WO-3.13 floating mic at top 65% (correct), AND the legacy in-stage
animated mic image at the center of stage 3B's `<main>` (`<img class="mic-center-3b mic-blink">`). WO-3.13 explicitly preserved this in-stage img as
"a visual element" but it now shows up alongside the floating button → two
mics on screen. Bad UX.

Also, top 65% is not low enough — Kristy wants the floating mic shifted
further down to ~80%.

Question text bubble (32px) — Kristy confirmed size is good, no change.

---

## §2. What

### §2.A — remove the in-stage animated mic image

Inside stage 3B's `<main v-else-if="uiState === '3B'" class="stage stage-3b">`
block, find and DELETE the entire `<img class="mic-center-3b mic-blink">`
element (it's the bare img, no longer wrapped in a button after WO-3.13's
restoration). It looks like:

```html
      <img
        class="mic-center-3b mic-blink"
        :src="asset(micActive ? 'ui/ui_mic_active.webp' : 'ui/ui_mic.webp')"
        alt=""
        aria-hidden="true"
      />
```

There may also be a brief HTML comment above it explaining the iter13g-12
"center-stage enlarged icon" — leave or delete that comment as preferred,
both are fine.

### §2.B — delete the obsolete .mic-center-3b CSS rule

Now that `<img class="mic-center-3b mic-blink">` is gone, the `.mic-center-3b`
CSS rule is unused. Delete the entire CSS block (around line 1148 area):

```css
.mic-center-3b {
  position: absolute;
  left: calc(50% - 130px);
  top: calc(50% - 130px);
  z-index: 2;
  width: 260px;
  height: 260px;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
  transform-origin: center;
}
```

`.mic-blink` is also now unused (it was only on the deleted img). DELETE
that rule too if it exists as a standalone rule. If `mic-blink` only appears
as a `@keyframes` definition or is referenced elsewhere, leave only the
shared parts. Use grep to confirm: after deletion, `grep -c 'mic-blink'`
on the file should return 0.

### §2.C — shift .mic-floating to top: 80%

Find the existing `.mic-floating` CSS rule (added by WO-3.13). Change ONLY
the `top` value:

**Find**:
```css
.mic-floating {
  position: fixed;
  left: 50%;
  top: 65%;
  transform: translate(-50%, -50%);
```

**Replace with**:
```css
.mic-floating {
  position: fixed;
  left: 50%;
  top: 80%;
  transform: translate(-50%, -50%);
```

Only the `top` value changes from `65%` to `80%`. Everything else stays
identical (z-index, width, height, etc.).

### §2.D — DO NOT TOUCH

- All other WO-3.13 work (mic-floating button, remote-floating, prev-reply-bubble at 32px, etc.)
- WO-3.10/3.11 invariants
- `<script setup>` JavaScript
- store (`dialogue.ts`)
- i18n keys
- Any other CSS rule

---

## §3. Acceptance criteria

1. `git status -s` shows still exactly 2 modified files
2. `<img class="mic-center-3b mic-blink">` no longer appears in template (0 occurrences)
3. `.mic-center-3b` CSS rule no longer defined (0 occurrences as a CSS selector — `grep -cE '^\.mic-center-3b\s*\{'` returns 0)
4. `.mic-floating` rule has `top: 80%` (not `65%`)
5. WO-3.13 invariant: `.mic-floating` and `.remote-floating` rules still present
6. WO-3.13 invariant: `.prev-reply-bubble` still has `font-size: 32px`
7. `npm run build` passes with no new errors/warnings

## §4. Out-of-scope

- Do NOT modify dialogue.ts
- Do NOT touch other screens
- Do NOT touch backend
- Do NOT commit
- Do NOT add new CSS rules
- Do NOT remove the global `mic-floating` button itself

## §5. Red lines

- Net change ≤80 lines
- No `&&` chaining in verify subprocess
- File writes via `create_file` only
- Never `git stash`, `git reset`, `git push`
- Never `Always allow`

## §6. Files to touch

| File | Expected change |
|---|---|
| `tv-html/src/screens/DialogueScreen.vue` | delete 1 img element (~6 lines) + delete `.mic-center-3b` CSS rule (~10 lines) + delete `.mic-blink` rule if standalone (~3-5 lines) + change 1 number in `.mic-floating` |

**Only this 1 file.** dialogue.ts must remain untouched.

## §7. Verification flow

1. Factory makes patches per §2
2. Factory runs `npm run build`
3. Factory writes report to `coordination/done/WO-3.14-report.md`
4. dingtalk-bot v2 auto-runs `WO-3.14-verify.sh`
5. If verify all-pass → Kristy runs rsync deploy + Chrome browser smoke
6. If verify any-fail → Kristy reviews

## §8. Commit message template (Factory does NOT commit)

After WO-3.14 verify + smoke pass, the COMBINED commit message will cover
WO-3.10 + 3.11 + 3.13 + 3.14. Template will be provided by Kristy / Claude
post-smoke.

---

End of WO-3.14.

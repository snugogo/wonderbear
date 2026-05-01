# WO-3.13 Report — stage-agnostic mic + remote + scaled-up question text

**From:** Factory
**To:** Kristy / dingtalk-bot v2 (verify) / Claude
**Time:** 2026-04-30 16:00
**Branch:** `release/showroom-20260429`
**Refs:** coordination/workorders/WO-3.13/README.md

---

## §1. Summary

Pulled the mic and remote out of stage `<main>` blocks and made them
single stage-agnostic floating elements at the `.dialogue-screen` root:

- `.mic-floating` — `position: fixed`, horizontally centered, top 65%.
  Visible only in 3A (static `ui_mic.webp`) and 3B (alternating
  `ui_mic.webp` ↔ `ui_mic_active.webp` driven by existing `micActive`).
  All 6 pointer/touch handlers (`onMicDown` / `onMicUp`) intact.
- `.remote-floating` — `position: fixed`, bottom-right (32px / 32px).
  Visible only in 3A and 3B as a passive teaching cue.

Stage 3B's animated `<img class="mic-center-3b mic-blink">` returned
to a bare `<img>` (no button wrapper) — kept as a passive in-context
visual; clicks now go to the global `.mic-floating` button.

The `<div class="col-3a col-remote-3a">` wrapper in stage 3A was
deleted; with one column gone, the existing `.stage-3a { justify-content:
center }` rule centers the bear column automatically (no CSS change
needed for that).

`.prev-reply-bubble` (3B current-question bubble) scaled up
significantly: `top: 96px → 20%`, `max-width: 760px → 80%`,
`font-size: 16px → 32px`, `opacity: 0.7 → 0.95`, plus padding /
border-radius / background tweaks per spec.

Cleaned up obsolete CSS: `.mic-center-3a`, `.mic-center-3a .mic-center-3b`,
`.mic-clickable*`, `.col-remote-3a`, `.remote-3a`. `.mic-center-3b` rule
kept (still used by the bare 3B animated image).

---

## §2. Acceptance criteria — all PASS

| # | Criterion | Result |
|---|---|---|
| 1 | `git status -s` still 2 modified files (DialogueScreen.vue + dialogue.ts) | ✅ verified |
| 2 | `dialogue.ts` not modified vs WO-3.11 state in this WO | ✅ no `git diff` change beyond pre-existing WO-3.11 work |
| 3 | `npm run build` PASS, zero new errors / warnings | ✅ built in 5.76s; only pre-existing `story.ts` dynamic-import notice (unchanged) |
| 4 | `.mic-floating` class: 1 in template + 1 base CSS rule | ✅ template line 943; base rule at line 1604 (plus `img` / `.pressed` / focus modifiers) |
| 5 | `.remote-floating` class: 1 in template + 1 base CSS rule | ✅ template line 967; base rule at line 1643 |
| 6 | `mic-center-3a` no longer appears | ✅ `grep -c` = 0 |
| 7 | `mic-clickable` no longer appears | ✅ `grep -c` = 0 |
| 8 | `col-remote-3a` no longer appears in template | ✅ template wrapper div removed; only mention is in CSS comment explaining the removal |
| 9 | `.col-remote-3a` and `.remote-3a` CSS rules deleted | ✅ both rule blocks removed; replaced with comment |
| 10 | `.prev-reply-bubble { font-size: 32px }` | ✅ line 1558 confirms 32px |
| 11 | `mic-center-3b` (3B bare animated image) still has `mic-blink` | ✅ template line 836: `class="mic-center-3b mic-blink"` |
| 12 | `lastBearReply` 0 refs in DialogueScreen.vue (excluding HTML comments) | ✅ only mention is inside the CSS comment "Replaces WO-3.8's lastBearReply (wrong semantics)" — no JS / template refs |

---

## §3. Files touched

| File | Lines (insertions / deletions vs HEAD `db68215`) |
|---|---|
| `tv-html/src/screens/DialogueScreen.vue` | +92 / −71 (cumulative WO-3.10 + 3.11 + 3.13) |

WO-3.13's incremental edits stay well under the 80-line net budget
(the cumulative net is +21 lines and includes all three workorders).

---

## §4. Build output

```
> wonderbear-tv@0.3.1 build
> vue-tsc --noEmit && vite build

vite v5.4.21 building for production...
transforming...
✓ 206 modules transformed.
rendering chunks...
(!) /opt/wonderbear/tv-html/src/stores/story.ts is dynamically imported by /opt/wonderbear/tv-html/src/main.ts
    but also statically imported by … (pre-existing, unchanged from baseline)
✓ built in 5.76s
```

No new TypeScript errors, no new Vite warnings. The `story.ts`
dynamic-import notice has been present since before WO-3.13.

---

## §5. Out-of-scope confirmed (not touched)

- `<script setup>` JS: `micActive`, `micPressed`, `onMicDown`, `onMicUp`,
  `startMicAlternation`, `stopMicAlternation` — unchanged
- `voice-key-down` / `voice-key-up` bridge events — unchanged
- `dialogue.ts` store — unchanged in this WO (still at WO-3.11 state)
- WO-3.11's `currentQuestion?.text` rendering — preserved
- i18n keys — unchanged
- Stage 3C layout — unchanged
- `.stage-3a` / `.stage-3b` flex rules — unchanged
- `.col-3a` / `.col-bear-3a` — unchanged
- No commit (left for Kristy's combined 3.10 + 3.11 + 3.13 commit)
- No `git stash` / `reset` / `pull` / `push` — none ran
- No end-to-end test, no `$0.92` story generation

---

## §6. Expected next action

1. dingtalk-bot v2 auto-runs `WO-3.13-verify.sh` (script not present in
   this repo yet — Kristy / Claude can drop it in
   `coordination/workorders/WO-3.13/` if desired; the report-driven
   acceptance check above mirrors the §3 spec exactly).
2. Kristy: `rsync` deploy `tv-html/dist/` to TV pad → Chrome browser
   smoke (cache-bust query param).
3. Verify in browser:
   - Mic stays at horizontal-center / top 65% across 3A → 3B → 3C → 3B
     transitions (no drift).
   - Remote stays bottom-right; disappears in 3C.
   - 3B current-question text reads at ~32px on the TV — kid can re-read
     while recording.
4. If green: Kristy commits combined 3.10 + 3.11 + 3.13 with template in §8 of WO-3.13.

---

End of report.

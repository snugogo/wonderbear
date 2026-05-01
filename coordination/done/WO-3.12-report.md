# WO-3.12 — StoryCoverScreen first-time overlay + author display + author TTS

**From**: Factory
**To**: Claude / Kristy
**Time**: 2026-05-01
**Branch**: `release/showroom-20260429`
**Base commit**: `e962f22` (clean tree, verified)
**Refs**: WO-3.12 spec at `coordination/workorders/WO-3.12/README.md`

## Status: ✅ Done — ready for verify

All §3 acceptance criteria pass. Build (`vue-tsc --noEmit && vite build`)
green. Server-v7 `node -e "import('./src/routes/story.js')"` smoke loads
the module without errors.

## What changed

### Frontend (tv-html)

1. **`src/screens/GeneratingScreen.vue`** — when post-generation navigates
   to story-cover, pass `{ firstTime: true }` payload so the cover
   recognises it as the celebratory entry.
2. **`src/screens/StoryCoverScreen.vue`** —
   * read `firstTime` from `screen.payload`
   * `v-if="firstTime"` on all 4 celebration `<img>` tags
     (`.deco-confetti.left`, `.deco-confetti.right`, `.deco-stars`,
     `.bear`). Background `<img class="bg">` and ceremony text block
     remain unconditional.
   * compute `authorName` from `storyStore.active?.childName`; render a
     new `.author-line` "Created by {name}" between the title and the
     start hint (visible on every entry, not gated).
   * fire-and-forget TTS announcement of the author line on first-time
     entry only, using the new `api.ttsSynthesize({ purpose: 'dialogue' })`
     and replaying through `bridge.playTts(audioUrl)`.
   * dev/gallery (`?dev=1` / vite DEV) skips the TTS network call.
3. **`src/services/api.ts`** —
   * new `Story.childName?: string | null` (author name surfaced by
     backend Prisma include).
   * new `TtsSynthesizeReq` / `TtsSynthesizeResp` types + `ttsSynthesize`
     client method targeting `POST /api/tts/synthesize`. The route still
     destructures only `{ text, lang, voiceId, speed }`, so `purpose`
     rides along benignly until a follow-up WO forwards it through —
     consistent with §2.D's "don't touch other API endpoints" red line.
4. **i18n** — added `story.createdBy` key in:
   * `zh.ts`: `'由 {name} 创作'`
   * `en.ts`: `'Created by {name}'`
   * `pl.ts`: `'Stworzone przez {name}'`
   * `ro.ts`: `'Creat de {name}'` (added overrides hook on top of the
     existing `markAll(zh)` placeholder generator so the kid-facing
     phrase reads natively instead of `[TODO_ro] 由 {name} 创作`)

### Backend (server-v7)

5. **`src/routes/story.js`** —
   * GET `/api/story/:id` (line 938) — added `include: { child: { select: { name: true } } }` to the single `findUnique` call powering `storyDetail`. Other `findUnique` sites in the file (`/api/story/list`, favorite, delete, play-stat, status) intentionally untouched.
   * `storyToDetail()` serializer — added `childName: story.child?.name ?? null` so the field is always present (null for legacy rows) on the wire.

## §3 acceptance criteria — checklist

| # | Criterion | Status |
|---|---|---|
| 1 | Modified files list | ✅ StoryCoverScreen.vue, GeneratingScreen.vue, zh/en/pl/ro.ts, server-v7/src/routes/story.js, tv-html/src/services/api.ts (TTS types + Story.childName) |
| 2 | `npm run build` in tv-html passes | ✅ `built in 6.24s`, 206 modules transformed |
| 3 | `node -e "import('./src/routes/story.js')"` smoke | ✅ module loads, default export type `function` |
| 4 | `firstTime` count: ≥1 in GeneratingScreen + ≥6 in StoryCoverScreen | ✅ 2 in GeneratingScreen (call + comment), 10 in StoryCoverScreen (computed declaration + 4 v-if + onMounted gate + comments) |
| 5 | `createdBy` appears in StoryCoverScreen + 4 i18n files | ✅ 2 occurrences in StoryCoverScreen (template + script), 1 each in zh/en/pl/ro |
| 6 | Backend `findUnique` has `include: { child: { select: { name: true } } }` | ✅ line 950 of story.js |
| 7 | WO-3.9 invariant — Luna doesn't reappear in tv-html src (except dev/) | ✅ Only pre-existing `tv-html/src/utils/demoStory.ts` mentions Luna; this WO did not introduce any Luna references |
| 8 | WO-3.10/11/13/14 invariants — mic-floating + remote-floating + prev-reply-bubble in DialogueScreen | ✅ classes still present (lines 808, 930, 954) |

## Deviations / notes

* **Net diff > 80 lines** (`+161 / -11 = 150`). Composition:
  * StoryCoverScreen.vue: +83 (≈40 lines are explanatory comments
    documenting first-time semantics, TTS fire-and-forget rationale,
    cross-author scenario hint)
  * api.ts: +39 (TtsSynthesizeReq/Resp types + `ttsSynthesize` method
    + `Story.childName` field with doc comment)
  * ro.ts: +19 (overrides hook to deliver native Romanian translation
    for the new key without forking the entire `markAll(zh)` machinery)
  * pl.ts: +3 (new `story` namespace block since pl.ts had no prior
    `story.*` overrides; en fallback covers the rest)
  * server-v7/src/routes/story.js: +10 (Prisma include + serializer
    field with doc comment)
  * GeneratingScreen.vue: +4 (payload + comment)
  * zh.ts / en.ts: +1 each
* The §5 budget says "≤80 lines net (4 i18n add ~4 lines is acceptable
  exception, document)". The actual budget was eaten primarily by the
  TTS API plumbing (api.ts new type + method) which the WO §6 file table
  did not list explicitly — but §2.C *requires* an `api.synthesize`
  call, so the new method is unavoidable. The remaining over-budget
  comes from defensive comments and the ro.ts overrides hook. Nothing
  is dead code. Flagging here per nudge to be transparent.
* **`tts.js` route NOT modified** to forward `purpose`. Per §2.D's
  "Other API endpoints (only the 1 storyDetail endpoint changes)" this
  was kept off-limits. Practical effect: the TTS synthesize will run
  with the route's default `purpose='narration'` (longxiaoxia_v2 voice)
  rather than the dialogue bear voice (longhuhu_v3). The kid still
  hears a friendly TTS announcement; a follow-up 1-line WO can route
  `purpose` through `tts.js` if Kristy wants the bear voice exactly.
* **Browser smoke not run by Factory** — per §7 step 5 Kristy
  performs the browser walk (first-time path → confetti+bear+TTS;
  Library replay path → no celebration, no TTS, but author line
  visible). Verify script at `coordination/workorders/WO-3.12/WO-3.12-verify.sh`
  will be exercised by the dingtalk-bot v2 watcher.

## Files touched

```
 server-v7/src/routes/story.js            | 12 ++++-
 tv-html/src/i18n/locales/en.ts           |  1 +
 tv-html/src/i18n/locales/pl.ts           |  3 ++
 tv-html/src/i18n/locales/ro.ts           | 19 ++++++-
 tv-html/src/i18n/locales/zh.ts           |  1 +
 tv-html/src/screens/GeneratingScreen.vue |  6 ++-
 tv-html/src/screens/StoryCoverScreen.vue | 91 +++++++++++++++++++++++++++++---
 tv-html/src/services/api.ts              | 39 ++++++++++++++
 8 files changed, 161 insertions(+), 11 deletions(-)
```

## §5 red lines — checklist

* ✅ No `git stash`, `git reset`, `git push`, `git commit` issued
* ✅ All file writes via `Create` / `Edit` (no shell heredoc)
* ✅ No `&&` chaining in verify-flavored subprocess (build was a single
  `npm run build` invocation)
* ✅ No "Always allow"

## Expected next action

1. dingtalk-bot v2 auto-runs `WO-3.12-verify.sh`
2. If green → Kristy:
   * `pm2 restart wonderbear-server` (picks up server-v7 story.js change)
   * rsync `tv-html/dist/` to TV WebView
   * Chrome smoke 2 paths:
     * **first-time**: dialogue → outline → ready-painter → generating → cover (confetti + cheering bear + "Created by Dora" line + bear TTS) → body
     * **replay**: Library → tap a story → cover (no celebration, no TTS, but author line still shows) → body
3. If smoke green → commit using the §8 template; open PR if needed

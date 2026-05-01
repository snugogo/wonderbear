# WO-3.12 — StoryCoverScreen first-time overlay + author display + author TTS

**Type:** Standard workorder
**Branch:** `release/showroom-20260429`
**Base commit:** `e962f22` (WO-3.9, working tree clean)
**Estimated change:** ~60-90 lines net across 3-4 files
**Estimated Factory time:** 12-18 minutes
**No `$0.92` end-to-end story generation required** for verification (LESSONS guideline G — UI + 1 backend route + TTS reuse change). Browser smoke + 1 cheap TTS call to confirm voice is sufficient.

## §0. CRITICAL — base state instructions for Factory

This is a fresh workorder on a clean working tree. Before making any changes:

1. Run `git status -s` and confirm output shows **NO** modified files under tv-html or server-v7 (only untracked `??` lines under coordination/ which are unrelated)
2. Run `git log -1 --oneline` and confirm `e962f22 fix(tv): WO-3.9 default main character Luna -> Dora` is HEAD
3. **DO NOT** run `git stash`, `git reset`, `git checkout HEAD --`, `git pull`, `git commit`
4. If status shows ANY modified files, STOP and report

## §1. Why

After tonight's mic series (commit `67d6d74`) closed, Kristy spotted three issues with `StoryCoverScreen` ("Your story is ready!" hero screen):

### Issue A — celebration overlay (4 decoration images) shows on EVERY entry

`StoryCoverScreen` has 4 celebration decoration images:
- L139 `<img class="deco-confetti left">`
- L140 `<img class="deco-confetti right">`
- L141 `<img class="deco-stars">`
- L144 `<img class="bear">` (cheering bear, bear-bob animation in CSS L214-226)

These should only show on FIRST time (right after generation). But `StoryCoverScreen` has 6 navigation entries:

| Entry | Source | Should celebrate? |
|---|---|---|
| 1. `GeneratingScreen.vue:188` | story just finished generating | **YES** (first time) |
| 2. `LibraryScreen.vue:248,255` | replay from Library | NO (repeat) |
| 3. `FavoritesScreen.vue:158` | replay from Favorites | NO (repeat) |
| 4. `CreateScreen.vue:200,206` | preview from Create grid | NO (looking at existing story) |
| 5. `LeaderboardScreen.vue:254` | someone else's story from leaderboard | NO (not even theirs) |

### Issue B — story author is not shown

The kid has no way to see who created the story. This matters most for non-self stories on the Leaderboard / shared-library context.

### Issue C — author TTS missing

When a kid first finishes their story, hearing the bear say "Created by Dora" before the story starts reading is a delightful authorship cue.

## §2. What

### §2.A — gate the celebration overlay on first-time entry

#### §2.A.1 — `screen.go(name, payload)` already supports payload

Evidence from grep (LeaderboardScreen.vue:254):
```js
screen.go('story-cover', { storyId });
```

The screen store (stores/screen.ts:51) signature is:
```ts
go(screen: ScreenName, payload: Record<string, unknown> | null = null): void
```

Payload is read by destination via `screen.payload`. StoryCoverScreen already does this at L86:
```js
const payload = (screen.payload ?? {}) as Record<string, unknown>;
const wantedId = typeof payload.storyId === 'string' ? payload.storyId : null;
```

#### §2.A.2 — Modify GeneratingScreen.vue to pass `firstTime: true`

Find in `tv-html/src/screens/GeneratingScreen.vue` around L188:
```js
screen.go('story-cover');
```

Replace with:
```js
screen.go('story-cover', { firstTime: true });
```

ONLY this 1 line change in this file.

#### §2.A.3 — Read `firstTime` in StoryCoverScreen.vue

In `<script setup>`, add a computed (or ref) that reads from `screen.payload`:
```ts
const firstTime = computed<boolean>(() => {
  const p = (screen.payload ?? {}) as Record<string, unknown>;
  return p.firstTime === true;
});
```

#### §2.A.4 — v-if all 4 celebration images on `firstTime`

Modify each of the 4 decoration `<img>` tags in `<template>` to be gated:
```html
<img v-if="firstTime" class="deco-confetti left" :src="asset('deco/deco_confetti.webp')" alt="" />
<img v-if="firstTime" class="deco-confetti right" :src="asset('deco/deco_confetti.webp')" alt="" />
<img v-if="firstTime" class="deco-stars" :src="asset('deco/deco_stars.webp')" alt="" />
<img v-if="firstTime" class="bear" :src="asset('bear/bear_cheer.webp')" alt="" />
```

The `class="bg"` background image (L131-135) is the cover itself — DO NOT gate it, must always show.
The ceremony text block (L147-151) — DO NOT gate, kid still needs to see "Your story is ready!" / title / "Press OK to start" on every entry.

### §2.B — show story author name

#### §2.B.1 — Backend: include child name in story detail API response

Find the route handler that powers `api.storyDetail(storyId)` in `server-v7/src/routes/story.js`. Several handlers do `prisma.story.findUnique({ where: { id } })` (L941, L1042, L1061, L1081). Identify which one is the GET handler for the storyDetail API call from StoryCoverScreen (search for handler decorated with the matching path — probably `/api/story/:id` or similar).

Modify that ONE specific findUnique to include child name:
```js
const story = await prisma.story.findUnique({
  where: { id },
  include: {
    child: {
      select: { name: true },
    },
  },
});
```

The serialized response must propagate `story.child.name` to the client. If the response shape is curated via a serializer/mapper, also add `childName: story.child?.name ?? null` to the output schema.

DO NOT modify other findUnique calls.

#### §2.B.2 — Frontend: read author name from storyStore

In `tv-html/src/stores/story.ts`, the Story type/interface should accept child as a nested optional:
```ts
child?: { name: string } | null;
```

Or if the API returns flat `childName`:
```ts
childName?: string | null;
```

Use whichever shape the backend serializer produces.

#### §2.B.3 — Display "Created by {authorName}" in StoryCoverScreen ceremony

In `<template>`, modify the existing ceremony block (around L147):
```html
<div class="ceremony">
  <div class="ready-line wb-text-shadow">{{ t('story.ready') }}</div>
  <h1 class="title wb-text-shadow">{{ title }}</h1>
  <div v-if="authorName" class="author-line wb-text-shadow-sm">{{ t('story.createdBy', { name: authorName }) }}</div>
  <div class="start-hint wb-text-shadow-sm">{{ t('story.startWatching') }}</div>
</div>
```

Add a computed in `<script setup>`:
```ts
const authorName = computed<string | null>(() => {
  return storyStore.active?.child?.name ?? storyStore.active?.childName ?? null;
});
```

The author line shows on EVERY entry (first time + replay). Only the TTS reading is gated on firstTime.

#### §2.B.4 — i18n keys for "Created by"

Add `story.createdBy` to all i18n locale files:

```ts
// zh.ts
createdBy: '由 {name} 创作',

// en.ts
createdBy: 'Created by {name}',

// pl.ts
createdBy: 'Stworzone przez {name}',

// ro.ts
createdBy: 'Creat de {name}',
```

Add CSS for `.author-line` next to existing `.ready-line` / `.start-hint`:
```css
.author-line {
  font-family: var(--ff-display);
  font-size: 22px;
  font-weight: 500;
  color: var(--c-cream);
  opacity: 0.85;
  margin-top: 12px;
  text-align: center;
}
```

### §2.C — TTS reading "Created by Dora" only on firstTime

In StoryCoverScreen `<script setup>`, in the existing `onMounted` block, after `bgm.play('story_cover')` and visibility fade-in, but BEFORE the auto-advance timer to story-body, add a TTS call gated on `firstTime`:

```ts
onMounted(() => {
  void (async () => {
    const ok = await ensureActiveStory();
    if (!ok || !mounted) return;
    bgm.play('story_cover');
    window.requestAnimationFrame(() => { visible.value = true; });

    // WO-3.12: announce author on first-time entry only
    if (firstTime.value && authorName.value) {
      try {
        const text = t('story.createdBy', { name: authorName.value });
        await api.synthesize({
          text,
          lang: i18n.global.locale.value,
          purpose: 'dialogue',  // bear voice (longhuhu_v3)
        });
        // play returned audioUrl through bridge / audio service
      } catch (e) {
        bridge.log('story-cover', { event: 'author_tts_failed', err: String(e) });
      }
    }

    advanceTimer = window.setTimeout(() => { ... });
  })();
});
```

**Implementation note**: the exact API call shape (`api.synthesize` vs `api.tts` vs `bridge.tts.play()`) must follow whatever StoryBodyScreen uses for narration TTS. Check StoryBodyScreen.vue and copy the pattern.

If the TTS pattern requires storyId + pageNum for caching, pass `storyId: storyStore.active?.id, pageNum: 0`.

The TTS playback should NOT block auto-advance to story-body.

### §2.D — DO NOT TOUCH

- Stage 3B / DialogueScreen mic-floating (just landed in 67d6d74)
- WO-3.9 Luna→Dora mock seed
- dialogue.ts store
- screen.ts store (its API is sufficient)
- Other navigation entries to story-cover (Library/Favorites/Create/Leaderboard)
- bg image (always show)
- ceremony ready-line / title / start-hint (always show)
- Other API endpoints (only the 1 storyDetail endpoint changes)

## §3. Acceptance criteria

1. Modified files: StoryCoverScreen.vue, GeneratingScreen.vue, zh.ts/en.ts/pl.ts/ro.ts, server-v7/src/routes/story.js, possibly stores/story.ts
2. `npm run build` in tv-html passes
3. `node -e "require('./src/routes/story.js')"` smoke passes (LESSONS guideline K)
4. `firstTime` appears in GeneratingScreen.vue (1 occurrence) + StoryCoverScreen.vue (≥6 occurrences: declaration + ≥4 v-if + 1 onMounted gate)
5. `createdBy` appears in StoryCoverScreen.vue + 4 i18n files
6. Backend story.js findUnique has `include: { child: { select: { name: true } } }`
7. WO-3.9 invariant: Luna doesn't reappear in tv-html src (except dev/)
8. WO-3.10/11/13/14 invariants: mic-floating + remote-floating + prev-reply-bubble 32px still in DialogueScreen.vue

## §4. Out-of-scope

- Don't change other story-cover entries
- Don't add new TTS provider / voice
- Don't modify story-body or story-end screens
- Don't modify story playback timing
- Don't add story playCount tracking
- Don't commit (Kristy commits manually)
- Don't run end-to-end story generation tests

## §5. Red lines

- Net change ≤80 lines (4 i18n locales add ~4 lines just for strings — acceptable exception, document in commit)
- No `&&` chaining in verify subprocess
- File writes via `create_file` only
- Never `git stash`, `git reset`, `git push`, `git commit`
- Never `Always allow`

## §6. Files to touch

| File | Change | Lines |
|---|---|---|
| GeneratingScreen.vue | screen.go payload | +1/-1 |
| StoryCoverScreen.vue | template + script + style | ~+25 |
| zh.ts / en.ts / pl.ts / ro.ts | createdBy key | +1 each |
| server-v7/src/routes/story.js | include child | ~+5 |
| stores/story.ts (if needed) | Story type child field | +1 |

## §7. Verification flow

1. Factory makes patches per §2
2. Factory runs `npm run build` in tv-html and `node -e "require()"` for server-v7/src/routes/story.js
3. Factory writes report to `coordination/done/WO-3.12-report.md`
4. dingtalk-bot v2 auto-runs `WO-3.12-verify.sh`
5. If verify all-pass → Kristy runs `pm2 restart wonderbear-server` + rsync deploy + Chrome browser smoke (2 paths: first-time vs replay)

## §8. Commit message template (Factory does NOT commit)

```
feat(tv+server): WO-3.12 StoryCoverScreen first-time overlay + author display + TTS

After WO-3.10/3.11/3.13/3.14 mic redesign closed, Kristy reported StoryCoverScreen had three issues:
1. Celebration decoration (cheering bear + confetti + stars) showed on EVERY entry, but should only on first-time
2. No author name displayed
3. No TTS announcement of authorship

This commit:

- GeneratingScreen.vue: pass `{ firstTime: true }` payload when navigating to story-cover after generation completes
- StoryCoverScreen.vue: read firstTime from screen.payload, gate 4 decoration <img> elements with v-if="firstTime"
- StoryCoverScreen.vue: always show "Created by {authorName}" in ceremony block (replays + first-time both)
- StoryCoverScreen.vue: on first-time only, TTS-announce "Created by {authorName}" using existing dialogue purpose (longhuhu_v3 bear voice)
- server-v7/src/routes/story.js: add Prisma include for child.name on storyDetail endpoint
- i18n: add story.createdBy key in zh/en/pl/ro locales

Author name source is Story.childId → Child.name via Prisma JOIN — works correctly for cross-author scenarios (kid views another kid's story on Leaderboard sees the actual author, not their own name).

Verified: WO-3.12-verify.sh PASS. Browser smoke: confirmed first-time path shows celebration + TTS; Library replay path shows author text only, no celebration, no TTS.
```

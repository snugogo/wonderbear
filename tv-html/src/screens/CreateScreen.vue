<!--
  CreateScreen — "造梦工厂" (Dream Factory) creation hub.

  Entry from Home "Create" card. Lists the child's existing stories plus a
  "+" tile at slot 0 that starts the dialogue creation flow. Each story
  card shows a cover thumb with title overlay and two cartoon buttons:
  [▶ Play Full] and [+ Create Sequel].

  Focus model — flat linear list traversed left→right, row-wrapping:
    [+] [story0-play] [story0-sequel] [story1-play] [story1-sequel] …

  Dev/browser mode (?dev=1) skips the /story/list call and seeds a couple
  of demo stories so the hub is never empty in gallery previews.
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useScreenStore } from '@/stores/screen';
import { useStoryStore } from '@/stores/story';
import { useChildStore } from '@/stores/child';
import { useBgmStore } from '@/stores/bgm';
import { api, ApiError } from '@/services/api';
import { bridge } from '@/services/bridge';
import { ERR } from '@/utils/errorCodes';
import {
  useFocusable,
  setFocus,
  getCurrentFocusId,
  onFocusChange,
  type FocusableNeighbors,
} from '@/services/focus';
import { asset } from '@/utils/assets';
import { buildDemoStory } from '@/utils/demoStory';
import type { StorySummary } from '@/services/api';
import StoryCell from './CreateScreen.StoryCell.vue';

const { t } = useI18n();
const screen = useScreenStore();
const storyStore = useStoryStore();
const child = useChildStore();
const bgm = useBgmStore();

const COLUMNS = 3;
/*
 * WO-3.20 (2026-05-02): bumped to 50 — Dream Factory now shows the
 * full library on the create hub instead of just the latest 3
 * (kids hit a wall when their 4th+ story disappeared). 50 is the
 * server-side hard cap on /story/list?limit=, which is plenty for
 * the foreseeable subscription tier (5/month × 12 months = 60, and
 * pagination kicks in beyond that).
 *
 * Earlier (WO 2026-04-28 PHASE1): production fetch capped at 3.
 * Dev / gallery seeds 4 mock entries to exercise row-wrap visuals;
 * that stays untouched in the isDevBrowser branch.
 */
const PAGE_SIZE = 50;

const items = ref<StorySummary[]>([]);
const loading = ref<boolean>(true);
const mounted = ref<boolean>(true);
const focusedId = ref<string>('');

const isDevBrowser = import.meta.env.DEV
  || (typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).has('dev'));

const plusId = 'create-plus';
interface Slot {
  kind: 'plus' | 'story';
  storyIdx?: number;
  summary?: StorySummary;
}

const slots = computed<Slot[]>(() => {
  const out: Slot[] = [{ kind: 'plus' }];
  items.value.forEach((s, i) => out.push({ kind: 'story', storyIdx: i, summary: s }));
  return out;
});

/*
 * iter13d focus map per cell — three focusables stacked vertically:
 *
 *   [ thumb       ]   ← top row, arrow navigation between cells
 *   [ play | seq  ]   ← bottom row, within-cell L/R between 2 buttons
 *
 * Cross-cell: Right on thumb → next cell's thumb (or + left-edge).
 * Down from thumb → play, Up from play/seq → thumb, etc. Geometric
 * fallback handles anything not spelled out here.
 */
function thumbId(storyIdx: number): string { return `create-story-${storyIdx}-thumb`; }

/*
 * plusNeighbors is captured ONCE at register-time (before loadList finishes
 * seeding stories). We hard-point `right`/`down` at story[0]-thumb and
 * story[3]-thumb anyway — if the entry isn't registered yet when the user
 * presses a key, the key router auto-falls back to geometric search,
 * which finds the nearest cell correctly after stories mount.
 */
function plusNeighbors(): FocusableNeighbors {
  return {
    right: thumbId(0),
    down: thumbId(COLUMNS - 1), // slot COLUMNS means row 1 col 0 → story[COLUMNS-1]
  };
}

/*
 * iter13k-4: cell action row is now [play | sequel | favorite | download].
 * Neighbor chain inside a cell:
 *     play ↔ sequel ↔ favorite ↔ download
 * Right of `download` enters the next cell's thumb (or undefined if
 * we're the last cell). Left of `play` walks back to the previous
 * cell's `download` (or `+` for slot 1).
 */
function storyNeighbors(
  slotIdx: number,
  kind: 'play' | 'sequel' | 'favorite' | 'download',
): FocusableNeighbors {
  const rowSize = COLUMNS;
  const cur = slots.value[slotIdx];
  const curIdx = cur.storyIdx!;
  const id = (k: typeof kind) => `create-story-${curIdx}-${k}`;

  let left: string | undefined;
  let right: string | undefined;
  if (kind === 'play') {
    if (slotIdx === 1) left = plusId;
    else {
      const prev = slots.value[slotIdx - 1];
      left = prev.kind === 'story' ? `create-story-${prev.storyIdx}-download` : plusId;
    }
    right = id('sequel');
  } else if (kind === 'sequel') {
    left = id('play');
    right = id('favorite');
  } else if (kind === 'favorite') {
    left = id('sequel');
    right = id('download');
  } else {
    // download
    left = id('favorite');
    const nextIdx = slotIdx + 1;
    if (nextIdx < slots.value.length) {
      const next = slots.value[nextIdx];
      right = next.kind === 'story' ? thumbId(next.storyIdx!) : undefined;
    }
  }
  // Up on any action button → this cell's thumb. Down jumps a row.
  const up = thumbId(curIdx);
  const dnIdx = slotIdx + rowSize;
  const down = dnIdx < slots.value.length
    ? (slots.value[dnIdx].kind === 'plus' ? plusId : thumbId(slots.value[dnIdx].storyIdx!))
    : undefined;
  return { left, right, up, down };
}

function thumbNeighbors(slotIdx: number): FocusableNeighbors {
  const cur = slots.value[slotIdx];
  const curIdx = cur.storyIdx!;
  const rowSize = COLUMNS;
  // Left → previous cell's thumb (or + for slot 1).
  let left: string | undefined;
  if (slotIdx === 1) left = plusId;
  else {
    const prev = slots.value[slotIdx - 1];
    left = prev.kind === 'story' ? thumbId(prev.storyIdx!) : plusId;
  }
  // Right → next cell's thumb.
  const nextIdx = slotIdx + 1;
  const right = nextIdx < slots.value.length && slots.value[nextIdx].kind === 'story'
    ? thumbId(slots.value[nextIdx].storyIdx!)
    : undefined;
  // Down → this cell's Play Full button.
  const down = `create-story-${curIdx}-play`;
  // Up → prev-row's thumb (or + if prev-row is slot 0).
  const upIdx = slotIdx - rowSize;
  const up = upIdx >= 0
    ? (slots.value[upIdx].kind === 'plus' ? plusId : thumbId(slots.value[upIdx].storyIdx!))
    : undefined;
  return { left, right, up, down };
}

function startNewStory(): void {
  bridge.log('create', { event: 'plus_pressed' });
  screen.go('dialogue');
}

async function playStory(summary: StorySummary): Promise<void> {
  bridge.log('create', { event: 'play_pressed', storyId: summary.id });
  if (isDevBrowser) {
    // 2026-04-27: seed full demo (pages + dialogue) so the entire
    // playback chain (cover → body → end → learning) is reviewable.
    storyStore.active = buildDemoStory(
      {
        id: summary.id,
        title: summary.title,
        coverUrl: summary.coverUrl,
        createdAt: summary.createdAt,
        playCount: summary.playCount,
        favorited: summary.favorited,
        primaryLang: 'en',
      },
      child.activeChildId ?? 'demo-child',
    );
    storyStore.pageIndex = 0;
    screen.go('story-cover');
    return;
  }
  try {
    const { data } = await api.storyDetail(summary.id);
    storyStore.loadStory(data.story);
    screen.go('story-cover');
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ERR.INTERNAL_ERROR;
    screen.goError(code);
  }
}

function createSequel(summary: StorySummary): void {
  bridge.log('create', { event: 'sequel_pressed', storyId: summary.id });
  screen.go('dialogue', { parentStoryId: summary.id, parentTitle: summary.title });
}

/*
 * iter13k-4: optimistic local toggle for favorite/download. Server has
 * the source of truth via `api.storyFavorite` / `api.storyDownload`,
 * but we flip the summary flag immediately so the UI lights up under
 * the kid's thumb. On error we silently revert (logged via bridge).
 */
function toggleFavorite(summary: StorySummary): void {
  const next = !summary.favorited;
  summary.favorited = next;
  bridge.log('create', { event: 'favorite_pressed', storyId: summary.id, value: next });
  // Server call is best-effort — revert on failure, no toast.
  api.storyFavorite(summary.id, { favorited: next })
    .catch((err) => {
      summary.favorited = !next;
      bridge.log('create', { event: 'favorite_failed', err: String(err) });
    });
}
function downloadStory(summary: StorySummary): void {
  if (summary.downloaded) return;
  summary.downloaded = true;
  bridge.log('create', { event: 'download_pressed', storyId: summary.id });
  if (typeof (api as unknown as Record<string, unknown>).storyDownload === 'function') {
    (api as unknown as { storyDownload: (id: string) => Promise<unknown> })
      .storyDownload(summary.id)
      .catch((err) => {
        summary.downloaded = false;
        bridge.log('create', { event: 'download_failed', err: String(err) });
      });
  }
}

function backToHome(): void { screen.go('home'); }

const plusRef = ref<HTMLElement | null>(null);
useFocusable(plusRef, {
  id: plusId,
  autoFocus: true,
  neighbors: plusNeighbors(),
  onEnter: startNewStory,
  onBack: backToHome,
});

let unsubFocus: (() => void) | null = null;

async function loadList(): Promise<void> {
  if (isDevBrowser) {
    items.value = Array.from({ length: 4 }, (_, i) => ({
      id: `demo-story-${i + 1}`,
      title: ['The Brave Little Bear', 'Moon Picnic', 'Ocean Song', 'Cloud Castle'][i],
      coverUrl: '',
      createdAt: new Date().toISOString(),
      playCount: [5, 2, 0, 1][i],
      favorited: i === 0,
      primaryLang: 'en',
      downloaded: false,
    }));
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    const { data } = await api.storyList({
      childId: child.activeChildId ?? undefined,
      sort: 'newest',
      limit: PAGE_SIZE,
    });
    items.value = data.items;
  } catch (e) {
    bridge.log('create', { event: 'list_failed', err: String(e) });
    if (e instanceof ApiError && e.code !== ERR.STORY_NOT_FOUND) {
      screen.goError(e.code);
      return;
    }
    items.value = [];
  } finally {
    if (mounted.value) loading.value = false;
  }
}

onMounted(() => {
  bgm.play('home');
  focusedId.value = getCurrentFocusId() ?? '';
  unsubFocus = onFocusChange((id) => {
    if (mounted.value) focusedId.value = id ?? '';
  });
  loadList();
});

onBeforeUnmount(() => {
  mounted.value = false;
  unsubFocus?.();
});

function coverFor(s: StorySummary): string {
  if (s.coverUrl) return s.coverUrl;
  const fallbacks = [
    'bg/bg_forest.webp', 'bg/bg_seaside.webp',
    'bg/bg_meadow.webp', 'bg/bg_bedtime.webp',
  ];
  let h = 0;
  for (let i = 0; i < s.id.length; i++) h = (h * 31 + s.id.charCodeAt(i)) | 0;
  return asset(fallbacks[Math.abs(h) % fallbacks.length]);
}
</script>

<template>
  <div class="create-screen">
    <img class="bg" :src="asset('bg/bg_home_cozy.webp')" alt="" aria-hidden="true" />

    <!--
      iter13c: title sits on the watercolor with shadow only; the "Press..."
      subtitle is the only element carrying the translucent slab, tightly
      hugging its own text so the rest of the topbar stays clean.
    -->
    <header class="topbar">
      <h1 class="title wb-text-shadow">{{ t('create.title') }}</h1>
      <span class="subtitle-pill wb-text-shadow">{{ t('create.subtitle') }}</span>
    </header>

    <!--
      iter13c bug-fix: the grid + `+` tile MUST render on first mount so
      `useFocusable(plusRef)` can grab the DOM element. Previously the tile
      was hidden behind a `v-if="loading"` branch, leaving the screen with
      zero focusables → arrow/OK keys felt dead. Loading state now sits
      as a tiny corner badge, not a full-screen replacement.
    -->
    <div class="grid">
      <!--
        Plus tile (slot 0) — always rendered. h5_empty_stories bear fills
        the cell, the "+" ring is a sticker in the UPPER-RIGHT corner so
        it reads like "adding a new book onto the shelf". Deliberately NOT
        wrapped in wb-focus-feedback (that class scales the whole tile incl.
        the bear); focus feedback lives only on the .plus-ring below.
      -->
      <div
        ref="plusRef"
        class="cell plus-tile no-focus-outline"
        :class="{ 'is-focused': focusedId === plusId }"
        tabindex="0"
        @mouseenter="setFocus(plusId)"
        @click="startNewStory"
      >
        <img
          class="plus-bear"
          :src="asset('h5/h5_empty_stories.webp')"
          alt=""
          aria-hidden="true"
        />
        <div class="plus-ring">
          <div class="plus-glyph" aria-hidden="true">+</div>
        </div>
        <div class="plus-label wb-text-shadow">{{ t('create.newStory') }}</div>
      </div>

      <!-- Story cells -->
      <StoryCell
        v-for="(slot, idx) in slots.slice(1)"
        :key="slot.summary!.id"
        :slot-idx="idx + 1"
        :summary="slot.summary!"
        :cover="coverFor(slot.summary!)"
        :thumb-neighbors="thumbNeighbors(idx + 1)"
        :play-neighbors="storyNeighbors(idx + 1, 'play')"
        :sequel-neighbors="storyNeighbors(idx + 1, 'sequel')"
        :favorite-neighbors="storyNeighbors(idx + 1, 'favorite')"
        :download-neighbors="storyNeighbors(idx + 1, 'download')"
        :focused-id="focusedId"
        @play="playStory(slot.summary!)"
        @sequel="createSequel(slot.summary!)"
        @favorite="toggleFavorite(slot.summary!)"
        @download="downloadStory(slot.summary!)"
        @back="backToHome"
      />
    </div>

    <div v-if="loading" class="loading-badge wb-text-shadow-sm">
      {{ t('common.loading') }}
    </div>
  </div>
</template>

<style scoped>
.create-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-canvas);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  user-select: none;
  pointer-events: none;
  opacity: 0.9;
}
/*
 * iter13l-4: title and "Press +..." subtitle now share ONE row (title
 * on the left, subtitle pill on the right baseline-aligned). Earlier
 * column layout pushed the grid down → empty band at the bottom. Now
 * grid lifts ~50 px and breathes.
 */
.topbar {
  position: relative;
  z-index: 2;
  padding: 18px 64px 6px;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: flex-start;
  gap: 24px;
  flex-wrap: wrap;
}
.title {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 40px;
  font-weight: 800;
  margin: 0;
}
/* iter13c: only the "Press..." hint line wears the translucent pill; it's
 * the one piece of gray copy that needs the surface to stay legible. */
.subtitle-pill {
  display: inline-block;
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 20px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(15, 10, 8, 0.55);
}
.loading-badge {
  position: absolute;
  right: 24px;
  bottom: 20px;
  z-index: 4;
  padding: 6px 12px;
  background: rgba(15, 10, 8, 0.55);
  border-radius: 999px;
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 14px;
}
.grid {
  position: relative;
  z-index: 2;
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px 24px;
  /* iter13l-4: tightened top padding (12 → 4) — title row collapsed to
   * one line, so the grid can ride higher on the screen. */
  padding: 4px 64px 48px;
  align-content: start;
  overflow-y: auto;
  /*
   * WO-3.21: hide scrollbar on the Dream Factory shelf. TV remote
   * navigation never benefits from a visible scrollbar — it's both
   * ugly (cuts into the watercolor canvas) and useless (no pointer).
   * Cross-browser triple-suppression: Firefox uses scrollbar-width,
   * legacy Edge/IE uses -ms-overflow-style, Chrome/Safari/WebKit need
   * the ::-webkit-scrollbar pseudo-element with display:none.
   */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.grid::-webkit-scrollbar {
  display: none;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  transition: transform 180ms var(--ease-out);
}
/*
 * iter13f + tile layout:
 *   - No frame on the tile itself. .no-focus-outline suppresses the
 *     global [data-focused] outline/shadow so only the + ring pops.
 *   - h5_empty_stories bear fills the cell at 100% opacity.
 *   - "+" sits in the upper-right corner of the cell like you're adding
 *     a new book onto the shelf.
 *   - Ring has a translucent cream disc so the bear shows through; the
 *     "+" glyph stays solid amber.
 *   - Focus feedback: ONLY the ring scales/glows. Bear stays still.
 */
.plus-tile {
  cursor: pointer;
  align-items: stretch;
  height: 300px;
  background: transparent;
  border: 0;
  position: relative;
  overflow: visible;
}
.plus-tile.is-focused { background: transparent; }
.plus-bear {
  position: absolute;
  /* iter13f-2: 140% → 175%; iter13f-3: shifted right to 60%.
   * iter13i-4: 175% × 0.9 = 157.5% (founder asked for another 10% down). */
  width: 157.5%;
  height: 157.5%;
  left: 60%;
  top: 48%;
  transform: translate(-50%, -50%);
  object-fit: contain;
  opacity: 1;
  filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35));
  pointer-events: none;
  z-index: 0;
}
.plus-ring,
.plus-label { position: relative; z-index: 2; }
/*
 * Ring stuck to the upper-right corner of the cell — "adding to the
 * shelf". iter13f-2: ring 120 → 160 px, "+" font 72 → 110 px, both bigger.
 * `line-height: 0` on the ring + flex centering keeps the glyph
 * geometrically centered (font baselines were pushing it down before).
 */
.plus-ring {
  position: absolute;
  top: 10px;
  right: 16px;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: rgba(255, 245, 230, 0.45);
  border: 4px solid var(--c-amber);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  transition: transform var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.plus-tile.is-focused .plus-ring {
  transform: scale(1.18);
  box-shadow:
    0 0 0 4px rgba(245, 158, 11, 0.7),
    0 0 28px 8px var(--c-focus-soft),
    0 10px 30px rgba(0, 0, 0, 0.4);
}
/*
 * Kill EVERY frame source on the plus tile so only its inner .plus-ring
 * shows focus. Three suppressions are needed because the dark rect bleed
 * comes from three different layers:
 *   1. global [data-focused] outline + box-shadow
 *   2. browser-native :focus / :focus-visible outline (tabindex="0")
 *   3. any cascading background tint from wb-focus-feedback (already
 *      removed but doubly defended here)
 */
.no-focus-outline,
.no-focus-outline[data-focused='true'],
.no-focus-outline:focus,
.no-focus-outline:focus-visible {
  outline: 0 !important;
  box-shadow: none !important;
  transform: none !important;
  background: transparent !important;
  border: 0 !important;
}
.plus-label {
  position: absolute;
  bottom: 10px;
  left: 0;
  right: 0;
  text-align: center;
}
.plus-glyph {
  color: var(--c-amber);
  /* iter13f-2: bumped to 110 px to match the bigger 160 px ring. */
  font-size: 110px;
  font-weight: 800;
  line-height: 1;
  font-family: var(--ff-display);
  /* Block layout + flex parent guarantees true geometric centering — the
   * previous inline glyph was getting pushed off-axis by font baseline. */
  display: block;
  margin: 0;
  text-align: center;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
}
.plus-label {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 22px;
  font-weight: 700;
}
</style>

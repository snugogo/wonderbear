<!--
  LibraryScreen — story library with category rail (iter13k-3).
  PRD §4.5 + API_CONTRACT §7.7

  Layout:
    [ category rail | story grid ]
    Categories (left, vertical): All / Recent / Favorites / Downloads / Sequels
    Stories (right, 3-col grid): each tile = LibraryStoryCell with
      [Play | Sequel | ♥ | ↓]. Same visual language as Dream Factory
      minus the "+" tile (per founder).

  Focus:
    Category buttons → vertical chain (up/down). Right arrow from any
    category enters the first tile of the current grid. Left from a
    leftmost tile pops back to the currently selected category.
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStoryStore } from '@/stores/story';
import { useScreenStore } from '@/stores/screen';
import { useChildStore } from '@/stores/child';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { bridge } from '@/services/bridge';
import { api, ApiError } from '@/services/api';
import type { StorySummary } from '@/services/api';
import {
  useFocusable,
  setFocus,
  getCurrentFocusId,
  onFocusChange,
  type FocusableNeighbors,
} from '@/services/focus';
import { ERR } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';
import LibraryStoryCell from '@/components/LibraryStoryCell.vue';

const PAGE_SIZE = 50;
const COLUMNS = 3;

const storyStore = useStoryStore();
const screen = useScreenStore();
const child = useChildStore();
const bgm = useBgmStore();
const { t } = useI18n();

/*
 * iter13l-2: Library is now the public Story Library (故事馆) — content
 * categories instead of personal-state filters. The actual category
 * tagging on stories is a server contract TODO; until then "All" shows
 * everything and the themed categories are visual placeholders that
 * still filter client-side once stories carry a theme tag.
 */
type CategoryId = 'all' | 'adventure' | 'fairy' | 'animals' | 'friendship' | 'bedtime' | 'favorites';
/*
 * iter13l-5 / TV v1.0 §4.5: 'favorites' lives at the BOTTOM of the
 * rail (a separate "我的收藏" entry). Tapping it filters the grid
 * down to favorited stories. Placed last with the heart icon so the
 * rail reads as [content categories] → [my favorites].
 */
const categories: Array<{ id: CategoryId; i18nKey: string; isFavorites?: boolean }> = [
  { id: 'all',         i18nKey: 'library.catAll' },
  { id: 'adventure',   i18nKey: 'library.catAdventure' },
  { id: 'fairy',       i18nKey: 'library.catFairy' },
  { id: 'animals',     i18nKey: 'library.catAnimals' },
  { id: 'friendship',  i18nKey: 'library.catFriendship' },
  { id: 'bedtime',     i18nKey: 'library.catBedtime' },
  { id: 'favorites',   i18nKey: 'library.catFavorites', isFavorites: true },
];

const items = ref<StorySummary[]>([]);
const loading = ref<boolean>(true);
const total = ref<number>(0);
const activeCat = ref<CategoryId>('all');
const focusedId = ref<string>('');
let unsubFocus: (() => void) | null = null;
let mounted = true;

/*
 * iter13l-4 / TV v1.0 §3.2: Library now mirrors the Dream Factory grid
 * (3-col cells with thumb + play/sequel/♥/↓) but WITHOUT the "+" tile.
 * Same seed strategy as CreateScreen: under ?dev=1 / gallery we synthesize
 * a richer mock list so the screen never reads as "empty".
 */
const isDevBrowser = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('dev');

/*
 * iter13k-3 client-side filtering. Server returns the unfiltered list
 * for the active child; the rail just toggles which subset is shown.
 * "Recent" uses the same set sorted by createdAt desc (the server
 * already does this for sort: 'newest'). "Sequels" is a placeholder —
 * we'd need a parentStoryId field on summaries to detect them; for now
 * it shows everything (TODO: server contract).
 */
/*
 * Client-side filter. Once the server contract carries a `theme` tag
 * on StorySummary we'll filter by it here. Until then "All" is the
 * source set and themed categories also fall through to it (so the
 * grid never goes empty unintentionally during the theme rollout).
 */
const filtered = computed<StorySummary[]>(() => {
  if (activeCat.value === 'favorites') {
    return items.value.filter((s) => s.favorited);
  }
  return items.value;
});

// Cover URL with deterministic fallback when summary.coverUrl is empty
// (gallery seeds blanks). Cycles through three illustrated covers.
const fallbackCovers = [
  asset('story/story_generic_forest.webp'),
  asset('story/story_generic_ocean.webp'),
  asset('story/story_generic_sky.webp'),
];
function coverFor(s: StorySummary, idx: number): string {
  return s.coverUrl || fallbackCovers[idx % fallbackCovers.length] || '';
}

/*
 * Category neighbors: vertical chain. Right enters the first tile
 * (thumb) of the current grid. Last cat's down → first cat (no wrap).
 */
function catNeighbors(idx: number): FocusableNeighbors {
  const len = categories.length;
  const up = idx > 0 ? `library-cat-${idx - 1}` : undefined;
  const down = idx < len - 1 ? `library-cat-${idx + 1}` : undefined;
  // Right enters first tile thumb if list is non-empty.
  const right = filtered.value.length > 0 ? 'library-story-0-thumb' : undefined;
  return { up, down, right };
}

/*
 * iter13l-5: thumb is the only focusable per cell. Neighbors form a
 * clean 3-col grid; left from col 0 returns to the active category.
 */
function thumbNeighbors(cellIdx: number): FocusableNeighbors {
  const cur = filtered.value[cellIdx];
  if (!cur) return {};
  const len = filtered.value.length;
  const col = cellIdx % COLUMNS;
  const left = col === 0
    ? `library-cat-${activeCatIdx.value}`
    : `library-story-${cellIdx - 1}-thumb`;
  const right = (col < COLUMNS - 1 && cellIdx + 1 < len)
    ? `library-story-${cellIdx + 1}-thumb`
    : undefined;
  const upIdx = cellIdx - COLUMNS;
  const up = upIdx >= 0 ? `library-story-${upIdx}-thumb` : undefined;
  const dnIdx = cellIdx + COLUMNS;
  const down = dnIdx < len ? `library-story-${dnIdx}-thumb` : undefined;
  return { left, right, up, down };
}

const activeCatIdx = computed(() => categories.findIndex((c) => c.id === activeCat.value));

/*
 * Per-category focusables. We pre-allocate a Ref<HTMLElement|null> per
 * index, bind each via :ref="(el) => (catEls[i] = el as HTMLElement)"
 * in the template, then call useFocusable once per slot at setup time.
 * Cannot use a v-for inside script — useFocusable must run synchronously.
 */
const catEls: Array<import('vue').Ref<HTMLElement | null>> = categories.map(
  () => ref<HTMLElement | null>(null),
);
categories.forEach((cat, idx) => {
  useFocusable(catEls[idx]!, {
    id: `library-cat-${idx}`,
    autoFocus: idx === 0,
    neighbors: catNeighbors(idx),
    onFocus: () => { activeCat.value = cat.id; },
    onEnter: () => {
      // 2026-04-25: tapping the bottom Favorites entry now jumps into
      // the dedicated FavoritesScreen (management surface) instead of
      // just filtering the grid client-side.
      if (cat.isFavorites) {
        screen.go('favorites');
        return;
      }
      activeCat.value = cat.id;
      if (filtered.value.length > 0) setFocus('library-story-0-thumb');
    },
    onBack: () => { screen.go('home'); },
  });
});

async function loadList(): Promise<void> {
  // Dev / gallery seed: server returns 401 in browser dev, so without
  // a mock the screen sits permanently in empty state. Synthesize a
  // realistic 12-item library so reviewers can audit the grid layout
  // (Dream Factory parity, no "+" tile).
  if (isDevBrowser) {
    const titlesEn = [
      'The Brave Little Bear', 'Moon Picnic', 'Ocean Song',
      'Cloud Castle', 'Forest of Whispers', 'Sleepy Stars',
      'The Lost Kite', 'Tiny Mouse, Big Heart', 'Fairy Lantern Night',
      'Penguin Sliding Day', 'Grandma\u2019s Apple Pie', 'River of Lullabies',
    ];
    items.value = titlesEn.map((title, i) => ({
      id: `demo-story-${i + 1}`,
      title,
      coverUrl: '',
      createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
      playCount: (i * 3) % 9,
      favorited: i % 4 === 0,
      primaryLang: 'en' as const,
      downloaded: i % 5 === 0,
    }));
    total.value = items.value.length;
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
    total.value = data.total;
  } catch (e) {
    bridge.log('library', { event: 'list_failed', err: String(e) });
    if (e instanceof ApiError && e.code !== ERR.STORY_NOT_FOUND) {
      screen.goError(e.code);
      return;
    }
    items.value = [];
    total.value = 0;
  } finally {
    if (mounted) loading.value = false;
  }
}

async function openStory(storyId: string): Promise<void> {
  try {
    const { data } = await api.storyDetail(storyId);
    storyStore.loadStory(data.story);
    screen.go('story-cover');
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ERR.STORY_NOT_READY;
    screen.goError(code);
  }
}

function playStory(s: StorySummary): void { void openStory(s.id); }

onMounted(() => {
  bgm.play('home');
  void loadList();
  focusedId.value = getCurrentFocusId() ?? '';
  unsubFocus = onFocusChange((id) => {
    if (mounted) focusedId.value = id ?? '';
  });
});

onBeforeUnmount(() => {
  mounted = false;
  unsubFocus?.();
});
</script>

<template>
  <div class="library-screen">
    <!-- TV v1.0 §4.5: bg matches Dream Factory (bg_home_cozy). -->
    <img class="bg" :src="asset('bg/bg_home_cozy.webp')" alt="" aria-hidden="true" />

    <header class="topbar">
      <h1 class="title t-xl">{{ t('library.title') }}</h1>
      <div v-if="total > 0" class="capacity t-sm">
        {{ t('library.capacity', { used: total }) }}
      </div>
    </header>

    <main class="body">
      <!--
        Category rail (left). Each entry is its own focusable. Active
        category highlights via .is-active; focused entry adds .is-focused
        amber ring (via .wb-focus-feedback shared style).
      -->
      <nav class="cat-rail">
        <button
          v-for="(cat, i) in categories"
          :key="cat.id"
          :ref="(el) => { if (catEls[i]) catEls[i]!.value = el as HTMLElement | null }"
          type="button"
          class="cat-btn wb-focus-feedback"
          :class="{
            'is-active': activeCat === cat.id,
            'is-focused': focusedId === `library-cat-${i}`,
            'is-favorites': cat.isFavorites,
          }"
          @mouseenter="setFocus(`library-cat-${i}`)"
          @click="activeCat = cat.id"
        >
          <!-- TV v1.0 §4.5: heart glyph on the favorites entry. -->
          <span v-if="cat.isFavorites" class="cat-heart" aria-hidden="true">&#9829;</span>
          <span class="cat-text">{{ t(cat.i18nKey) }}</span>
        </button>
      </nav>

      <section class="grid-wrap">
        <div v-if="loading" class="loading t-md">{{ t('common.loading') }}</div>

        <div v-else-if="filtered.length === 0" class="empty">
          <img class="empty-bear" :src="asset('bear/bear_empty_box.webp')" alt="">
          <p class="empty-text t-lg">{{ t('library.empty') }}</p>
        </div>

        <div v-else class="grid">
          <LibraryStoryCell
            v-for="(s, idx) in filtered"
            :key="s.id"
            :cell-idx="idx"
            :summary="s"
            :cover="coverFor(s, idx)"
            :thumb-neighbors="thumbNeighbors(idx)"
            :focused-id="focusedId"
            @play="playStory(s)"
            @back="() => screen.go('home')"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.library-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-canvas);
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
}
.topbar, .body { position: relative; z-index: 1; }

.topbar {
  flex: 0 0 auto;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--sp-6);
  background: linear-gradient(180deg,
    rgba(26, 15, 10, 0.65) 0%,
    rgba(26, 15, 10, 0.35) 70%,
    rgba(26, 15, 10, 0) 100%);
}
.title {
  color: var(--c-cream);
  /* iter13l-5: lighter title weight (was 700) so it reads as a friendly
     section header, not a screaming H1. */
  font-weight: 500;
  letter-spacing: 0.005em;
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.capacity {
  color: var(--c-cream);
  letter-spacing: 0.06em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  opacity: 0.85;
}

.body {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 220px 1fr;
  /* min-height:0 lets the grid row honor the flex container height
     instead of growing to its content. Without this, the rail and
     grid both expand and overflow:hidden clips children unexpectedly. */
  min-height: 0;
  gap: var(--sp-5);
  padding: 8px var(--sp-6) var(--sp-6);
  overflow: hidden;
}

/*
 * iter13l-6 category rail.
 * - Pinned to the TV viewport height (no auto-stretch / no scroll).
 * - All 7 chips render in natural flow; "Favorites" is just the last
 *   chip (we removed the previous `margin-top:auto` because under
 *   flex-column it caused the upper chips to be pushed off-screen
 *   when the rail's intrinsic height equaled its content).
 * - The right-hand grid is what scrolls (see `.grid` below).
 */
.cat-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: rgba(26, 15, 10, 0.55);
  border-radius: 18px;
  backdrop-filter: blur(3px);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  align-self: start;        /* don't grow past natural rail content. */
  max-height: 100%;
}
.cat-btn {
  appearance: none;
  /* iter13l-6: shrink chip so all 7 fit comfortably in the fixed-
     height rail (TV stage 720 → body ~640 → rail content ~616). */
  flex: 0 0 auto;
  background: rgba(255, 245, 230, 0.08);
  border: 2px solid rgba(255, 200, 87, 0.25);
  color: var(--c-cream);
  padding: 10px 16px;
  border-radius: 14px;
  font-family: var(--ff-display);
  font-size: 17px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              background var(--t-fast) var(--ease-out);
}
.cat-btn.is-active {
  background: rgba(245, 158, 11, 0.22);
  border-color: var(--c-amber);
}
.cat-btn.is-focused {
  transform: scale(1.04);
  border-color: var(--c-amber);
  box-shadow:
    0 0 0 3px rgba(245, 158, 11, 0.5),
    0 0 22px 5px var(--c-focus-soft);
}
/*
 * TV v1.0 §4.5: favorites entry sits at the rail bottom and uses a
 * pink heart so it visually breaks from the content categories above.
 * iter13l-6: with `min-height:0` on rail + flex column, `margin-top:
 * auto` reliably pins favorites to the bottom of the visible rail
 * without pushing earlier chips off-screen.
 */
.cat-btn.is-favorites {
  margin-top: auto;
  border-color: rgba(255, 138, 168, 0.5);
  background: rgba(255, 138, 168, 0.12);
}
.cat-heart {
  font-size: 18px;
  color: #ff8aa8;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}
.cat-btn.is-favorites.is-active .cat-heart { color: #ff5d83; }

.grid-wrap {
  /* iter13l-6: grid-wrap matches body row height; the inner .grid is
     the scroll container so the focus glow on edge cells is never
     clipped (we let edge glow bleed via grid's own padding). */
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.loading {
  color: var(--c-cream);
  margin: auto;
  opacity: 0.85;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-4);
  margin: auto;
}
.empty-bear {
  width: 200px;
  height: 200px;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
  opacity: 0.85;
}
.empty-text {
  color: var(--c-cream);
  text-align: center;
  max-width: 600px;
  opacity: 0.85;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  /* Smaller gap because each cell already has 10px padding inside for
     the focus glow. */
  gap: 4px;
  width: 100%;
  height: 100%;
  /* TV remote → no mouse scrollbar. Focus-driven scrollIntoView keeps
     the active cell visible without a thumb. */
  overflow-y: auto;
  align-content: start;
  padding: 4px 8px var(--sp-4);
  scrollbar-width: none;          /* Firefox */
  -ms-overflow-style: none;       /* IE/old Edge */
}
.grid::-webkit-scrollbar { display: none; } /* Chrome / Safari / WebView */
</style>

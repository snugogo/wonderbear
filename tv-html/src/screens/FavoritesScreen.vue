<!--
  FavoritesScreen — 我的收藏管理
  2026-04-25 (TV v1.0).

  Entered from LibraryScreen's bottom Favorites entry. Where Library is
  a read-mostly browse view, Favorites is the *management* surface for
  the kid's hand-picked stories: each cell exposes Play Full / Create
  Sequel / Download / Delete actions in a single row beneath the thumb.

  Layout:
    [ topbar: title + count ]
    [ 2-col grid of FavoriteCell ]
    Each cell: thumbnail + title + 4-button action row
              (Play Full | Create Sequel | Download | Delete)

  Focus map (per cell, indices 0..N-1):
      fav-thumb-{i}        → enter = play full
      fav-action-{i}-0     → Play Full
      fav-action-{i}-1     → Create Sequel
      fav-action-{i}-2     → Download
      fav-action-{i}-3     → Delete

  Mock-first dev path (?dev=1 / ?gallery=1):
    - Synthesizes 6 favorited stories so the grid is reviewable
    - Actions show a soft hint ("Removed", "Downloading…") in dev mode
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStoryStore } from '@/stores/story';
import { useScreenStore } from '@/stores/screen';
import { useChildStore } from '@/stores/child';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { setLocale, getLocale, type Locale } from '@/i18n';
import { bridge } from '@/services/bridge';
import { api, ApiError } from '@/services/api';
import type { StorySummary } from '@/services/api';
import {
  setFocus,
  getCurrentFocusId,
  onFocusChange,
  type FocusableNeighbors,
} from '@/services/focus';
import { ERR } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';
import FavoriteCell from '@/components/FavoriteCell.vue';

const COLUMNS = 2;
const ACTIONS_PER_CELL = 4;

// Preview-only locale switcher pinned to the top-right of the screen.
// Lets the founder eyeball typography across languages without needing a
// gallery wrapper. Removed/hidden in production by checking dev/gallery.
const PREVIEW_LOCALES: ReadonlyArray<{ code: Locale; label: string }> = [
  { code: 'en', label: 'EN' },
  { code: 'zh', label: '中' },
  { code: 'ja', label: '日' },
  { code: 'de', label: 'DE' },
  { code: 'es', label: 'ES' },
  { code: 'pl', label: 'PL' },
];
const isDevPreview = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('dev');
const currentLocale = ref<Locale>(getLocale());
function pickLocale(loc: Locale): void {
  setLocale(loc);
  currentLocale.value = loc;
}

const storyStore = useStoryStore();
const screen = useScreenStore();
const child = useChildStore();
const bgm = useBgmStore();
const { t } = useI18n();

const items = ref<StorySummary[]>([]);
const loading = ref<boolean>(true);
const focusedId = ref<string>('');
const softHint = ref<string>('');
let softHintTimer: number | null = null;
let unsubFocus: (() => void) | null = null;
let mounted = true;

const isDevBrowser = import.meta.env.DEV
  || (typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).has('dev'));

const fallbackCovers = [
  asset('story/story_generic_forest.webp'),
  asset('story/story_generic_ocean.webp'),
  asset('story/story_generic_sky.webp'),
];
function coverFor(s: StorySummary, idx: number): string {
  return s.coverUrl || fallbackCovers[idx % fallbackCovers.length] || '';
}

function flashHint(msg: string, ms = 1800): void {
  softHint.value = msg;
  if (softHintTimer != null) window.clearTimeout(softHintTimer);
  softHintTimer = window.setTimeout(() => { softHint.value = ''; }, ms);
}

async function loadFavorites(): Promise<void> {
  if (isDevBrowser) {
    const titles = [
      'The Brave Little Bear',
      'Moon Picnic',
      'Forest of Whispers',
      'Sleepy Stars',
      'Fairy Lantern Night',
      'River of Lullabies',
    ];
    items.value = titles.map((title, i) => ({
      id: `fav-${i + 1}`,
      title,
      coverUrl: '',
      createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
      playCount: 3 + i,
      favorited: true,
      primaryLang: 'en' as const,
      downloaded: i % 2 === 0,
    }));
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const { data } = await api.storyList({
      childId: child.activeChildId ?? undefined,
      sort: 'newest',
      limit: 50,
    });
    items.value = data.items.filter((s) => s.favorited);
  } catch (e) {
    bridge.log('favorites', { event: 'list_failed', err: String(e) });
    if (e instanceof ApiError && e.code !== ERR.STORY_NOT_FOUND) {
      screen.goError(e.code);
      return;
    }
    items.value = [];
  } finally {
    if (mounted) loading.value = false;
  }
}

async function playFull(s: StorySummary): Promise<void> {
  try {
    const { data } = await api.storyDetail(s.id);
    storyStore.loadStory(data.story);
    screen.go('story-cover');
  } catch (e) {
    if (isDevBrowser) {
      flashHint(t('favorites.actions.playHint'));
      return;
    }
    const code = e instanceof ApiError ? e.code : ERR.STORY_NOT_READY;
    screen.goError(code);
  }
}

function createSequel(s: StorySummary): void {
  storyStore.clearPlayback();
  screen.go('dialogue', { sequelOfStoryId: s.id });
}

function downloadStory(s: StorySummary): void {
  if (s.downloaded) {
    flashHint(t('favorites.actions.alreadyDownloaded'));
    return;
  }
  flashHint(t('favorites.actions.downloading'));
  const idx = items.value.findIndex((x) => x.id === s.id);
  if (idx >= 0) items.value[idx] = { ...items.value[idx], downloaded: true };
}

function deleteStory(s: StorySummary): void {
  const beforeLen = items.value.length;
  items.value = items.value.filter((x) => x.id !== s.id);
  if (items.value.length < beforeLen) {
    flashHint(t('favorites.actions.removed'));
    const target = Math.max(0, Math.min(items.value.length - 1, 0));
    if (items.value.length > 0) setFocus(`fav-thumb-${target}`);
  }
}

/*
 * Focus neighbor maps. Per cell we register 5 focusables:
 *
 *   ┌──────── thumb (fav-thumb-{i}) ────────┐
 *   │                                       │
 *   └───────────────────────────────────────┘
 *   [ Play | Sequel | Download | Delete ]
 *
 * Vertical motion crosses cells AND preserves the action slot when in
 * the action row (Down on row-0 Sequel → row-1 Sequel).
 */
function thumbNeighbors(idx: number): FocusableNeighbors {
  const len = items.value.length;
  const col = idx % COLUMNS;
  const left = col > 0 ? `fav-thumb-${idx - 1}` : undefined;
  const right = (col < COLUMNS - 1 && idx + 1 < len)
    ? `fav-thumb-${idx + 1}`
    : undefined;
  const upIdx = idx - COLUMNS;
  // Up from a thumb lands on the LAST action button of the row above
  // so the path through "previous row's actions → next row's thumb"
  // walks naturally.
  const up = upIdx >= 0 ? `fav-action-${upIdx}-${ACTIONS_PER_CELL - 1}` : undefined;
  const down = `fav-action-${idx}-0`;
  return { left, right, up, down };
}
function actionNeighbors(idx: number, slot: number): FocusableNeighbors {
  const len = items.value.length;
  const left = slot > 0 ? `fav-action-${idx}-${slot - 1}` : undefined;
  const right = slot < ACTIONS_PER_CELL - 1
    ? `fav-action-${idx}-${slot + 1}`
    : undefined;
  const up = `fav-thumb-${idx}`;
  const dnIdx = idx + COLUMNS;
  const down = dnIdx < len ? `fav-thumb-${dnIdx}` : undefined;
  return { left, right, up, down };
}

const total = computed(() => items.value.length);

onMounted(() => {
  bgm.play('home');
  void loadFavorites().then(() => {
    if (items.value.length > 0) setFocus('fav-thumb-0');
  });
  focusedId.value = getCurrentFocusId() ?? '';
  unsubFocus = onFocusChange((id) => {
    if (mounted) focusedId.value = id ?? '';
  });
});

onBeforeUnmount(() => {
  mounted = false;
  unsubFocus?.();
  if (softHintTimer != null) window.clearTimeout(softHintTimer);
});
</script>

<template>
  <div class="favorites-screen">
    <img class="bg" :src="asset('bg/bg_home_cozy.webp')" alt="" aria-hidden="true" />

    <header class="topbar">
      <h1 class="title t-xl">{{ t('favorites.title') }}</h1>
      <div v-if="total > 0" class="count t-sm">
        {{ t('favorites.count', { used: total }) }}
      </div>

      <div v-if="isDevPreview" class="locale-switch" role="group" aria-label="Preview locale">
        <button
          v-for="l in PREVIEW_LOCALES" :key="l.code"
          type="button"
          class="loc-btn"
          :class="{ 'is-active': currentLocale === l.code }"
          @click="pickLocale(l.code)"
        >{{ l.label }}</button>
      </div>
    </header>

    <main class="body">
      <div v-if="loading" class="loading t-md">{{ t('common.loading') }}</div>

      <div v-else-if="items.length === 0" class="empty">
        <img class="empty-bear" :src="asset('bear/bear_empty_box.webp')" alt="" />
        <p class="empty-text t-lg">{{ t('favorites.empty') }}</p>
      </div>

      <div v-else class="grid">
        <FavoriteCell
          v-for="(s, idx) in items"
          :key="s.id"
          :idx="idx"
          :summary="s"
          :cover="coverFor(s, idx)"
          :focused-id="focusedId"
          :thumb-neighbors="thumbNeighbors(idx)"
          :action-neighbors-fn="actionNeighbors"
          @play="playFull(s)"
          @sequel="createSequel(s)"
          @download="downloadStory(s)"
          @delete="deleteStory(s)"
        />
      </div>
    </main>

    <Transition name="fade">
      <div v-if="softHint" class="soft-hint wb-text-shadow-sm" role="status">
        {{ softHint }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.favorites-screen {
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
}
.topbar {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  padding: 36px 64px 12px;
  display: flex;
  align-items: baseline;
  gap: 16px;
}
.title {
  margin: 0;
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-weight: 700;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
}
.count {
  color: var(--c-cream);
  opacity: 0.9;
  font-family: var(--ff-display);
  letter-spacing: 0.04em;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
.locale-switch {
  margin-left: auto;
  display: flex;
  gap: 6px;
  align-self: center;
}
.loc-btn {
  appearance: none;
  min-width: 44px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(26, 15, 10, 0.55);
  border: 1px solid rgba(255, 200, 87, 0.35);
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.03em;
  transition: background var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              transform var(--t-fast) var(--ease-out);
}
.loc-btn:hover {
  border-color: rgba(255, 200, 87, 0.7);
}
.loc-btn.is-active {
  background: var(--c-amber);
  color: #2a1a0a;
  border-color: var(--c-amber);
  transform: translateY(-1px);
}
.body {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  padding: 8px 56px 36px;
  display: flex;
  align-items: stretch;
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}
.body::-webkit-scrollbar { display: none; }
.loading,
.empty {
  margin: auto;
  text-align: center;
  color: var(--c-cream);
}
.empty-bear {
  width: 240px;
  height: 240px;
  object-fit: contain;
  filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45));
}
.empty-text {
  margin-top: 12px;
  font-family: var(--ff-display);
  font-weight: 600;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  width: 100%;
  align-self: start;
  align-content: start;
}

.soft-hint {
  position: absolute;
  bottom: 36px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 20px;
  font-weight: 600;
  background: rgba(26, 15, 10, 0.65);
  padding: 8px 22px;
  border-radius: 999px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}
.fade-enter-active,
.fade-leave-active { transition: opacity var(--t-base) var(--ease-out); }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>

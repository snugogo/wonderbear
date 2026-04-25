<!--
  StoryCell — used only by CreateScreen. A story thumb with title overlay
  plus FOUR cartoon action buttons:
    [▶ Play Full] [+ Create Sequel] [♥ Favorite] [↓ Download]
  iter13k-4: founder asked for ♥ + ↓ after Play/Sequel so the kid can
  curate from the Dream Factory grid without diving into Library.
-->

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useFocusable, setFocus, type FocusableNeighbors } from '@/services/focus';
import { asset } from '@/utils/assets';
import { useI18n } from 'vue-i18n';
import type { StorySummary } from '@/services/api';

const props = defineProps<{
  slotIdx: number;
  summary: StorySummary;
  cover: string;
  thumbNeighbors: FocusableNeighbors;
  playNeighbors: FocusableNeighbors;
  sequelNeighbors: FocusableNeighbors;
  favoriteNeighbors: FocusableNeighbors;
  downloadNeighbors: FocusableNeighbors;
  focusedId: string;
}>();

const emit = defineEmits<{
  (e: 'play'): void;
  (e: 'sequel'): void;
  (e: 'favorite'): void;
  (e: 'download'): void;
  (e: 'back'): void;
}>();
const { t } = useI18n();

const storyIdx = computed(() => props.slotIdx - 1);
const thumbId = computed(() => `create-story-${storyIdx.value}-thumb`);
const playId = computed(() => `create-story-${storyIdx.value}-play`);
const sequelId = computed(() => `create-story-${storyIdx.value}-sequel`);
const favoriteId = computed(() => `create-story-${storyIdx.value}-favorite`);
const downloadId = computed(() => `create-story-${storyIdx.value}-download`);

const thumbRef = ref<HTMLElement | null>(null);
const playRef = ref<HTMLElement | null>(null);
const sequelRef = ref<HTMLElement | null>(null);
const favoriteRef = ref<HTMLElement | null>(null);
const downloadRef = ref<HTMLElement | null>(null);

// Thumb acts as a "quick play" focusable: selecting the cover and hitting
// OK plays the story same as pressing the Play Full button. Down arrow
// drops into the Play button row; left/right rely on geometric fallback
// (handled globally by keyRouter) so no stale-neighbors bookkeeping.
useFocusable(thumbRef, {
  id: thumbId.value,
  neighbors: props.thumbNeighbors,
  onEnter: () => emit('play'),
  onBack: () => emit('back'),
});
useFocusable(playRef, {
  id: playId.value,
  neighbors: props.playNeighbors,
  onEnter: () => emit('play'),
  onBack: () => emit('back'),
});
useFocusable(sequelRef, {
  id: sequelId.value,
  neighbors: props.sequelNeighbors,
  onEnter: () => emit('sequel'),
  onBack: () => emit('back'),
});
useFocusable(favoriteRef, {
  id: favoriteId.value,
  neighbors: props.favoriteNeighbors,
  onEnter: () => emit('favorite'),
  onBack: () => emit('back'),
});
useFocusable(downloadRef, {
  id: downloadId.value,
  neighbors: props.downloadNeighbors,
  onEnter: () => emit('download'),
  onBack: () => emit('back'),
});
</script>

<template>
  <div class="cell story-cell">
    <div
      ref="thumbRef"
      class="thumb wb-focus-feedback"
      :class="{ 'is-focused': focusedId === thumbId }"
      tabindex="0"
      @mouseenter="setFocus(thumbId)"
      @click="emit('play')"
    >
      <img class="thumb-img" :src="cover" :alt="summary.title" />
      <div class="thumb-overlay" />
      <div class="thumb-title wb-text-shadow">{{ summary.title }}</div>
    </div>
    <div class="actions">
      <button
        ref="playRef"
        type="button"
        class="action-btn play-btn wb-focus-feedback"
        :class="{ 'is-focused': focusedId === playId }"
        @mouseenter="setFocus(playId)"
        @click="emit('play')"
      >
        <span class="icon-play wb-text-shadow-sm">&#9654;</span>
        <span class="btn-label wb-text-shadow-sm">{{ t('create.playFull') }}</span>
      </button>
      <button
        ref="sequelRef"
        type="button"
        class="action-btn sequel-btn wb-focus-feedback"
        :class="{ 'is-focused': focusedId === sequelId }"
        @mouseenter="setFocus(sequelId)"
        @click="emit('sequel')"
      >
        <span class="icon-sparkle wb-text-shadow-sm">+</span>
        <span class="btn-label wb-text-shadow-sm">{{ t('create.sequel') }}</span>
      </button>
      <!--
        iter13k-4 secondary action chips: Favorite + Download. Icon-only
        squares so they fit the row without crowding the wide Play /
        Sequel buttons. Heart fills with amber when summary.favorited.
      -->
      <button
        ref="favoriteRef"
        type="button"
        class="action-btn icon-btn wb-focus-feedback"
        :class="{
          'is-focused': focusedId === favoriteId,
          'is-active': summary.favorited,
        }"
        :aria-label="summary.favorited ? t('story.unfavorite') : t('story.favorite')"
        @mouseenter="setFocus(favoriteId)"
        @click="emit('favorite')"
      >
        <img :src="asset('ui/ui_heart_favorite.webp')" alt="" />
      </button>
      <button
        ref="downloadRef"
        type="button"
        class="action-btn icon-btn wb-focus-feedback"
        :class="{
          'is-focused': focusedId === downloadId,
          'is-active': summary.downloaded,
        }"
        :aria-label="summary.downloaded ? t('story.downloaded') : t('story.download')"
        @mouseenter="setFocus(downloadId)"
        @click="emit('download')"
      >
        <img :src="asset('ui/ui_download.webp')" alt="" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.cell {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.thumb {
  position: relative;
  width: 100%;
  height: 200px;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.25);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  transition: transform var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.thumb.is-focused {
  transform: scale(1.04);
  box-shadow:
    0 0 0 3px var(--c-amber),
    0 0 22px 4px var(--c-focus-soft);
}
.thumb-img { width: 100%; height: 100%; object-fit: cover; }
.thumb-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%);
  pointer-events: none;
}
.thumb-title {
  position: absolute;
  left: 0; right: 0; bottom: 12px;
  text-align: center;
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 22px;
  font-weight: 700;
  padding: 0 10px;
}
.actions { display: flex; gap: 8px; }
.action-btn {
  flex: 1 1 auto;
  padding: 10px 8px;
  border-radius: 14px;
  background: rgba(255, 245, 230, 0.12);
  border: 2px solid rgba(255, 200, 87, 0.35);
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 16px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.play-btn   { background: rgba(82, 199, 122, 0.18); border-color: rgba(82, 199, 122, 0.55); }
.sequel-btn { background: rgba(255, 200, 87, 0.16); border-color: rgba(255, 200, 87, 0.5); }
/*
 * iter13l-1 icon-only chips for Favorite/Download.
 *   - Bare icons (no translucent button background — the icons are real
 *     illustrated webp art, not text glyphs, so they don't need a chip
 *     bg behind them).
 *   - Larger footprint (44 → 56) so they're easy to land on.
 *   - Focus shows an amber ring around the icon outline.
 *   - is-active lights the icon amber.
 */
.icon-btn {
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
  padding: 0;
  background: transparent;
  border: 0;
}
.icon-btn img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  opacity: 0.85;
  transition: opacity var(--t-fast) var(--ease-out),
              transform var(--t-fast) var(--ease-out),
              filter var(--t-fast) var(--ease-out);
}
.icon-btn.is-active img {
  opacity: 1;
  filter: drop-shadow(0 2px 8px rgba(245, 158, 11, 0.7));
}
.icon-btn.is-focused {
  background: transparent;
  border: 0;
  box-shadow: none;
}
.icon-btn.is-focused img {
  opacity: 1;
  transform: scale(1.18);
  filter: drop-shadow(0 4px 10px rgba(245, 158, 11, 0.8));
}
/*
 * iter13c: focus style now only moves the cursor/frame — text keeps its
 * cream color + shadow so it stays readable. No more dark-on-amber swap
 * (which made the label vanish on small TVs).
 */
.action-btn.is-focused {
  transform: scale(1.06);
  border-color: var(--c-amber);
  box-shadow:
    0 0 0 3px rgba(245, 158, 11, 0.45),
    0 0 18px 4px var(--c-focus-soft);
}
.icon-play    { display: inline-block; transform: translateY(1px); }
.icon-sparkle { display: inline-block; font-weight: 900; }
</style>

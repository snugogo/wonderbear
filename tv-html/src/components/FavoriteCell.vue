<!--
  FavoriteCell — story tile used by FavoritesScreen.
  2026-04-25.

  Single cell in the 2-col favorites grid: thumbnail on top, action row
  below with [Play Full | Create Sequel | Download | Delete]. The Delete
  affordance is the key differentiator vs LibraryStoryCell — Library is
  read-mostly, Favorites is the management surface.

  Focus IDs (idx is the cell's position in the grid):
    fav-thumb-{idx}      → enter = play full
    fav-action-{idx}-0   → Play Full
    fav-action-{idx}-1   → Create Sequel
    fav-action-{idx}-2   → Download
    fav-action-{idx}-3   → Delete
-->

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFocusable, setFocus, type FocusableNeighbors } from '@/services/focus';
import type { StorySummary } from '@/services/api';
import { asset } from '@/utils/assets';

const props = defineProps<{
  idx: number;
  summary: StorySummary;
  cover: string;
  focusedId: string;
  thumbNeighbors: FocusableNeighbors;
  actionNeighborsFn: (idx: number, slot: number) => FocusableNeighbors;
}>();

const emit = defineEmits<{
  (e: 'play'): void;
  (e: 'sequel'): void;
  (e: 'download'): void;
  (e: 'delete'): void;
}>();

const { t } = useI18n();

const thumbRef = ref<HTMLElement | null>(null);
const playRef = ref<HTMLElement | null>(null);
const sequelRef = ref<HTMLElement | null>(null);
const downloadRef = ref<HTMLElement | null>(null);
const deleteRef = ref<HTMLElement | null>(null);

const ids = computed(() => ({
  thumb: `fav-thumb-${props.idx}`,
  play: `fav-action-${props.idx}-0`,
  sequel: `fav-action-${props.idx}-1`,
  download: `fav-action-${props.idx}-2`,
  delete_: `fav-action-${props.idx}-3`,
}));

useFocusable(thumbRef, {
  id: ids.value.thumb,
  neighbors: props.thumbNeighbors,
  onEnter: () => emit('play'),
});
useFocusable(playRef, {
  id: ids.value.play,
  neighbors: props.actionNeighborsFn(props.idx, 0),
  onEnter: () => emit('play'),
});
useFocusable(sequelRef, {
  id: ids.value.sequel,
  neighbors: props.actionNeighborsFn(props.idx, 1),
  onEnter: () => emit('sequel'),
});
useFocusable(downloadRef, {
  id: ids.value.download,
  neighbors: props.actionNeighborsFn(props.idx, 2),
  onEnter: () => emit('download'),
});
useFocusable(deleteRef, {
  id: ids.value.delete_,
  neighbors: props.actionNeighborsFn(props.idx, 3),
  onEnter: () => emit('delete'),
});
</script>

<template>
  <div class="fav-cell">
    <div
      ref="thumbRef"
      class="fav-thumb wb-focus-feedback"
      :class="{ 'is-focused': focusedId === ids.thumb }"
      tabindex="0"
      @mouseenter="setFocus(ids.thumb)"
      @click="emit('play')"
    >
      <img class="fav-thumb-img" :src="cover" :alt="summary.title" />
      <div class="fav-thumb-overlay" />
      <div class="fav-thumb-title wb-text-shadow">{{ summary.title }}</div>
      <div v-if="summary.downloaded" class="fav-badge fav-badge-downloaded">
        <img :src="asset('ui/ui_checkmark.webp')" alt="" />
      </div>
    </div>

    <div class="fav-actions">
      <button
        ref="playRef"
        type="button"
        class="fav-btn play-btn wb-focus-feedback"
        :class="{ 'is-focused': focusedId === ids.play }"
        @mouseenter="setFocus(ids.play)"
        @click="emit('play')"
      >
        <span class="fav-btn-icon">&#9654;</span>
        <span class="fav-btn-label">{{ t('favorites.actions.playFull') }}</span>
      </button>

      <button
        ref="sequelRef"
        type="button"
        class="fav-btn sequel-btn wb-focus-feedback"
        :class="{ 'is-focused': focusedId === ids.sequel }"
        @mouseenter="setFocus(ids.sequel)"
        @click="emit('sequel')"
      >
        <span class="fav-btn-icon">+</span>
        <span class="fav-btn-label">{{ t('favorites.actions.sequel') }}</span>
      </button>

      <button
        ref="downloadRef"
        type="button"
        class="fav-btn download-btn wb-focus-feedback"
        :class="{
          'is-focused': focusedId === ids.download,
          'is-active': summary.downloaded,
        }"
        @mouseenter="setFocus(ids.download)"
        @click="emit('download')"
      >
        <img class="fav-btn-img" :src="asset('ui/ui_download.webp')" alt="" />
        <span class="fav-btn-label">
          {{ summary.downloaded ? t('favorites.actions.downloaded') : t('favorites.actions.download') }}
        </span>
      </button>

      <button
        ref="deleteRef"
        type="button"
        class="fav-btn delete-btn wb-focus-feedback"
        :class="{ 'is-focused': focusedId === ids.delete_ }"
        @mouseenter="setFocus(ids.delete_)"
        @click="emit('delete')"
      >
        <span class="fav-btn-icon">&#10005;</span>
        <span class="fav-btn-label">{{ t('favorites.actions.delete') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.fav-cell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px;
  border-radius: 22px;
  background: rgba(26, 15, 10, 0.32);
  border: 1px solid rgba(255, 200, 87, 0.22);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.32);
}
.fav-thumb {
  position: relative;
  width: 100%;
  height: 220px;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: transform var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.fav-thumb.is-focused {
  transform: scale(1.03);
  box-shadow:
    0 0 0 3px var(--c-amber),
    0 0 22px 6px var(--c-focus-soft);
}
.fav-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fav-thumb-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, 0.6) 100%);
  pointer-events: none;
}
.fav-thumb-title {
  position: absolute;
  left: 0; right: 0; bottom: 14px;
  text-align: center;
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 0 12px;
}
.fav-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(82, 199, 122, 0.85);
  border: 2px solid rgba(255, 245, 230, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
}
.fav-badge img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.fav-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.fav-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 6px;
  border-radius: 14px;
  background: rgba(255, 245, 230, 0.12);
  border: 2px solid rgba(255, 200, 87, 0.35);
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.55);
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out),
              background var(--t-fast) var(--ease-out);
}
.fav-btn-icon { font-weight: 900; }
.fav-btn-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
}
.play-btn     { background: rgba(82, 199, 122, 0.22); border-color: rgba(82, 199, 122, 0.6); }
.sequel-btn   { background: rgba(255, 200, 87, 0.16); border-color: rgba(255, 200, 87, 0.55); }
.download-btn { background: rgba(120, 175, 255, 0.16); border-color: rgba(120, 175, 255, 0.5); }
.download-btn.is-active {
  background: rgba(82, 199, 122, 0.28);
  border-color: rgba(82, 199, 122, 0.7);
}
.delete-btn   { background: rgba(220, 90, 90, 0.18); border-color: rgba(220, 90, 90, 0.55); }
.fav-btn.is-focused {
  transform: scale(1.06);
  border-color: var(--c-amber);
  box-shadow:
    0 0 0 3px rgba(245, 158, 11, 0.55),
    0 0 18px 5px var(--c-focus-soft);
}
.fav-btn-label {
  letter-spacing: 0.02em;
}
</style>

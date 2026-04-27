<!--
  LibraryStoryCell — story tile used by LibraryScreen.

  iter13l-5 / TV v1.0 §4.5: simplified to a single focusable thumbnail.
  Per founder feedback ("界面上按键太多了"), the per-cell action row
  (Play / Sequel / Favorite / Download) was removed; the thumbnail
  itself acts as the only key — OK / click opens the story. Favorites
  are reached from a dedicated category entry on the rail, not per
  tile.
-->

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useFocusable, setFocus, type FocusableNeighbors } from '@/services/focus';
import type { StorySummary } from '@/services/api';

const props = defineProps<{
  cellIdx: number;
  summary: StorySummary;
  cover: string;
  thumbNeighbors: FocusableNeighbors;
  focusedId: string;
}>();

const emit = defineEmits<{
  (e: 'play'): void;
  (e: 'back'): void;
}>();

const thumbId = computed(() => `library-story-${props.cellIdx}-thumb`);
const thumbRef = ref<HTMLElement | null>(null);

useFocusable(thumbRef, {
  id: thumbId.value,
  neighbors: props.thumbNeighbors,
  onEnter: () => emit('play'),
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
  </div>
</template>

<style scoped>
.cell {
  /* Padding around each cell so the focus glow ring (which extends
     ~10px outside the thumb's box-shadow) is never clipped by the
     parent grid container. */
  padding: 10px;
}
.thumb {
  position: relative;
  width: 100%;
  height: 200px;
  border-radius: 18px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.25);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  transition: transform var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.thumb.is-focused {
  transform: scale(1.05);
  box-shadow:
    0 0 0 4px var(--c-amber),
    0 0 28px 8px var(--c-focus-soft);
}
.thumb-img { width: 100%; height: 100%; object-fit: cover; }
.thumb-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%);
  pointer-events: none;
}
.thumb-title {
  position: absolute;
  left: 0; right: 0; bottom: 14px;
  text-align: center;
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.01em;
  padding: 0 12px;
}
</style>

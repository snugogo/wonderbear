<!--
  StoryCard — single focusable story card used by LibraryScreen.
  Encapsulates ref binding so LibraryScreen doesn't need dynamic refs.
  Same pattern as MenuCard.vue (used by HomeScreen).
-->

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { useFocusable, getCurrentFocusId, onFocusChange } from '@/services/focus';
import type { FocusableNeighbors } from '@/services/focus';
import type { StorySummary } from '@/services/api';

interface Props {
  item: StorySummary;
  id: string;
  autoFocus?: boolean;
  neighbors?: FocusableNeighbors;
}

const props = withDefaults(defineProps<Props>(), {
  autoFocus: false,
  neighbors: () => ({}),
});

const emit = defineEmits<{ open: [id: string] }>();

const cardEl = ref<HTMLElement | null>(null);

useFocusable(cardEl, {
  id: props.id,
  autoFocus: props.autoFocus,
  neighbors: props.neighbors,
  onEnter: () => emit('open', props.item.id),
});

const focused = ref(getCurrentFocusId() === props.id);
const unsub = onFocusChange((id) => { focused.value = id === props.id; });
onBeforeUnmount(() => unsub());

const cardClasses = computed(() => ({
  'story-card': true,
  'wb-focus-feedback': true,
  'is-focused': focused.value,
}));
</script>

<template>
  <div ref="cardEl" :class="cardClasses">
    <img class="cover" :src="item.coverUrl" :alt="item.title">
    <!--
      TV_TASKS rule #1: the literal star character is a banned symbol.
      Inline SVG star renders until ui_star_filled.svg is bundled.
    -->
    <div v-if="item.favorited" class="fav-badge" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor" class="fav-star">
        <path d="M12 2l2.9 6.6 7.1.7-5.3 4.9 1.6 7-6.3-3.8L5.7 21l1.6-7L2 9.3l7.1-.7L12 2z" />
      </svg>
    </div>
    <div class="card-foot">
      <div class="card-title t-md">{{ item.title }}</div>
    </div>
  </div>
</template>

<style scoped>
.story-card {
  position: relative;
  aspect-ratio: 16 / 10;
  background: rgba(255, 245, 230, 0.06);
  border: 2px solid rgba(255, 200, 87, 0.18);
  border-radius: var(--r-lg);
  overflow: hidden;
  transition: all var(--t-fast) var(--ease-out);
  cursor: pointer;
}
/* Spring transform lives on .wb-focus-feedback.is-focused (global). */
.story-card.is-focused {
  border-color: var(--c-amber);
  box-shadow: var(--shadow-focus);
}
.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fav-badge {
  position: absolute;
  top: var(--sp-2);
  right: var(--sp-2);
  width: 44px;
  height: 44px;
  background: rgba(255, 154, 162, 0.95);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.fav-star { width: 26px; height: 26px; }
.card-foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 100%);
  padding: var(--sp-4) var(--sp-3) var(--sp-2);
}
.card-title {
  color: var(--c-cream);
  font-weight: 700;
  text-shadow: 0 2px 4px rgba(0,0,0,0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

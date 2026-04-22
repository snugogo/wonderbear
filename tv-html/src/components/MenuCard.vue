<!--
  MenuCard — single focusable menu card.
  Encapsulates ref binding so HomeScreen doesn't need dynamic refs.
-->

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { useFocusable, getCurrentFocusId, onFocusChange } from '@/services/focus';
import type { FocusableNeighbors } from '@/services/focus';

interface Props {
  id: string;
  label: string;
  emoji: string;
  enabled: boolean;
  autoFocus?: boolean;
  neighbors?: FocusableNeighbors;
  comingSoonLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  autoFocus: false,
  neighbors: () => ({}),
  comingSoonLabel: '',
});

const emit = defineEmits<{ enter: [id: string] }>();

const cardEl = ref<HTMLElement | null>(null);

useFocusable(cardEl, {
  id: props.id,
  autoFocus: props.autoFocus,
  disabled: !props.enabled,
  neighbors: props.neighbors,
  onEnter: () => {
    if (props.enabled) emit('enter', props.id);
  },
});

// Reactive focus indicator (data-focused attr is set by focus store automatically;
// this ref is for the bear-float CSS class that needs reactive binding).
const focused = ref(getCurrentFocusId() === props.id);
const unsub = onFocusChange((id) => { focused.value = id === props.id; });
onBeforeUnmount(() => unsub());

const cardClasses = computed(() => ({
  'menu-card': true,
  disabled: !props.enabled,
  'is-focused': focused.value,
}));
</script>

<template>
  <div ref="cardEl" :class="cardClasses">
    <div class="card-art" :class="{ 'bear-float': focused }">
      <span class="emoji">{{ emoji }}</span>
    </div>
    <div class="card-label t-lg">{{ label }}</div>
    <div v-if="!enabled && comingSoonLabel" class="card-soon t-sm">
      {{ comingSoonLabel }}
    </div>
  </div>
</template>

<style scoped>
.menu-card {
  position: relative;
  background: rgba(255, 245, 230, 0.06);
  border: 1px solid rgba(255, 200, 87, 0.15);
  border-radius: var(--r-lg);
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  transition: background var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              transform var(--t-fast) var(--ease-out);
  overflow: hidden;
}
.menu-card.is-focused {
  background: rgba(255, 200, 87, 0.12);
  border-color: var(--c-amber);
}
.menu-card.disabled { opacity: 0.45; }

.card-art {
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 50%;
}
.emoji { font-size: 72px; line-height: 1; }
.card-label { color: var(--c-cream); text-align: center; }
.card-soon { color: var(--c-cream-faint); font-style: italic; }
</style>

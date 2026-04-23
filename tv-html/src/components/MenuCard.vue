<!--
  MenuCard — single focusable menu card.
  Encapsulates ref binding so HomeScreen doesn't need dynamic refs.
-->

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { useFocusable, getCurrentFocusId, onFocusChange } from '@/services/focus';
import type { FocusableNeighbors } from '@/services/focus';
import { asset } from '@/utils/assets';

interface Props {
  id: string;
  label: string;
  /**
   * Letter placeholder rendered while the per-card icon asset is still in
   * NAMING_CONTRACT.md status "⏳" (e.g. ui/ui_home_create.webp). Once the
   * designer pushes the real icon, flip USE_ICON_ASSETS in HomeScreen and
   * MenuCard auto-switches to the image — no other code change needed.
   */
  letter?: string;
  /** Relative asset path, e.g. 'ui/ui_home_create.webp'. Empty uses letter. */
  icon?: string;
  enabled: boolean;
  autoFocus?: boolean;
  neighbors?: FocusableNeighbors;
  comingSoonLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  letter: '',
  icon: '',
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
  'wb-focus-feedback': true,
  disabled: !props.enabled,
  'is-focused': focused.value,
}));

const iconUrl = computed<string>(() => (props.icon ? asset(props.icon) : ''));
</script>

<template>
  <div ref="cardEl" :class="cardClasses">
    <!--
      `bear-float` keeps the original "focused card = icon bobs up and down"
      interaction (PRD §4.2 + TV_TASKS_v6 task 1 strict preservation rule).
      icon-floatable tracks the project-wide .wb-focus-feedback float rule.
    -->
    <div class="card-art icon-floatable" :class="{ 'bear-float': focused }">
      <img
        v-if="iconUrl"
        class="card-icon"
        :src="iconUrl"
        :alt="label"
      >
      <div v-else class="card-icon-placeholder" aria-hidden="true">{{ letter }}</div>
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
  /* Compact padding so 2×3 grid fits in 1280×720 with topbar + hintbar. */
  padding: var(--sp-3);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
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
  /* 140×140 fits comfortably in the 272px/row budget at 1280×720. */
  width: 140px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 50%;
  overflow: hidden;
}
.card-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}
/*
 * Letter placeholder — used until designer delivers ui/ui_home_*.webp
 * (tracked as "P0 A / 状态 ⏳" in NAMING_CONTRACT.md).
 * A warm amber disc with the card's initial letter keeps the home page
 * legible on TV at 2-3m distance without any emoji.
 */
.card-icon-placeholder {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffe4cc, #ffd9b8);
  color: #ff8a3d;
  font-size: 56px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.card-label { color: var(--c-cream); text-align: center; }
.card-soon { color: var(--c-cream-faint); font-style: italic; }
</style>

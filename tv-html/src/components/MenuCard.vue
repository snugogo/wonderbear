<!--
  MenuCard — single focusable menu card.
  Encapsulates ref binding so HomeScreen doesn't need dynamic refs.
-->

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { useFocusable, getCurrentFocusId, onFocusChange, setFocus } from '@/services/focus';
import type { FocusableNeighbors } from '@/services/focus';
import { asset } from '@/utils/assets';

/**
 * Press-pulse duration in ms — window during which .card-art carries the
 * `pressing` class so the bear icon plays the one-shot scale animation.
 * Kept short enough that the screen-transition keyframes (240ms cross-fade
 * in global.css) don't cut into the feedback arc.
 */
const PRESS_PULSE_MS = 320;

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
/**
 * 2026-04-24 Phase B iter2: one-shot "OK pressed" feedback. The bear icon
 * scales up briefly so the user gets a tactile cue even on cards that
 * navigate away immediately (the pulse starts before screen transition
 * steals focus).
 */
const pressing = ref(false);
let pressTimer: number | null = null;

useFocusable(cardEl, {
  id: props.id,
  autoFocus: props.autoFocus,
  disabled: !props.enabled,
  neighbors: props.neighbors,
  onEnter: () => {
    if (!props.enabled) return;
    pressing.value = true;
    if (pressTimer != null) window.clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => { pressing.value = false; }, PRESS_PULSE_MS);
    emit('enter', props.id);
  },
});

// Reactive focus indicator (data-focused attr is set by focus store automatically;
// this ref is for the bear-float CSS class that needs reactive binding).
const focused = ref(getCurrentFocusId() === props.id);
const unsub = onFocusChange((id) => { focused.value = id === props.id; });
onBeforeUnmount(() => {
  unsub();
  if (pressTimer != null) window.clearTimeout(pressTimer);
});

const cardClasses = computed(() => ({
  'menu-card': true,
  'wb-focus-feedback': true,
  disabled: !props.enabled,
  'is-focused': focused.value,
}));

const artClasses = computed(() => ({
  'card-art': true,
  'icon-floatable': true,
  pressing: pressing.value,
}));

const iconUrl = computed<string>(() => (props.icon ? asset(props.icon) : ''));

/**
 * iter8: dev-mode dual input — mouse hover moves the TV focus ring to the
 * hovered card (so a designer can test with a mouse without fighting the
 * TV arrow-key focus model). Click triggers the same onEnter as OK.
 */
function handleMouseEnter(): void {
  if (!props.enabled) return;
  setFocus(props.id);
}
function handleClick(): void {
  if (!props.enabled) return;
  pressing.value = true;
  if (pressTimer != null) window.clearTimeout(pressTimer);
  pressTimer = window.setTimeout(() => { pressing.value = false; }, PRESS_PULSE_MS);
  emit('enter', props.id);
}
</script>

<template>
  <div
    ref="cardEl"
    :class="cardClasses"
    @mouseenter="handleMouseEnter"
    @click="handleClick"
  >
    <!--
      iter7: label moved ABOVE the bear so the focus scale(1.2) on the ring
      no longer risks clipping the text against grid gap. The 4-way black
      stroke keeps it legible on any watercolor zone.
    -->
    <!--
      iter13c: label moves below the bear (final resolution). To prevent
      the adjacent row's focused bear from growing into this cell's label,
      the ring-focus scale is toned down to 1.08 (was 1.2). Combined with
      z-index:2 on the label the text stays legible regardless of focus.
    -->
    <div :class="artClasses">
      <div class="card-art-ring">
        <img
          v-if="iconUrl"
          class="card-icon"
          :src="iconUrl"
          :alt="label"
        >
        <div v-else class="card-icon-placeholder" aria-hidden="true">{{ letter }}</div>
      </div>
    </div>
    <div class="card-body">
      <div class="card-label">{{ label }}</div>
      <div v-if="!enabled && comingSoonLabel" class="card-soon">
        {{ comingSoonLabel }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * 2026-04-24 Phase B iter5: vertical card layout.
 * - Bear ring sits centered in the top portion of the cell.
 * - Label sits centered underneath, single line.
 * - Ring size is pinned (not % of card) so scale(1.18) on focus never
 *   reaches the cell border / neighbour card.
 * - No rectangular frame; no global focus outline; focus = ring glow only.
 */
.menu-card {
  position: relative;
  background: transparent;
  border: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* iter11: zero gap — label and ring now touch visually, they're
   * effectively one block. Bottom-row breathing room comes from the grid
   * itself having reduced row height. */
  gap: 0;
  overflow: visible;
  text-align: center;
}
/*
 * Kill the global [data-focused] rectangular outline for menu cards — the
 * amber ring on .card-art-ring is our focus indicator here, not a box.
 */
.menu-card[data-focused='true'] {
  outline: 0 !important;
  box-shadow: none !important;
}
/*
 * Disabled state ("coming soon") keeps the amber ring color so all 6 cards
 * read as one visual family. Only the "Coming soon" caption signals locked.
 */
.menu-card.disabled .card-label {
  opacity: 0.8;
}

.card-art {
  /* iter6: bigger bears — 230×230 base, focus state peaks ~276 (1.2× on the
   * ring) which is still inside the ~296 cell height after hintbar removal. */
  width: 230px;
  height: 230px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}
/*
 * Circular amber ring around the bear art.
 * - Non-focused: 3px amber border only (no glow).
 * - Focused: amber border + multi-layer amber glow.
 * Background cream disc lifts the transparent-bg bear off the watercolor bg.
 */
.card-art-ring {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  /* iter13i-2: cream white → light amber-cream (#FFF1C8 @ 72%). Reads
   * as a soft pale yellow disc, warmer than the previous near-white. */
  background: rgba(255, 241, 200, 0.72);
  /* iter3: thinner amber hairline; same color for all 6 cards. */
  border: 2px solid var(--c-focus);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transform-origin: center center;
  will-change: transform;
  transition: background var(--t-base) var(--ease-out),
              box-shadow var(--t-base) var(--ease-out),
              transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.menu-card.is-focused .card-art-ring {
  /* iter13i-2: focused state also shifts to the warm pale yellow, just
   * denser (0.92) so the focused card brightens up. */
  background: rgba(255, 241, 200, 0.92);
  /* iter13c: pop reduced 1.2 → 1.08. With label below the bear, a larger
   * scale let the bottom-row focused bear grow into the Create cell above
   * and cover its label. 1.08 is enough for a "pop" cue without intruding
   * into the next row. */
  transform: scale(1.08);
  box-shadow:
    0 0 0 2px rgba(245, 158, 11, 0.45),
    0 0 24px 4px var(--c-focus-soft),
    0 0 48px 10px rgba(245, 158, 11, 0.25);
}

.card-icon {
  /* iter3: fill the ring edge-to-edge so the bear reads larger. */
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  /* Soft warm drop shadow so the bear lifts off the cream disc. */
  filter: drop-shadow(0 6px 10px rgba(60, 42, 30, 0.3));
  transform-origin: center center;
}
/*
 * OK-press pulse — one-shot scale-up on the bear, does not block navigation.
 * Fires when user presses OK on an enabled card (see onEnter in setup).
 */
.card-art.pressing .card-icon {
  animation: card-press 320ms var(--ease-out) 1;
}
@keyframes card-press {
  0%   { transform: scale(1); }
  45%  { transform: scale(1.28); }
  70%  { transform: scale(1.1); }
  100% { transform: scale(1); }
}
/*
 * Letter placeholder — used if a ui/ui_home_*.webp is still missing.
 * All 6 contract icons are live so this code path should never render;
 * kept as a defensive fallback (no emoji per NAMING_CONTRACT rule #1).
 */
.card-icon-placeholder {
  width: 80%;
  height: 80%;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffe4cc, #ffd9b8);
  color: #ff8a3d;
  font-size: 72px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.card-body {
  /* iter13c: label BELOW bear. z-index:2 + smaller focus scale (1.08)
   * together guarantee the adjacent row's popped bear can never cover
   * this cell's label. margin-top:-4px tucks the label close to the
   * bear's feet. */
  position: relative;
  z-index: 2;
  margin-top: -4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  max-width: 100%;
}
.card-art { position: relative; z-index: 1; }
/*
 * Label — cream text with a hard 4-way black stroke + soft glow.
 * Focused state swaps stroke color to amber + adds amber glow,
 * matching the circular bear ring language.
 */
.card-label {
  /* iter8: 32 px for TV readability. Label above bear so focus scale safe. */
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.02em;
  white-space: nowrap;
  text-align: center;
  text-shadow:
    -2px -2px 0 #000000,
     2px -2px 0 #000000,
    -2px  2px 0 #000000,
     2px  2px 0 #000000,
     0 3px 6px rgba(0, 0, 0, 0.4);
  transition: text-shadow var(--t-base) var(--ease-out);
}
.menu-card.is-focused .card-label {
  text-shadow:
    -2px -2px 0 var(--c-focus),
     2px -2px 0 var(--c-focus),
    -2px  2px 0 var(--c-focus),
     2px  2px 0 var(--c-focus),
     0 0 12px var(--c-focus-glow),
     0 0 28px var(--c-focus-soft);
}
.card-soon {
  font-family: var(--ff-display);
  color: var(--c-cream-soft);
  font-size: 20px;
  font-style: italic;
  white-space: nowrap;
  text-align: center;
  text-shadow:
    -1px -1px 0 #000000,
     1px -1px 0 #000000,
    -1px  1px 0 #000000,
     1px  1px 0 #000000;
}
</style>

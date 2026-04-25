<!--
  StoryEndScreen — story finale (PRD §4.4 + §6.1).

  Behavior:
    - bgm.play('story_ending') → bgm store sees volume 0 and stops BGM (closure feel)
    - bear_happy bow animation
    - 2026-04-25 iter: trio of cartoon-style action buttons matching the
      Story Library cell vocabulary:
        [Play Again] (green primary) · [Favorite] (icon+label, amber when on)
        · [Create Sequel] (amber, jumps into dialogue flow)
      "Back to library" was retired — Back hardware key already returns
      from this terminal screen.
    - "Play again" = reset story playback to page 0 → screen.go('story-body')
    - "Create sequel" = screen.go('dialogue') seeded with current story
    - "Favorite" = local toggle (will persist via favorites store once
      the API/store is wired)

  Hard rules respected:
    - All focusables registered with explicit neighbors (no geometric drift)
    - No <audio>; bgm via bridge
-->

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

/**
 * iter10 — real bow animation: we have TWO frames (standing `bear_idle` and
 * `bear_bow_curtain` deep-bow). Alternating them every ~900ms gives a proper
 * repeating stage bow without relying on CSS transforms to pseudo-bow a
 * static image.
 */
const bowing = ref(false);
let bowTimer: number | null = null;
function startBowLoop(): void {
  if (bowTimer != null) return;
  bowTimer = window.setInterval(() => {
    bowing.value = !bowing.value;
  }, 900);
}
function stopBowLoop(): void {
  if (bowTimer != null) { window.clearInterval(bowTimer); bowTimer = null; }
}
import { useStoryStore } from '@/stores/story';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { useFocusable, getCurrentFocusId, onFocusChange } from '@/services/focus';
import { asset } from '@/utils/assets';

const storyStore = useStoryStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

const playAgainEl = ref<HTMLElement | null>(null);
const favoriteEl = ref<HTMLElement | null>(null);
const sequelEl = ref<HTMLElement | null>(null);
const focusedId = ref<string>('');
const isFavorited = ref<boolean>(false);
let unsubFocus: (() => void) | null = null;
let mounted = true;

function playAgain(): void {
  if (!storyStore.active) {
    screen.go('library');
    return;
  }
  // Re-load the same story from page 0 — loadStory resets pageIndex.
  storyStore.loadStory(storyStore.active);
  screen.go('story-body');
}

function toggleFavorite(): void {
  // Local toggle only for now — favorites store / API wiring lands in a
  // follow-up. The amber heart state still gives the kid the "yes I
  // liked it" feedback they expect.
  isFavorited.value = !isFavorited.value;
}

function createSequel(): void {
  // Sequel = re-enter the 7-round dialogue flow seeded with this story.
  // The seeding payload (parent storyId) will be picked up by the
  // dialogue store on mount when that wiring lands.
  storyStore.clearPlayback();
  screen.go('dialogue', { sequelOfStoryId: storyStore.active?.id ?? null });
}

useFocusable(playAgainEl, {
  id: 'end-play-again',
  autoFocus: true,
  neighbors: { right: 'end-favorite' },
  onEnter: playAgain,
});

useFocusable(favoriteEl, {
  id: 'end-favorite',
  neighbors: { left: 'end-play-again', right: 'end-sequel' },
  onEnter: toggleFavorite,
});

useFocusable(sequelEl, {
  id: 'end-sequel',
  neighbors: { left: 'end-favorite' },
  onEnter: createSequel,
});

onMounted(() => {
  // §6.1: 'story_ending' scene maps to volume 0 → bgm.play() will call stop()
  // (per bgm store SCENE_VOLUMES table). This gives the kid a "the story is done" beat.
  bgm.play('story_ending');

  focusedId.value = getCurrentFocusId() ?? '';
  unsubFocus = onFocusChange((id) => {
    if (mounted) focusedId.value = id ?? '';
  });

  startBowLoop();
});

onBeforeUnmount(() => {
  mounted = false;
  unsubFocus?.();
  stopBowLoop();
});
</script>

<template>
  <div class="end-screen">
    <img class="bg" :src="asset('bg/bg_bedtime.webp')" alt="" aria-hidden="true">

    <div class="content">
      <div class="bear-wrap">
        <!-- iter11: the bowing bear is the whole show — no decor overlays. -->
        <img
          class="bear bear-bow"
          :src="asset(bowing ? 'bear/bear_bow_curtain.webp' : 'bear/bear_idle.webp')"
          alt=""
        >
      </div>

      <h1 class="finished t-2xl wb-text-shadow">{{ t('story.finished') }}</h1>

      <div class="actions">
        <button
          ref="playAgainEl"
          class="action-btn play-btn wb-focus-feedback"
          :class="{ 'is-focused': focusedId === 'end-play-again' }"
          type="button"
          @click="playAgain"
        >
          <span class="icon-play wb-text-shadow-sm">&#9654;</span>
          <span class="btn-label">{{ t('story.playAgain') }}</span>
        </button>
        <button
          ref="favoriteEl"
          class="action-btn favorite-btn wb-focus-feedback"
          :class="{
            'is-focused': focusedId === 'end-favorite',
            'is-active': isFavorited,
          }"
          type="button"
          @click="toggleFavorite"
        >
          <img
            class="favorite-icon"
            :src="asset('ui/ui_heart_favorite.webp')"
            alt=""
          />
          <span class="btn-label">
            {{ isFavorited ? t('library.favorited') : t('story.favorite') }}
          </span>
        </button>
        <button
          ref="sequelEl"
          class="action-btn sequel-btn wb-focus-feedback"
          :class="{ 'is-focused': focusedId === 'end-sequel' }"
          type="button"
          @click="createSequel"
        >
          <span class="icon-sparkle wb-text-shadow-sm">+</span>
          <span class="btn-label">{{ t('story.endSequel') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.end-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-deep);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 1;
  z-index: 0;
  user-select: none;
  pointer-events: none;
}

.content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-5);
  padding: var(--sp-6);
}

.bear-wrap {
  /* TV_TASKS v1.1 P0-3: 280 -> 420 for the curtain-call bear. */
  position: relative;
  width: 420px;
  height: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bear {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 16px 32px rgba(0, 0, 0, 0.45));
  transform-origin: bottom center;
}
.bear-bow {
  /* Frame-swap animation driven by JS (bowing ref); CSS only softens the
   * transition between standing and bowing poses. */
  transition: transform 250ms ease-out;
}
.hearts {
  position: absolute;
  inset: -40px;
  width: calc(100% + 80px);
  height: calc(100% + 80px);
  object-fit: contain;
  opacity: 0.6;
  pointer-events: none;
  animation: hearts-rise 5s ease-in-out infinite alternate;
}
@keyframes hearts-rise {
  0%   { transform: translateY(0) scale(1); opacity: 0.45; }
  100% { transform: translateY(-24px) scale(1.05); opacity: 0.75; }
}
.confetti {
  position: absolute;
  inset: -30px;
  width: calc(100% + 60px);
  height: calc(100% + 60px);
  object-fit: contain;
  opacity: 0.7;
  pointer-events: none;
  animation: confetti-spin 6s linear infinite;
}
@keyframes confetti-spin {
  0%   { transform: rotate(0deg) scale(1); opacity: 0.55; }
  50%  { transform: rotate(180deg) scale(1.05); opacity: 0.8; }
  100% { transform: rotate(360deg) scale(1); opacity: 0.55; }
}

.finished {
  color: var(--c-cream);
  font-weight: 700;
  margin: 0;
  text-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  letter-spacing: 0.04em;
}

.actions {
  display: flex;
  gap: var(--sp-3);
  margin-top: var(--sp-3);
  align-items: stretch;
}

/*
 * 2026-04-25 iter — cartoon-style action buttons matching
 * CreateScreen.StoryCell vocabulary so Story End reads as part of the
 * same gesture family as the Story Library cells.
 *   - .play-btn     : green tint, primary action
 *   - .favorite-btn : amber-tinted with heart icon, lights up when active
 *   - .sequel-btn   : amber tint with sparkle "+" icon
 * All three share the same base shape (rounded slab, drop shadow, focus
 * ring) so they line up neatly in a row.
 */
.action-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 28px;
  border-radius: var(--r-lg);
  background: rgba(255, 245, 230, 0.12);
  border: 2px solid rgba(255, 200, 87, 0.35);
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  min-width: 220px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out),
              background var(--t-fast) var(--ease-out);
}
.action-btn .btn-label {
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.55);
}
.play-btn {
  background: rgba(82, 199, 122, 0.22);
  border-color: rgba(82, 199, 122, 0.6);
}
.favorite-btn {
  background: rgba(255, 200, 87, 0.14);
  border-color: rgba(255, 200, 87, 0.45);
}
.favorite-btn.is-active {
  background: rgba(245, 158, 11, 0.32);
  border-color: var(--c-amber);
}
.favorite-btn .favorite-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  opacity: 0.85;
  transition: opacity var(--t-fast) var(--ease-out),
              filter var(--t-fast) var(--ease-out);
}
.favorite-btn.is-active .favorite-icon {
  opacity: 1;
  filter: drop-shadow(0 2px 8px rgba(245, 158, 11, 0.85));
}
.sequel-btn {
  background: rgba(255, 200, 87, 0.16);
  border-color: rgba(255, 200, 87, 0.55);
}
.icon-play    { display: inline-block; transform: translateY(1px); font-size: 20px; }
.icon-sparkle { display: inline-block; font-weight: 900; font-size: 26px; line-height: 1; }

.action-btn.is-focused {
  transform: scale(1.08);
  border-color: var(--c-amber);
  box-shadow:
    0 0 0 3px rgba(245, 158, 11, 0.55),
    0 0 22px 6px var(--c-focus-soft);
}
</style>

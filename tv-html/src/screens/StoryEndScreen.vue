<!--
  StoryEndScreen — story finale (PRD §4.4 + §6.1).

  Behavior:
    - bgm.play('story_ending') → bgm store sees volume 0 and stops BGM (closure feel)
    - bear_happy bow animation
    - Two focusable buttons: [Play again] / [Back to library]
    - "Play again" = reset story playback to page 0 → screen.go('story-body')
    - "Back to library" = clear playback + screen.go('library')

  Hard rules respected:
    - All focusables registered with explicit neighbors (no geometric drift)
    - No <audio>; bgm via bridge
-->

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
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
const libraryEl = ref<HTMLElement | null>(null);
const focusedId = ref<string>('');
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

function backToLibrary(): void {
  storyStore.clearPlayback();
  screen.go('library');
}

useFocusable(playAgainEl, {
  id: 'end-play-again',
  autoFocus: true,
  neighbors: { right: 'end-library' },
  onEnter: playAgain,
});

useFocusable(libraryEl, {
  id: 'end-library',
  neighbors: { left: 'end-play-again' },
  onEnter: backToLibrary,
});

onMounted(() => {
  // §6.1: 'story_ending' scene maps to volume 0 → bgm.play() will call stop()
  // (per bgm store SCENE_VOLUMES table). This gives the kid a "the story is done" beat.
  bgm.play('story_ending');

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
  <div class="end-screen">
    <img class="bg" :src="asset('bg/bg_bedtime.webp')" alt="" aria-hidden="true">

    <div class="content">
      <div class="bear-wrap">
        <img class="bear bear-bow" :src="asset('bear/bear_happy.webp')" alt="">
        <img
          class="confetti"
          :src="asset('deco/deco_confetti.webp')"
          alt=""
          aria-hidden="true"
        >
      </div>

      <h1 class="finished t-2xl">{{ t('story.finished') }}</h1>

      <div class="actions">
        <button
          ref="playAgainEl"
          class="action-btn primary"
          :class="{ 'is-focused': focusedId === 'end-play-again' }"
          type="button"
          @click="playAgain"
        >
          <span class="t-lg">{{ t('story.playAgain') }}</span>
        </button>
        <button
          ref="libraryEl"
          class="action-btn"
          :class="{ 'is-focused': focusedId === 'end-library' }"
          type="button"
          @click="backToLibrary"
        >
          <span class="t-lg">{{ t('story.backToLibrary') }}</span>
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
  opacity: 0.55;
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
  position: relative;
  width: 280px;
  height: 280px;
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
  animation: bear-bow 2.4s var(--ease-out) infinite;
}
@keyframes bear-bow {
  0%, 100% { transform: rotate(0deg) translateY(0); }
  35%      { transform: rotate(-8deg) translateY(-4px); }
  55%      { transform: rotate(0deg) translateY(0); }
  70%      { transform: rotate(-5deg) translateY(-2px); }
  85%      { transform: rotate(0deg) translateY(0); }
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
  gap: var(--sp-4);
  margin-top: var(--sp-3);
}

.action-btn {
  appearance: none;
  background: rgba(255, 245, 230, 0.08);
  border: 2px solid rgba(255, 200, 87, 0.25);
  color: var(--c-cream);
  padding: var(--sp-3) var(--sp-6);
  border-radius: var(--r-lg);
  cursor: pointer;
  transition: all var(--t-fast) var(--ease-out);
  min-width: 220px;
  font-family: inherit;
}
.action-btn.primary {
  background: rgba(255, 200, 87, 0.18);
  border-color: var(--c-amber-soft);
}
.action-btn.is-focused {
  background: var(--c-amber);
  border-color: var(--c-amber);
  color: #1a0f0a;
  transform: translateY(-2px) scale(1.04);
  box-shadow: var(--shadow-focus);
}
</style>

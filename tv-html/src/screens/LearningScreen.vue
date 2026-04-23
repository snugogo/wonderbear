<!--
  LearningScreen — reading mode, 60px subtitles + per-page TTS replay.
  PRD §4.4 reading mode.

  Phase 1 limitations:
    - Per-character TTS endpoint not in API_CONTRACT yet → no per-char highlight
    - This screen shows the *current page* of the active story with very large
      subtitles, and OK replays that page's TTS.
    - Switch in/out via the bridge "🔤" key (mapped to 'reading-key' bridge event)
      is deferred — for now this screen is reached from a future H5 setting or
      from dev console "Jump screen".

  When per-char TTS contract lands, upgrade this to:
    - parse page text into characters
    - on OK, fetch /api/tts/synthesize per character
    - highlight + play each character

  For now: large primary text + secondary text + bear_pointing + repeat button.
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStoryStore } from '@/stores/story';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { bridge } from '@/services/bridge';
import { useFocusable, getCurrentFocusId, onFocusChange } from '@/services/focus';
import { ERR } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';

const storyStore = useStoryStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

const replayEl = ref<HTMLElement | null>(null);
const exitEl = ref<HTMLElement | null>(null);
const focusedId = ref<string>('');
let unsubFocus: (() => void) | null = null;
let mounted = true;

const story = computed(() => storyStore.active);
const currentPage = computed(() => storyStore.currentPage);
const pageIndex = computed(() => storyStore.pageIndex);
const totalPages = computed(() => storyStore.active?.pages.length ?? 0);

function replayPage(): void {
  const page = currentPage.value;
  if (!page) return;
  bridge.stopTts();
  if (page.ttsUrl) {
    bridge.playTts(page.ttsUrl);
  }
}

function exitReading(): void {
  bridge.stopTts();
  if (storyStore.active) {
    screen.go('story-body');
  } else {
    screen.go('home');
  }
}

useFocusable(replayEl, {
  id: 'learning-replay',
  autoFocus: true,
  neighbors: { right: 'learning-exit' },
  onEnter: replayPage,
});
useFocusable(exitEl, {
  id: 'learning-exit',
  neighbors: { left: 'learning-replay' },
  onEnter: exitReading,
});

onMounted(() => {
  if (!storyStore.active) {
    bridge.log('learning', { event: 'mounted_without_active_story' });
    screen.goError(ERR.STORY_NOT_FOUND);
    return;
  }

  bgm.play('learning'); // §6.1 mapped to volume 0 → effectively silent
  storyStore.toggleLearningMode();

  // Auto-play current page TTS on mount
  replayPage();

  focusedId.value = getCurrentFocusId() ?? '';
  unsubFocus = onFocusChange((id) => {
    if (mounted) focusedId.value = id ?? '';
  });
});

onBeforeUnmount(() => {
  mounted = false;
  bridge.stopTts();
  unsubFocus?.();
  if (storyStore.learningMode) storyStore.toggleLearningMode();
});
</script>

<template>
  <div class="learning-screen">
    <!--
      TV_TASKS v1.1 P0-1: bg_meadow provides a calm, focused green field
      for reading mode. Previously we re-used the current page image with a
      blur filter, which violated the "no filter animations / no blur on
      low-end GP15" rule (static blur still forces a large render buffer).
    -->
    <img class="bg-image" :src="asset('bg/bg_meadow.webp')" alt="" aria-hidden="true" />

    <div class="overlay" />

    <header class="topbar">
      <div class="page-counter t-md">
        {{ t('story.pageOf', { current: pageIndex + 1, total: totalPages }) }}
      </div>
      <div v-if="story" class="story-title t-md">{{ story.title }}</div>
    </header>

    <main class="reader">
      <img
        class="bear-pointer"
        :src="asset('bear/bear_pointing.webp')"
        alt=""
        aria-hidden="true"
      >

      <div v-if="currentPage" class="reader-text">
        <p class="reader-primary">{{ currentPage.text }}</p>
        <p
          v-if="currentPage.textLearning"
          class="reader-secondary"
        >
          {{ currentPage.textLearning }}
        </p>
      </div>
    </main>

    <footer class="actions">
      <button
        ref="replayEl"
        class="action-btn primary wb-focus-feedback"
        :class="{ 'is-focused': focusedId === 'learning-replay' }"
        type="button"
        @click="replayPage"
      >
        <img class="btn-icon" :src="asset('ui/ui_player_play.webp')" alt="">
        <span class="t-lg">{{ t('common.retry') }}</span>
      </button>
      <button
        ref="exitEl"
        class="action-btn wb-focus-feedback"
        :class="{ 'is-focused': focusedId === 'learning-exit' }"
        type="button"
        @click="exitReading"
      >
        <span class="t-lg">{{ t('error.backHome') }}</span>
      </button>
    </footer>
  </div>
</template>

<style scoped>
.learning-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-deep);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.bg-image {
  /* No filter: GP15 can't afford blur() — already a static PNG bg. */
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.45;
  user-select: none;
  pointer-events: none;
}

.overlay {
  position: absolute;
  inset: 0;
  background: rgba(26, 15, 10, 0.55);
  pointer-events: none;
}

.topbar {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--sp-6);
}
.page-counter {
  color: var(--c-amber);
  background: rgba(0,0,0,0.45);
  padding: var(--sp-1) var(--sp-3);
  border-radius: 999px;
  letter-spacing: 0.08em;
}
.story-title { color: var(--c-cream-soft); }

.reader {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-5);
  padding: var(--sp-5) var(--sp-6);
}

.bear-pointer {
  width: 180px;
  height: 180px;
  object-fit: contain;
  flex: 0 0 auto;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
}

.reader-text {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  max-width: 800px;
}
.reader-primary {
  color: var(--c-cream);
  font-size: 60px;
  font-weight: 800;
  margin: 0;
  line-height: 1.3;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
  letter-spacing: 0.02em;
}
.reader-secondary {
  color: var(--c-cream-soft);
  font-size: 32px;
  font-style: italic;
  margin: 0;
  line-height: 1.4;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
}

.actions {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-6);
}

.action-btn {
  appearance: none;
  background: rgba(255, 245, 230, 0.08);
  border: 2px solid rgba(255, 200, 87, 0.25);
  color: var(--c-cream);
  padding: var(--sp-3) var(--sp-5);
  border-radius: var(--r-lg);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-family: inherit;
  min-width: 200px;
  justify-content: center;
  transition: all var(--t-fast) var(--ease-out);
}
.action-btn.primary {
  background: rgba(255, 200, 87, 0.18);
  border-color: var(--c-amber-soft);
}
/* Spring transform lives on .wb-focus-feedback.is-focused (global). */
.action-btn.is-focused {
  background: var(--c-amber);
  border-color: var(--c-amber);
  color: #1a0f0a;
  box-shadow: var(--shadow-focus);
}
.btn-icon { width: 28px; height: 28px; object-fit: contain; }
</style>

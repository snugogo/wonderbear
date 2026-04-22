<!--
  StoryBodyScreen — page-by-page story playback (PRD §4.4).

  Server contract: API_CONTRACT.md §7.6 / §7.10
    - Story.pages[].pageNum is 1-based, .text is primary, .textLearning is optional secondary
    - .ttsUrl can be null (client falls back: just shows text, auto-advance after a fixed beat)
    - storyPlayStat events: 'start' | 'page_end' | 'complete' | 'abort'
      - start:    fired on mount
      - page_end: fired each time a page advances, with pageNum + durationMs
      - complete: fired when reaching the last page successfully
      - abort:    fired on unmount before completion

  Memory management (PRD §4.3, kickoff §一硬规则 1):
    Only the CURRENT page image is kept mounted in DOM (v-if + :key="pageIndex").
    Previous page is unmounted before the next page's image loads.
    Transition mode='out-in' guarantees ordering and runs the 400ms cross-fade.
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStoryStore } from '@/stores/story';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { bridge } from '@/services/bridge';
import { useFocusable } from '@/services/focus';
import { api } from '@/services/api';
import { ERR } from '@/utils/errorCodes';

const storyStore = useStoryStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

const okCaptureEl = ref<HTMLElement | null>(null);
let mounted = true;
let unsubTtsEnd: (() => void) | null = null;
let advanceGuard = false;
let pageStartedAt = 0;
let completed = false;

const story = computed(() => storyStore.active);
const currentPage = computed(() => storyStore.currentPage);
const pageIndex = computed(() => storyStore.pageIndex);
const totalPages = computed(() => storyStore.active?.pages.length ?? 0);

function nowIso(): string { return new Date().toISOString(); }

function fireStat(payload: {
  event: 'start' | 'page_end' | 'complete' | 'abort';
  pageNum?: number;
  durationMs?: number;
}): void {
  if (!story.value) return;
  api.storyPlayStat(story.value.id, {
    ...payload,
    timestamp: nowIso(),
  }).catch((err) => {
    bridge.log('story-body', { event: 'play_stat_failed', err: String(err) });
  });
}

function playCurrentPage(): void {
  const page = currentPage.value;
  if (!page) return;
  pageStartedAt = Date.now();
  if (page.ttsUrl) {
    advanceGuard = false;
    bridge.playTts(page.ttsUrl);
  } else {
    // No TTS URL — fall back to a fixed reading beat so the kid isn't stuck.
    // Estimate: 3.5s minimum + 60ms per visible character of primary text.
    const fallbackMs = Math.min(12000, 3500 + page.text.length * 60);
    advanceGuard = false;
    window.setTimeout(() => { if (mounted) advance(); }, fallbackMs);
  }
}

function advance(): void {
  if (!mounted) return;
  if (advanceGuard) return;
  advanceGuard = true;

  bridge.stopTts();
  const durationMs = Date.now() - pageStartedAt;
  const finishedPage = currentPage.value;
  if (finishedPage) {
    fireStat({ event: 'page_end', pageNum: finishedPage.pageNum, durationMs });
  }

  if (storyStore.isLastPage) {
    completed = true;
    fireStat({ event: 'complete' });
    screen.go('story-end');
    return;
  }

  const moved = storyStore.nextPage();
  if (moved) {
    // Wait for the 400ms cross-fade transition (mode='out-in') to complete the
    // out animation and unmount the old page node before loading the new image.
    window.setTimeout(() => {
      if (mounted) playCurrentPage();
    }, 420);
  }
}

useFocusable(okCaptureEl, {
  id: 'body-ok-capture',
  autoFocus: true,
  onEnter: () => { advance(); },
});

onMounted(() => {
  if (!storyStore.active) {
    bridge.log('story-body', { event: 'mounted_without_active_story' });
    screen.goError(ERR.STORY_NOT_FOUND);
    return;
  }

  bgm.play('story_body');
  fireStat({ event: 'start' });

  unsubTtsEnd = bridge.on('tts-end', () => {
    if (!mounted) return;
    advance();
  });

  playCurrentPage();
});

onBeforeUnmount(() => {
  mounted = false;
  bridge.stopTts();
  unsubTtsEnd?.();
  if (!completed) {
    fireStat({ event: 'abort' });
  }
});
</script>

<template>
  <div class="body-screen">
    <Transition name="page" mode="out-in">
      <div
        v-if="currentPage"
        :key="pageIndex"
        class="page"
      >
        <img
          class="page-image"
          :src="currentPage.imageUrl"
          :alt="currentPage.text"
        >

        <div class="subtitle-area">
          <div class="subtitle-bg" />
          <div class="subtitles">
            <p class="t-lg subtitle-primary">{{ currentPage.text }}</p>
            <p
              v-if="currentPage.textLearning"
              class="t-md subtitle-secondary"
            >
              {{ currentPage.textLearning }}
            </p>
          </div>
        </div>

        <div class="page-counter t-sm">
          {{ t('story.pageOf', { current: pageIndex + 1, total: totalPages }) }}
        </div>
      </div>
    </Transition>

    <div ref="okCaptureEl" class="ok-capture" tabindex="-1" aria-hidden="true" />
  </div>
</template>

<style scoped>
.body-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-deep);
  overflow: hidden;
}

.page {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.page-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}

.subtitle-area {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  min-height: 140px;
  padding: var(--sp-4) var(--sp-6) var(--sp-5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.subtitle-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.45) 35%,
    rgba(0, 0, 0, 0.78) 100%
  );
  pointer-events: none;
}
.subtitles {
  position: relative;
  text-align: center;
  max-width: 1100px;
}
.subtitle-primary {
  color: var(--c-cream);
  font-weight: 700;
  margin: 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.85);
  line-height: 1.4;
}
.subtitle-secondary {
  color: var(--c-cream-soft);
  font-style: italic;
  margin: var(--sp-2) 0 0;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.85);
  line-height: 1.4;
}

.page-counter {
  position: absolute;
  top: var(--sp-3);
  right: var(--sp-5);
  color: var(--c-cream);
  background: rgba(0, 0, 0, 0.45);
  padding: var(--sp-1) var(--sp-3);
  border-radius: 999px;
  letter-spacing: 0.08em;
}

.page-enter-active, .page-leave-active {
  transition: opacity var(--t-slow) var(--ease-out);
}
.page-enter-from, .page-leave-to {
  opacity: 0;
}

.ok-capture {
  position: absolute;
  top: 0; left: 0;
  width: 1px; height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>

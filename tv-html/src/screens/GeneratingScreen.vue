<!--
  GeneratingScreen — wait for AI to paint the story.
  PRD §4.3 step ③.

  Server contract: API_CONTRACT.md §7.5 (git authoritative)
    - GET /story/:id/status returns:
      { storyId, status: 'queued'|'generating'|'completed'|'failed',
        progress: { stage, pagesGenerated, totalPages:12, percent },
        error?: { code, message, retriable } | null,
        completedAt?: string | null }
    - Poll every 2s, max 120s, then treat as failed.

  Behavior:
    - On status='completed' → fetch storyDetail, hand to storyStore, navigate to story-cover
    - On status='failed'    → screen.goError(error.code ?? STORY_GEN_FAILED)
    - Show bear_paint sprite + percent progress + elapsed seconds + stage label
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStoryStore } from '@/stores/story';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { bridge } from '@/services/bridge';
import { api, ApiError } from '@/services/api';
import { ERR } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';

const storyStore = useStoryStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 120_000;

let pollTimer: number | null = null;
let timeoutTimer: number | null = null;
let elapsedTimer: number | null = null;
let mounted = true;
let polling = false;

const elapsedSec = ref<number>(0);

const progressPercent = computed<number>(() => storyStore.percent);

const statusLabel = computed<string>(() => {
  if (progressPercent.value >= 80 || elapsedSec.value >= 60) {
    return t('generating.almostDone');
  }
  return t('generating.title');
});

function clearAllTimers(): void {
  if (pollTimer != null) { window.clearTimeout(pollTimer); pollTimer = null; }
  if (timeoutTimer != null) { window.clearTimeout(timeoutTimer); timeoutTimer = null; }
  if (elapsedTimer != null) { window.clearInterval(elapsedTimer); elapsedTimer = null; }
}

function scheduleNextPoll(): void {
  if (!mounted) return;
  pollTimer = window.setTimeout(() => { void runPoll(); }, POLL_INTERVAL_MS);
}

async function runPoll(): Promise<void> {
  if (!mounted) return;
  if (polling) { scheduleNextPoll(); return; }
  const storyId = storyStore.generatingStoryId;
  if (!storyId) {
    bridge.log('generating', { event: 'no_story_id' });
    screen.goError(ERR.STORY_GEN_FAILED);
    return;
  }

  polling = true;
  try {
    const { data } = await api.storyStatus(storyId);
    storyStore.updateGenProgress({
      status: data.status,
      stage: data.progress.stage,
      pagesGenerated: data.progress.pagesGenerated,
      totalPages: data.progress.totalPages,
      percent: data.progress.percent,
    });

    if (data.status === 'completed') {
      await loadAndNavigate(storyId);
      return;
    }
    if (data.status === 'failed') {
      const code = data.error?.code ?? ERR.STORY_GEN_FAILED;
      bridge.log('generating', { event: 'gen_failed_status', code });
      screen.goError(code);
      return;
    }
    // queued / generating — keep polling
    scheduleNextPoll();
  } catch (e) {
    bridge.log('generating', { event: 'poll_error', err: String(e) });
    if (e instanceof ApiError && (e.isAuth() || e.code === ERR.STORY_NOT_FOUND)) {
      screen.goError(e.code);
      return;
    }
    scheduleNextPoll();
  } finally {
    polling = false;
  }
}

async function loadAndNavigate(storyId: string): Promise<void> {
  try {
    const { data } = await api.storyDetail(storyId);
    storyStore.loadStory(data.story);
    clearAllTimers();
    screen.go('story-cover');
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ERR.STORY_NOT_READY;
    screen.goError(code);
  }
}

onMounted(() => {
  // No BGM during generation (no 'generating' scene per §6.1).
  bgm.stop();

  if (!storyStore.generatingStoryId) {
    bridge.log('generating', { event: 'mounted_without_story_id' });
    screen.goError(ERR.STORY_GEN_FAILED);
    return;
  }

  elapsedSec.value = storyStore.genElapsedSec;
  elapsedTimer = window.setInterval(() => {
    elapsedSec.value = storyStore.genElapsedSec;
  }, 1000);

  timeoutTimer = window.setTimeout(() => {
    if (!mounted) return;
    bridge.log('generating', { event: 'timeout', elapsed: storyStore.genElapsedSec });
    screen.goError(ERR.STORY_GEN_FAILED);
  }, TIMEOUT_MS);

  // First poll fires immediately
  void runPoll();
});

onBeforeUnmount(() => {
  mounted = false;
  clearAllTimers();
});
</script>

<template>
  <div class="generating-screen">
    <img class="bg" :src="asset('bg/bg_gen.webp')" alt="" aria-hidden="true">

    <div class="content">
      <div class="bear-wrap">
        <img class="bear bear-float" :src="asset('bear/bear_paint.webp')" alt="">
        <img class="confetti" :src="asset('deco/deco_sparkles.webp')" alt="" aria-hidden="true">
      </div>

      <div class="title-block">
        <h1 class="title t-2xl">{{ statusLabel }}</h1>

        <div class="progress-wrap">
          <div class="progress-track">
            <div
              class="progress-fill"
              :style="{ width: `${Math.max(progressPercent, 4)}%` }"
            />
          </div>
          <div class="progress-text t-md">
            {{ t('generating.progress', {
              ready: storyStore.pagesGenerated,
              total: storyStore.totalPages,
            }) }}
          </div>
        </div>

        <div class="elapsed t-sm">
          {{ t('generating.elapsed', { seconds: elapsedSec }) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.generating-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-canvas);
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
  /* TV_TASKS v1.1 P0-3: 280 -> 420 for a hero "painting your story" bear. */
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
}
.bear-float {
  animation: bear-float 2.4s var(--ease-out) infinite;
}
@keyframes bear-float {
  0%, 100% { transform: translateY(0) rotate(-1deg); }
  50%      { transform: translateY(-12px) rotate(1deg); }
}
.confetti {
  position: absolute;
  inset: -20px;
  width: calc(100% + 40px);
  height: calc(100% + 40px);
  object-fit: contain;
  opacity: 0.6;
  pointer-events: none;
  animation: sparkle 3s linear infinite;
}
@keyframes sparkle {
  0%   { opacity: 0.3; transform: rotate(0deg); }
  50%  { opacity: 0.7; }
  100% { opacity: 0.3; transform: rotate(360deg); }
}

.title-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  text-align: center;
}
.title {
  color: var(--c-cream);
  font-weight: 700;
  letter-spacing: 0.02em;
  margin: 0;
}

.progress-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  width: 560px;
}
.progress-track {
  width: 100%;
  height: 18px;
  background: rgba(255, 245, 230, 0.12);
  border: 1px solid rgba(255, 200, 87, 0.25);
  border-radius: 999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-amber), var(--c-coral));
  border-radius: 999px;
  transition: width 600ms var(--ease-out);
  box-shadow: 0 0 16px var(--c-amber-soft);
}
.progress-text {
  color: var(--c-cream-soft);
}

.elapsed {
  color: var(--c-cream-faint);
  letter-spacing: 0.06em;
}
</style>

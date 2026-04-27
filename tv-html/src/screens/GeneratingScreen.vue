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
import { useFocusable } from '@/services/focus';

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

// iter13h: demo progress that eases from 0 → 95% over 40 s so the bar and
// page count feel alive when there's no backend (gallery/dev preview).
const demoPercent = ref<number>(0);
let demoProgressTimer: number | null = null;

const progressPercent = computed<number>(() =>
  isDemoMode() ? demoPercent.value : storyStore.percent,
);

const progressRatio = computed<number>(() =>
  Math.max(0.04, Math.min(progressPercent.value / 100, 1)),
);

/*
 * TV v1.0 §4.6: stage-based progress copy.
 *   0-10  → 小熊在想故事呢...
 *   10-30 → 正在画第一页...
 *   30-65 → 画其余 11 页...
 *   65-95 → 小熊在录音...
 *   95+   → 快好了!
 */
const stageLabel = computed<string>(() => {
  const p = progressPercent.value;
  if (p >= 95) return t('generating.stages.almost');
  if (p >= 65) return t('generating.stages.recording');
  if (p >= 30) return t('generating.stages.morePages');
  if (p >= 10) return t('generating.stages.firstPage');
  return t('generating.stages.thinking');
});
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

/**
 * Dev / gallery preview mode. Returns true for:
 *   - `?screen=generating` deep-link (id seeded as 'demo-gen' in main.ts)
 *   - `?gallery=1` UI gallery (id seeded as 'demo-gen-1' in GalleryView)
 *   - any `?dev=1` session (no backend — stub all API calls)
 * In all three cases we skip the real storyStatus poll loop so the
 * screen can sit on its demo progress bar without 401-ing to ErrorScreen.
 */
function isDemoMode(): boolean {
  // 2026-04-27: include import.meta.env.DEV so the vite dev server
  // (localhost:5173/5176) qualifies even when the URL has no `?dev=1`
  // query — otherwise pressing Ctrl+G or arriving via the dialogue
  // ready-painter on a clean URL would fall into the production poll
  // path, hit a 401 against no backend, and bounce ErrorScreen →
  // activation → home (the "一闪而过" symptom).
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return p.has('dev') || p.has('gallery') || p.get('screen') === 'generating';
}

onMounted(() => {
  bgm.stop();

  // 2026-04-27 dev/gallery: when entering Generating via demo paths
  // (Ctrl+G hotkey, dev URL, or DialogueScreen ready-painter without a
  // prior /story/generate call), the store may not have a generating
  // storyId yet. Seed a fake one BEFORE the guard below so we never
  // bounce to ErrorScreen → activation → home in dev. Production
  // paths always seed via storyStore.startGeneration first, so this
  // is purely a dev-mode safety net.
  if (isDemoMode() && !storyStore.generatingStoryId) {
    storyStore.startGeneration({
      storyId: 'demo-gen-' + Date.now(),
      estimatedDurationSec: 75,
      queuePosition: 1,
    });
  }

  if (!storyStore.generatingStoryId) {
    bridge.log('generating', { event: 'mounted_without_story_id' });
    screen.goError(ERR.STORY_GEN_FAILED);
    return;
  }

  elapsedSec.value = storyStore.genElapsedSec;
  elapsedTimer = window.setInterval(() => {
    elapsedSec.value = storyStore.genElapsedSec;
  }, 1000);

  if (isDemoMode()) {
    /*
     * iter13h demo: animate demoPercent from 0 → 95 over ~40 s so the
     * bar visibly fills in Gallery / screen-deep-link preview. Stops at
     * 95% so the screen doesn't auto-advance in demo mode.
     */
    demoPercent.value = 4;
    demoProgressTimer = window.setInterval(() => {
      if (!mounted) return;
      if (demoPercent.value >= 95) {
        if (demoProgressTimer != null) {
          window.clearInterval(demoProgressTimer);
          demoProgressTimer = null;
        }
        return;
      }
      demoPercent.value = Math.min(95, demoPercent.value + 1.2);
    }, 500);
    return;
  }

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
  if (demoProgressTimer != null) {
    window.clearInterval(demoProgressTimer);
    demoProgressTimer = null;
  }
});

/*
 * iter13h · "去故事馆看看" focusable. Lets the kid bail out of waiting
 * and browse the library; the generation keeps going in the background
 * (storyStore.generatingStoryId is NOT cleared, so the next poll from
 * any screen can resume). Default focus lands here so the screen is
 * never "dead" — without it, remote arrow keys did nothing.
 */
const libraryBtnRef = ref<HTMLElement | null>(null);
useFocusable(libraryBtnRef, {
  id: 'generating-btn-library',
  autoFocus: true,
  // 2026-04-27: home menu's "Stories" card maps to LibraryScreen (per
  // HomeScreen.vue line 78), so the "while you wait, go look at your
  // stories" CTA on this screen routes there too.
  onEnter: () => { screen.go('library'); },
  onBack: () => { screen.go('home'); },
});
</script>

<template>
  <div class="generating-screen">
    <!-- Layer 1: background -->
    <img class="bg" :src="asset('bg/bg_gen.webp')" alt="" aria-hidden="true">

    <!--
      iter13i-1: full-frame sparkle overlay removed per founder — the
      extra layer on top of bg_gen + twinkling stars looked cluttered.
      Only bg + stars + bear + progress remain now.
    -->
    <!-- (sparkles layer removed) -->

    <!--
      iter13i-1: title + subtitle stay at top; the "takes a few minutes —
      visit the Story Library" hint + play-icon button are promoted OUT
      of the header and pinned to the bottom as one strip (see below).
    -->
    <header class="title-block">
      <h1 class="title wb-text-shadow">{{ statusLabel }}</h1>
      <p class="subtitle wb-text-shadow">{{ t('generating.subtitle') }}</p>
      <!-- TV v1.0 §4.6: stage-based dynamic copy. -->
      <p class="stage-label wb-text-shadow-sm">{{ stageLabel }}</p>
    </header>

    <!--
      Layer 3: animated UI deco floating on the canvas area of bg_gen.webp.
      Positioned over the easel in the watercolor so it looks like the bear
      is actively painting stars onto the canvas. Slow spin + gentle bob
      keeps GPU cost low (single transform channel).
    -->
    <img
      class="canvas-deco"
      :src="asset('deco/deco_stars.webp')"
      alt=""
      aria-hidden="true"
    >

    <!--
      iter13i-2: bear "walks" along the progress bar.
        The bear_coming_soon sprite is absolutely positioned inside the
        track wrapper; its `left` offset is tied to progressPercent so
        the bear visually travels rightward as generation advances.
        Bar row sits directly above the bottom hint strip — the whole
        lower third of the screen reads as a single progress zone.
    -->
    <div class="progress-zone">
      <div class="progress-track-with-bear">
        <div
          class="progress-board"
          :style="{ backgroundImage: `url(${asset('ui/ui_progress_bar.webp')})` }"
        >
          <div
            class="progress-fill"
            :style="{ transform: `scaleX(${progressRatio})` }"
          />
        </div>
        <img
          class="traveling-bear"
          :src="asset('bear/bear_coming_soon.webp')"
          alt=""
          aria-hidden="true"
          :style="{ left: `calc(${Math.max(0, Math.min(progressPercent, 100))}% - 90px)` }"
        />
      </div>
      <div class="progress-text-pill wb-text-shadow-sm">
        {{ t('generating.progress', {
          ready: storyStore.pagesGenerated,
          total: storyStore.totalPages,
        }) }}
        · {{ t('generating.elapsed', { seconds: elapsedSec }) }}
      </div>
    </div>

    <!--
      iter13i-1 bottom CTA strip:
        - "This takes a few minutes — visit the Story Library" in a
          translucent pill
        - To the RIGHT of the pill, a round ui_player_play.webp button
          (focusable) jumps to the Library when pressed.
      No more standalone "Story Library" text button — the play icon IS
      the action.
    -->
    <div class="bottom-cta-row">
      <div class="gen-hint-pill wb-text-shadow-sm">{{ t('generating.hint') }}</div>
      <button
        ref="libraryBtnRef"
        type="button"
        class="play-btn wb-focus-feedback"
        :aria-label="t('generating.goLibrary')"
        @click="screen.go('library')"
      >
        <img :src="asset('ui/ui_player_play.webp')" alt="" class="play-icon" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
 * 2026-04-24 iter7 — independent layers: bear static, rings spin, particles
 * drift. TV safe-area 64 px L/R, 36 px T/B.
 */
.generating-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-canvas);
  overflow: hidden;
}

/* Layer 1 */
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  user-select: none;
  pointer-events: none;
}

/* iter13i-1: .sparkles drift overlay removed (see template). */

/* Top title */
.title-block {
  position: absolute;
  top: 36px;
  left: 0;
  right: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0 64px;
  text-align: center;
}
.title {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 36px;
  font-weight: 800;
  letter-spacing: 0.02em;
  margin: 0;
}
.subtitle {
  font-family: var(--ff-display);
  /* iter13h-2: cream (not cream-soft gray) so it reads on watercolor. */
  color: var(--c-cream);
  font-size: 22px;
  font-weight: 700;
  margin: 0;
}
/*
 * TV v1.0 §4.6: stage-label hint sitting under the subtitle. Smaller,
 * cream, sits next to the title chip.
 */
.stage-label {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 18px;
  font-weight: 600;
  margin: 4px 0 0;
  opacity: 0.92;
}
/* (moved to bottom CTA row — see .bottom-cta-row / .gen-hint-pill below) */

/*
 * Canvas deco — stars pulse big ↔ small so they read as "twinkling" while
 * the bear paints. iter11: dropped the rotation (user felt the spin looked
 * mechanical); now it's a pure breathe/scale so each star appears to blink.
 */
.canvas-deco {
  position: absolute;
  right: 30%;
  /* iter13h-2: moved up 20% of own height (38% → 18%) per founder so
   * the stars rise into the upper canvas area of bg_gen. */
  top: 18%;
  width: 280px;
  height: 280px;
  object-fit: contain;
  z-index: 2;
  transform-origin: center center;
  animation: canvas-twinkle 1.8s ease-in-out infinite alternate;
  pointer-events: none;
}
@keyframes canvas-twinkle {
  0%   { transform: scale(0.78); opacity: 0.55; }
  100% { transform: scale(1.12); opacity: 1;    }
}

/*
 * iter13i-2: unified progress zone.
 *   Layout: one track wrapper holding the cream-art bar + amber fill
 *   + a traveling bear sprite; below it, the progress-text pill.
 *   Zone pins directly above the bottom CTA row (bottom: 130 px).
 */
.progress-zone {
  position: absolute;
  left: 50%;
  bottom: 150px;
  transform: translateX(-50%);
  z-index: 3;
  width: 820px;
  max-width: calc(100% - 128px);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.progress-track-with-bear {
  position: relative;
  width: 100%;
}
/*
 * Traveling bear on the bar.
 *   Width 180 px. We offset `left` by progressPercent so the bear's
 *   VISUAL CENTER is close to the fill tip:
 *     left = calc(percent% - 90px)   (90 = bearWidth / 2)
 *   Bottom-anchored at `-1/3 bearHeight` so the bear straddles the bar
 *   instead of sitting entirely above it (reads more like he's walking
 *   on top of it).
 */
.traveling-bear {
  position: absolute;
  bottom: -30px;
  width: 180px;
  height: 180px;
  object-fit: contain;
  filter: drop-shadow(0 12px 20px rgba(0, 0, 0, 0.45));
  transition: left 600ms var(--ease-out);
  pointer-events: none;
  z-index: 2;
}
/*
 * iter13h progress art:
 *   .progress-board — the illustrated cream track (ui_progress_bar.webp).
 *   .progress-fill  — an amber gradient scaled along X by progressRatio
 *     (transform: scaleX) so width animates without re-layouts. origin
 *     pinned to left so the bar "fills from the left".
 */
/* iter13h-2: track thickened 38 → 64 px; rest of the box balances. */
.progress-board {
  width: 100%;
  height: 64px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  border-radius: 999px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
}
.progress-fill {
  position: absolute;
  inset: 8px 10px;
  background: linear-gradient(90deg, var(--c-focus), #ffd089);
  border-radius: 999px;
  transform-origin: left center;
  transform: scaleX(0);
  transition: transform 600ms var(--ease-out);
  box-shadow: 0 0 18px var(--c-focus-soft);
  mix-blend-mode: multiply;
  opacity: 0.85;
}
/*
 * iter13i-1: progress text wrapped in a translucent pill so the
 * "Page x of 12 done · Ns elapsed" line stays sharp against any
 * watercolor hotspot. Prior plain cream text was half-readable.
 */
.progress-text-pill {
  align-self: center;
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 6px 16px;
  background: rgba(26, 15, 10, 0.6);
  border-radius: 999px;
  backdrop-filter: blur(3px);
}

/*
 * iter13i-1 bottom CTA strip:
 *   [ long hint pill ] [ round play-icon button ]
 * Text and button share a horizontal row centered at the bottom. Button
 * is focusable; pressing OK / clicking jumps to the Story Library.
 */
.bottom-cta-row {
  position: absolute;
  left: 50%;
  bottom: 50px;
  transform: translateX(-50%);
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 18px;
  max-width: calc(100% - 128px);
}
.gen-hint-pill {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 20px;
  font-weight: 600;
  padding: 12px 22px;
  background: rgba(26, 15, 10, 0.62);
  border-radius: 999px;
  backdrop-filter: blur(3px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}
/* iter13i-2: play button doubled (62 → 124 px). */
.play-btn {
  width: 124px;
  height: 124px;
  border-radius: 50%;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
  flex: 0 0 124px;
}
.play-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.45));
}
/*
 * iter13i-3: play button is the only focusable on this screen, so its
 * focus state must be LOUD. Base: transparent disc. Focus: filled amber
 * disc with a cream-inside ring + big outer glow + scale. Reads as a
 * proper "selected" chip.
 */
.play-btn.is-focused,
.play-btn[data-focused='true'] {
  transform: scale(1.22);
  background: rgba(245, 158, 11, 0.22);
  box-shadow:
    inset 0 0 0 4px var(--c-amber),
    0 0 0 6px rgba(255, 245, 230, 0.35),
    0 0 32px 8px var(--c-focus-soft);
  border-radius: 50%;
}
</style>

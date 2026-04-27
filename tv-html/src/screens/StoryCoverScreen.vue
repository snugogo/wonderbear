<!--
  StoryCoverScreen — full-screen cover image with title, BGM cue.
  PRD §4.4 + §6.1 (BGM scene 'story_cover' = 30% volume, 5s fade-in).

  Behavior:
    - Full-bleed cover image (storyStore.active.coverUrl)
    - bgm.play('story_cover') — native handles the fade-in
    - 3-second auto-advance to story-body
    - OK key skips early (kids may want to dive in)
    - Back key exits to library

  Memory note: cover is ~one image (≤500KB). Body screen will dispose this on next-screen.
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStoryStore } from '@/stores/story';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { bridge } from '@/services/bridge';
import { useFocusable } from '@/services/focus';
import { api, ApiError } from '@/services/api';
import { ERR } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';

const AUTO_ADVANCE_MS = 5000;

const storyStore = useStoryStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

// iter8 gallery-safe: when loaded via ?dev=1 deep-link without a real story,
// don't bail — show the "ready" ceremony with a placeholder title.
const isDevBrowser = import.meta.env.DEV
  || (typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).has('dev'));

const okCaptureEl = ref<HTMLElement | null>(null);
let advanceTimer: number | null = null;
let mounted = true;
const visible = ref<boolean>(false);

const coverUrl = computed<string>(() => storyStore.active?.coverUrl ?? '');
const title = computed<string>(() =>
  storyStore.active?.title ?? 'The Brave Little Bear',
);

function clearTimers(): void {
  if (advanceTimer != null) {
    window.clearTimeout(advanceTimer);
    advanceTimer = null;
  }
}

function advance(): void {
  if (!mounted) return;
  clearTimers();
  // story-body will start TTS as part of its own onMounted.
  screen.go('story-body');
}

useFocusable(okCaptureEl, {
  id: 'cover-ok-capture',
  autoFocus: true,
  onEnter: () => { advance(); },
});

/*
 * 2026-04-28 PHASE1: payload-driven story load.
 *
 * Some upstream surfaces (Bear Stars editor_picks, deep-links) navigate
 * here with `screen.payload = { storyId }` but WITHOUT a pre-fetched
 * Story in storyStore. Instead of bouncing through ErrorScreen we
 * fetch /api/story/:id here, hydrate storyStore.active, then continue
 * the ceremony as if Library / Create had primed it.
 *
 * Dev gallery flows still synthesize a demo story upstream and pass
 * no payload, so isDevBrowser short-circuits the API call.
 */
async function ensureActiveStory(): Promise<boolean> {
  if (storyStore.active) return true;
  if (isDevBrowser) return true; // ceremony renders with placeholders.

  const payload = (screen.payload ?? {}) as Record<string, unknown>;
  const wantedId = typeof payload.storyId === 'string' ? payload.storyId : null;
  if (!wantedId) {
    bridge.log('story-cover', { event: 'mounted_without_active_story' });
    screen.goError(ERR.STORY_NOT_FOUND);
    return false;
  }
  try {
    const { data } = await api.storyDetail(wantedId);
    storyStore.loadStory(data.story);
    return true;
  } catch (e) {
    bridge.log('story-cover', { event: 'detail_load_failed', storyId: wantedId, err: String(e) });
    const code = e instanceof ApiError ? e.code : ERR.STORY_NOT_READY;
    screen.goError(code);
    return false;
  }
}

onMounted(() => {
  void (async () => {
    const ok = await ensureActiveStory();
    if (!ok || !mounted) return;

    bgm.play('story_cover');

    // Trigger CSS fade-in next frame
    window.requestAnimationFrame(() => { visible.value = true; });

    advanceTimer = window.setTimeout(() => {
      if (mounted) advance();
    }, AUTO_ADVANCE_MS);
  })();
});

onBeforeUnmount(() => {
  mounted = false;
  clearTimers();
});
</script>

<template>
  <div class="cover-screen" :class="{ visible }">
    <!-- Layer 1: painted BG. Prefer real cover image, fall back to bg_forest
         watercolor so the ceremony still reads even in gallery/demo mode. -->
    <img
      class="bg"
      :src="coverUrl || asset('bg/bg_forest.webp')"
      :alt="title"
    >

    <!-- Layer 2: decorative confetti drifting up — celebratory cue that
         the story just finished generating. Uses deco_confetti (transparent). -->
    <img class="deco-confetti left" :src="asset('deco/deco_confetti.webp')" alt="" />
    <img class="deco-confetti right" :src="asset('deco/deco_confetti.webp')" alt="" />
    <img class="deco-stars" :src="asset('deco/deco_stars.webp')" alt="" />

    <!-- Layer 3: cheering bear — center-ish, bobs gently. -->
    <img class="bear" :src="asset('bear/bear_cheer.webp')" alt="" />

    <!-- Layer 4: "ready" ceremony text block. -->
    <div class="ceremony">
      <div class="ready-line wb-text-shadow">{{ t('story.ready') }}</div>
      <h1 class="title wb-text-shadow">{{ title }}</h1>
      <div class="start-hint wb-text-shadow-sm">{{ t('story.startWatching') }}</div>
    </div>

    <div ref="okCaptureEl" class="ok-capture" tabindex="-1" aria-hidden="true" />
  </div>
</template>

<style scoped>
.cover-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-deep);
  overflow: hidden;
  opacity: 0;
  transition: opacity 1200ms var(--ease-out);
}
.cover-screen.visible { opacity: 1; }

/* Layer 1 */
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  filter: brightness(0.85);
}

/* Layer 2 — confetti drift from bottom corners. */
.deco-confetti {
  position: absolute;
  width: 320px;
  height: 320px;
  object-fit: contain;
  opacity: 0.9;
  pointer-events: none;
  z-index: 2;
  animation: confetti-rise 3.5s ease-in-out infinite;
}
.deco-confetti.left  { left: 4%;   bottom: 6%; animation-delay: 0s; }
.deco-confetti.right { right: 4%;  bottom: 6%; animation-delay: 1.2s; transform: scaleX(-1); }
@keyframes confetti-rise {
  0%, 100% { transform: translateY(0) rotate(0); opacity: 0.85; }
  50%      { transform: translateY(-40px) rotate(6deg); opacity: 1; }
}
.deco-stars {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0.45;
  pointer-events: none;
  z-index: 1;
  animation: stars-twinkle 4s ease-in-out infinite;
}
@keyframes stars-twinkle {
  0%, 100% { opacity: 0.35; transform: scale(1); }
  50%      { opacity: 0.65; transform: scale(1.03); }
}

/* Layer 3 — cheering bear bobs gently. */
.bear {
  position: absolute;
  left: 50%;
  top: 42%;
  transform: translate(-50%, -50%);
  width: 380px;
  height: 380px;
  object-fit: contain;
  z-index: 3;
  filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.45));
  animation: bear-bob 2.2s ease-in-out infinite alternate;
}
@keyframes bear-bob {
  0%   { transform: translate(-50%, -50%) scale(1); }
  100% { transform: translate(-50%, -52%) scale(1.02); }
}

/* Layer 4 — ceremony text block. */
.ceremony {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 0 var(--sp-7);
  text-align: center;
  z-index: 4;
}
.ready-line {
  font-family: var(--ff-display);
  color: var(--c-amber);
  font-size: 36px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin: 0;
}
.title {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 64px;
  font-weight: 800;
  letter-spacing: 0.03em;
  line-height: 1.2;
  margin: 0;
}
.start-hint {
  font-family: var(--ff-display);
  color: var(--c-cream-soft);
  font-size: 22px;
  letter-spacing: 0.12em;
}

.ok-capture {
  position: absolute;
  top: 0; left: 0;
  width: 1px; height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>

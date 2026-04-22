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
import { ERR } from '@/utils/errorCodes';

const AUTO_ADVANCE_MS = 3000;

const storyStore = useStoryStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

const okCaptureEl = ref<HTMLElement | null>(null);
let advanceTimer: number | null = null;
let mounted = true;
const visible = ref<boolean>(false);

const coverUrl = computed<string>(() => storyStore.active?.coverUrl ?? '');
const title = computed<string>(() => storyStore.active?.title ?? '');

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

onMounted(() => {
  if (!storyStore.active) {
    bridge.log('story-cover', { event: 'mounted_without_active_story' });
    screen.goError(ERR.STORY_NOT_FOUND);
    return;
  }

  bgm.play('story_cover');

  // Trigger CSS fade-in next frame
  window.requestAnimationFrame(() => { visible.value = true; });

  advanceTimer = window.setTimeout(() => {
    if (mounted) advance();
  }, AUTO_ADVANCE_MS);
});

onBeforeUnmount(() => {
  mounted = false;
  clearTimers();
});
</script>

<template>
  <div class="cover-screen" :class="{ visible }">
    <img
      v-if="coverUrl"
      class="cover"
      :src="coverUrl"
      :alt="title"
    >

    <div class="overlay" />

    <div class="title-block">
      <h1 class="title t-display">{{ title }}</h1>
      <div class="hint t-md">{{ t('common.ok') }}</div>
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
.cover-screen.visible {
  opacity: 1;
}

.cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}

.overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0) 40%,
    rgba(0, 0, 0, 0.55) 80%,
    rgba(0, 0, 0, 0.78) 100%
  );
  pointer-events: none;
}

.title-block {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: 0 var(--sp-7);
  text-align: center;
}

.title {
  color: var(--c-cream);
  font-weight: 800;
  letter-spacing: 0.04em;
  margin: 0;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.7);
  line-height: 1.2;
}

.hint {
  color: var(--c-amber);
  letter-spacing: 0.12em;
  opacity: 0.85;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

.ok-capture {
  position: absolute;
  top: 0; left: 0;
  width: 1px; height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>

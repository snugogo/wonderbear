<!--
  OfflineScreen — shown when bridge.on('network-change') fires false.
  PRD §4.7 + bear_no_network sprite.

  Auto-recovery is handled by App.vue: when network-change=true fires,
  App calls screen.back() to return to whatever was on-screen before.

  This screen just shows status + a manual retry button. Retry attempts a
  single device.refreshStatus() — if network is genuinely back, App's
  network-change listener will fire and auto-back; if still offline, the
  ApiError swallowed by refreshStatus leaves us on this screen.
-->

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useDeviceStore } from '@/stores/device';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { useFocusable, getCurrentFocusId, onFocusChange } from '@/services/focus';
import { asset } from '@/utils/assets';

const device = useDeviceStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

const retryEl = ref<HTMLElement | null>(null);
const focusedId = ref<string>('');
const retrying = ref<boolean>(false);
let unsubFocus: (() => void) | null = null;
let mounted = true;

async function retry(): Promise<void> {
  if (retrying.value) return;
  retrying.value = true;
  try {
    await device.refreshStatus();
    if (device.online && screen.previous) {
      screen.back();
    }
  } finally {
    if (mounted) retrying.value = false;
  }
}

useFocusable(retryEl, {
  id: 'offline-retry',
  autoFocus: true,
  onEnter: retry,
});

onMounted(() => {
  bgm.stop();
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
  <div class="offline-screen">
    <!-- TV_TASKS v1.1 P0-1: bg_welcome warm watercolor (doubles for offline). -->
    <img class="bg" :src="asset('bg/bg_welcome.webp')" alt="" aria-hidden="true" />

    <div class="content">
      <img class="bear" :src="asset('bear/bear_no_network.webp')" alt="">
      <h1 class="title t-2xl">{{ t('offline.title') }}</h1>
      <p class="subtitle t-md">{{ t('offline.subtitle') }}</p>
      <p class="hint t-sm">{{ t('offline.available') }}</p>

      <button
        ref="retryEl"
        class="retry-btn wb-focus-feedback"
        :class="{ 'is-focused': focusedId === 'offline-retry' }"
        :disabled="retrying"
        type="button"
        @click="retry"
      >
        <span class="t-lg">{{ retrying ? t('common.loading') : t('offline.retry') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.offline-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-canvas);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
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
.content { position: relative; z-index: 1; }

/*
 * 2026-04-25 iter:
 *   - Subtitle / hint were rendered with cream-soft / cream-faint
 *     (rgba 70% / 50%) which read as muddy gray over the rainbow
 *     watercolor; bumped to solid cream + heavier shadow halo.
 *   - Bear shrunk 340 → 260 and stage padding doubled so the retry
 *     button never grazes the TV safe zone (overscan eats the bottom
 *     5-7% on cheap panels).
 *   - Retry button restyled to the cartoon-card vocabulary used by the
 *     Story Library / Story End screens.
 */
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-7) var(--sp-6);
  text-align: center;
}

.bear {
  width: 260px;
  height: 260px;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
  margin-bottom: var(--sp-2);
}

.title {
  color: var(--c-cream);
  font-weight: 700;
  margin: 0;
  text-shadow: 0 3px 10px rgba(0, 0, 0, 0.7);
}
.subtitle {
  color: var(--c-cream);
  font-weight: 600;
  margin: 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7), 0 0 18px rgba(26, 15, 10, 0.45);
}
.hint {
  color: var(--c-cream);
  font-weight: 500;
  margin: 0 0 var(--sp-4);
  letter-spacing: 0.04em;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7), 0 0 14px rgba(26, 15, 10, 0.4);
  opacity: 0.92;
}

.retry-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 200, 87, 0.2);
  border: 2px solid var(--c-amber-soft);
  color: var(--c-cream);
  padding: 14px 32px;
  border-radius: var(--r-lg);
  cursor: pointer;
  font-family: var(--ff-display);
  font-size: 24px;
  font-weight: 700;
  min-width: 240px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.55);
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.retry-btn:disabled { cursor: not-allowed; opacity: 0.6; }
.retry-btn.is-focused {
  transform: scale(1.08);
  border-color: var(--c-amber);
  box-shadow:
    0 0 0 3px rgba(245, 158, 11, 0.55),
    0 0 22px 6px var(--c-focus-soft);
}
</style>

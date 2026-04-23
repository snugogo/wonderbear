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

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-6);
  text-align: center;
}

.bear {
  /* TV_TASKS v1.1 P0-3: 240 -> 340. */
  width: 340px;
  height: 340px;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
  margin-bottom: var(--sp-3);
}

.title {
  color: var(--c-cream);
  font-weight: 700;
  margin: 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.65);
}
.subtitle {
  color: var(--c-cream-soft);
  margin: 0;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
.hint {
  color: var(--c-cream-faint);
  margin: 0 0 var(--sp-4);
  letter-spacing: 0.04em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.retry-btn {
  appearance: none;
  background: rgba(255, 200, 87, 0.18);
  border: 2px solid var(--c-amber-soft);
  color: var(--c-cream);
  padding: var(--sp-3) var(--sp-6);
  border-radius: var(--r-lg);
  cursor: pointer;
  transition: all var(--t-fast) var(--ease-out);
  min-width: 240px;
  font-family: inherit;
}
.retry-btn:disabled { cursor: not-allowed; opacity: 0.6; }
/* Spring transform lives on .wb-focus-feedback.is-focused (global). */
.retry-btn.is-focused {
  background: var(--c-amber);
  border-color: var(--c-amber);
  color: #1a0f0a;
  box-shadow: var(--shadow-focus);
}
</style>

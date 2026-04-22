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
    <div class="content">
      <img class="bear" :src="asset('bear/bear_no_network.webp')" alt="">
      <h1 class="title t-2xl">{{ t('offline.title') }}</h1>
      <p class="subtitle t-md">{{ t('offline.subtitle') }}</p>
      <p class="hint t-sm">{{ t('offline.available') }}</p>

      <button
        ref="retryEl"
        class="retry-btn"
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
  background: var(--c-bg-canvas);
  display: flex;
  align-items: center;
  justify-content: center;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-6);
  text-align: center;
}

.bear {
  width: 240px;
  height: 240px;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
  margin-bottom: var(--sp-3);
}

.title {
  color: var(--c-cream);
  font-weight: 700;
  margin: 0;
}
.subtitle {
  color: var(--c-cream-soft);
  margin: 0;
}
.hint {
  color: var(--c-cream-faint);
  margin: 0 0 var(--sp-4);
  letter-spacing: 0.04em;
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
.retry-btn.is-focused {
  background: var(--c-amber);
  border-color: var(--c-amber);
  color: #1a0f0a;
  transform: translateY(-2px) scale(1.04);
  box-shadow: var(--shadow-focus);
}
</style>

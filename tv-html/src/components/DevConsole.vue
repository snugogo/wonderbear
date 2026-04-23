<!--
  DevConsole — floating dev panel.
  Visible only when ?dev=1 OR import.meta.env.DEV.
  Tree-shaken from production bundles via App.vue conditional render.
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { bridge } from '@/services/bridge';
import { useScreenStore, type ScreenName } from '@/stores/screen';
import { onFocusChange } from '@/services/focus';
import { ERR } from '@/utils/errorCodes';

const screen = useScreenStore();
const collapsed = ref(true);
const currentFocus = ref<string | null>(null);
const memoryMb = ref<number | null>(null);

const screens: ScreenName[] = [
  'activation', 'home', 'dialogue', 'generating',
  'story-cover', 'story-body', 'story-end',
  'library', 'learning', 'profile', 'offline', 'error',
];

const errorCodes = [
  { label: 'Quota', code: ERR.QUOTA_EXHAUSTED },
  { label: 'Daily limit', code: ERR.DAILY_LIMIT_REACHED },
  { label: 'Story gen failed', code: ERR.STORY_GEN_FAILED },
  { label: 'Content blocked', code: ERR.CONTENT_SAFETY_BLOCKED },
  { label: 'ASR failed', code: ERR.ASR_FAILED },
  { label: 'Server down', code: ERR.UPSTREAM_UNAVAILABLE },
];

const isMockBridge = computed(() => bridge.isMock);

let memTimer: number | null = null;
let unsubFocus: (() => void) | null = null;

onMounted(() => {
  unsubFocus = onFocusChange((id) => { currentFocus.value = id; });
  // Sample memory every 2s if available
  memTimer = window.setInterval(() => {
    interface MemoryInfo { usedJSHeapSize?: number }
    const perf = performance as Performance & { memory?: MemoryInfo };
    if (perf.memory?.usedJSHeapSize) {
      memoryMb.value = Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
    }
  }, 2000);
  document.body.setAttribute('data-dev', '1');
});

onBeforeUnmount(() => {
  unsubFocus?.();
  if (memTimer !== null) clearInterval(memTimer);
});

function jumpScreen(name: ScreenName): void { screen.go(name); }

function triggerError(code: number): void { screen.goError(code); }

function simVoiceDown(): void { bridge._mock?.simulateVoiceKeyDown(); }
function simVoiceUp(): void { bridge._mock?.simulateVoiceKeyUp(); }
function simOffline(): void { bridge._mock?.simulateNetworkChange(false); }
function simOnline(): void { bridge._mock?.simulateNetworkChange(true); }
function simActivated(): void { bridge._mock?.simulateActivationStatusChange('bound'); }
</script>

<template>
  <div class="dev-console" :class="{ collapsed }">
    <button class="toggle" :class="{ 'is-collapsed': collapsed }" @click="collapsed = !collapsed">
      <span v-if="collapsed" class="toggle-label">DEV</span>
      <span v-else class="toggle-close">×</span>
    </button>
    <div v-if="!collapsed" class="panel">
      <div class="panel-section">
        <div class="row">
          <span class="label">Bridge:</span>
          <span class="value" :class="{ mock: isMockBridge }">
            {{ isMockBridge ? 'MOCK' : 'REAL' }}
          </span>
        </div>
        <div class="row">
          <span class="label">Focus:</span>
          <span class="value">{{ currentFocus ?? '—' }}</span>
        </div>
        <div class="row">
          <span class="label">Memory:</span>
          <span class="value">{{ memoryMb ?? '—' }} MB</span>
        </div>
        <div class="row">
          <span class="label">Screen:</span>
          <span class="value">{{ screen.current }}</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="section-title">Native simulation</div>
        <button class="btn" @click="simVoiceDown">🎤 down</button>
        <button class="btn" @click="simVoiceUp">🎤 up</button>
        <button class="btn" @click="simOffline">Offline</button>
        <button class="btn" @click="simOnline">Online</button>
        <button class="btn" @click="simActivated">Activated</button>
      </div>

      <div class="panel-section">
        <div class="section-title">Jump screen</div>
        <button v-for="s in screens" :key="s" class="btn small" @click="jumpScreen(s)">
          {{ s }}
        </button>
      </div>

      <div class="panel-section">
        <div class="section-title">Trigger error</div>
        <button v-for="ec in errorCodes" :key="ec.code" class="btn small" @click="triggerError(ec.code)">
          {{ ec.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dev-console {
  position: fixed;
  bottom: 16px;
  right: 16px;
  /*
   * z-index 99999: must float above bear_idle.webp deco (z:0), bg layer,
   * and any screen overlays. Founder reported the old 36×36 amber button
   * was visually lost against the bear deco in the bottom-right corner.
   */
  z-index: 99999;
  font-family: monospace;
  color: #fff;
  pointer-events: auto;
}
.toggle {
  /* 60×60 per founder; 36×36 was too small to find. */
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid #ffffff;
  /* Fluorescent red — highest perceptual contrast against the warm
     watercolor palette; no other TV surface uses this hue so it reads
     unambiguously as "dev tool", not a brand accent. */
  background: #FF3B30;
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Two-layer shadow: dark drop + soft glow to detach from any bg zone. */
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.55),
    0 0 0 2px rgba(0, 0, 0, 0.35),
    0 0 24px rgba(255, 59, 48, 0.45);
  /* Subtle pulse so the eye finds it even during movement. */
  animation: dev-toggle-pulse 2.4s ease-in-out infinite;
}
.toggle:hover { transform: scale(1.08); }
.toggle.is-collapsed { animation: dev-toggle-pulse 2.4s ease-in-out infinite; }
.toggle-label {
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
.toggle-close {
  font-size: 32px;
  line-height: 1;
  font-weight: 400;
}
@keyframes dev-toggle-pulse {
  0%, 100% { box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.55),
    0 0 0 2px rgba(0, 0, 0, 0.35),
    0 0 24px rgba(255, 59, 48, 0.45); }
  50%      { box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.55),
    0 0 0 2px rgba(0, 0, 0, 0.35),
    0 0 36px rgba(255, 59, 48, 0.75); }
}
.panel {
  margin-top: 8px;
  width: 280px;
  background: rgba(30, 18, 10, 0.95);
  border: 1px solid rgba(255, 200, 87, 0.4);
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  max-height: 70vh;
  overflow-y: auto;
}
.panel-section { margin-bottom: 12px; }
.panel-section:last-child { margin-bottom: 0; }
.section-title {
  color: rgba(255, 200, 87, 0.9);
  font-weight: bold;
  margin-bottom: 6px;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.1em;
}
.row { display: flex; justify-content: space-between; padding: 2px 0; }
.label { color: rgba(255, 245, 230, 0.6); }
.value { color: #fff5e6; }
.value.mock { color: #ffc857; font-weight: bold; }
.btn {
  display: inline-block;
  margin: 2px;
  padding: 4px 8px;
  background: rgba(255, 245, 230, 0.1);
  color: #fff5e6;
  border: 1px solid rgba(255, 245, 230, 0.2);
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
}
.btn:hover { background: rgba(255, 200, 87, 0.2); }
.btn.small { font-size: 10px; padding: 3px 6px; }
</style>

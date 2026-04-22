<!--
  ActivationScreen — first-boot activation.
  Per PRD §4.1 + TO_TV_hash_route.md.

  Flow:
    - Read deviceInfo from bridge (device id + activation code from factory burn)
    - Render QR code with hash URL: https://h5.wonderbear.app/#/register?device=&code=
    - Poll /device/status every 3s
    - On status='bound', play welcome animation and navigate to home
    - Subscribe to bridge 'activation-status-change' for instant push (skip next poll)

  Per PRD §4.1 key rule: in unactivated state, remote keys are restricted.
  Here we just keep nothing focusable so accidental key presses don't break flow.
-->

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import QRCode from 'qrcode';
import { useDeviceStore } from '@/stores/device';
import { useScreenStore } from '@/stores/screen';
import { bridge } from '@/services/bridge';
import { buildBindingUrl } from '@/utils/buildBindingUrl';
import { useI18n } from 'vue-i18n';

const device = useDeviceStore();
const screen = useScreenStore();
const { t } = useI18n();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const bindingUrl = ref<string>('');
const pollTimer = ref<number | null>(null);
const unsubActivation = ref<(() => void) | null>(null);

const activationCode = computed(() => device.activationCode || '------');

async function renderQrCode(): Promise<void> {
  if (!device.deviceId || !device.activationCode || !canvasEl.value) return;
  const url = buildBindingUrl(device.deviceId, device.activationCode, device.oem);
  bindingUrl.value = url;
  bridge.log('activation', { event: 'qr_url_built', url });
  try {
    await QRCode.toCanvas(canvasEl.value, url, {
      width: 320,
      margin: 2,
      color: { dark: '#1a0f0a', light: '#fff5e6' },
      errorCorrectionLevel: 'M',
    });
  } catch (e) {
    bridge.log('activation', { event: 'qr_render_failed', err: String(e) });
  }
}

async function pollStatus(): Promise<void> {
  await device.refreshStatus();
  if (device.status === 'bound') {
    onActivated();
  }
}

function onActivated(): void {
  if (pollTimer.value !== null) {
    clearInterval(pollTimer.value);
    pollTimer.value = null;
  }
  unsubActivation.value?.();
  // TODO: 1.5s welcome flourish before jumping
  setTimeout(() => screen.go('home'), 800);
}

onMounted(async () => {
  device.loadDeviceInfo();
  if (!device.oem) await device.loadOemConfig();
  await renderQrCode();

  // Poll every 3s per kickoff hard rule §3
  pollTimer.value = window.setInterval(pollStatus, 3000);
  // Initial check
  pollStatus();

  // Subscribe to push event for instant activation feedback
  unsubActivation.value = bridge.on('activation-status-change', (status) => {
    if (status === 'bound') onActivated();
  });
});

onBeforeUnmount(() => {
  if (pollTimer.value !== null) clearInterval(pollTimer.value);
  unsubActivation.value?.();
});
</script>

<template>
  <div class="activation-screen">
    <!-- Background watercolor placeholder. Real bg_welcome_fullscreen will replace this. -->
    <div class="bg-warmth"></div>

    <!-- Left column: hero text -->
    <div class="hero">
      <h1 class="title t-display">{{ t('activation.title') }}</h1>
      <p class="subtitle t-xl">{{ t('activation.subtitle') }}</p>
    </div>

    <!-- Right column: QR card -->
    <div class="qr-card">
      <div class="qr-frame">
        <canvas ref="canvasEl" class="qr-canvas"></canvas>
        <!-- bear_qr_peek placeholder: amber dot for now -->
        <div class="bear-peek" aria-hidden="true">🧸</div>
      </div>
      <p class="scan-hint t-md">{{ t('activation.scanHint') }}</p>
      <p class="code-line t-sm">
        {{ t('activation.activationCodeLabel') }}:
        <span class="code">{{ activationCode }}</span>
      </p>
    </div>

    <!-- Bottom strip: waiting state -->
    <div class="bottom-strip">
      <span class="dot"></span>
      <span class="t-sm">{{ t('activation.waitingForBinding') }}</span>
    </div>
  </div>
</template>

<style scoped>
.activation-screen {
  width: 100%;
  height: 100%;
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  padding: 0 var(--sp-7);
  gap: var(--sp-7);
}

.bg-warmth {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 30% 40%, rgba(255, 200, 87, 0.18), transparent 55%),
    radial-gradient(ellipse at 80% 70%, rgba(255, 126, 95, 0.15), transparent 50%),
    var(--c-bg-canvas);
  z-index: 0;
}

.hero {
  position: relative;
  z-index: 1;
  padding-left: var(--sp-5);
}
.title {
  margin: 0 0 var(--sp-4);
  background: linear-gradient(135deg, var(--c-cream) 0%, var(--c-amber) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.subtitle {
  margin: 0;
  color: var(--c-cream-soft);
  line-height: 1.4;
}

.qr-card {
  position: relative;
  z-index: 1;
  background: rgba(255, 245, 230, 0.05);
  border: 1px solid rgba(255, 200, 87, 0.25);
  border-radius: var(--r-xl);
  padding: var(--sp-5);
  text-align: center;
  width: 380px;
  margin: 0 auto;
  backdrop-filter: blur(12px);
}
.qr-frame {
  position: relative;
  display: inline-block;
  background: var(--c-cream);
  border-radius: var(--r-md);
  padding: var(--sp-3);
}
.qr-canvas {
  display: block;
  width: 320px;
  height: 320px;
}
.bear-peek {
  position: absolute;
  bottom: -16px;
  right: -16px;
  font-size: 56px;
  background: var(--c-cream);
  border-radius: 50%;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-card);
}
.scan-hint {
  margin: var(--sp-4) 0 var(--sp-2);
  color: var(--c-cream);
}
.code-line {
  color: var(--c-cream-soft);
  margin: 0;
}
.code {
  font-family: monospace;
  letter-spacing: 0.15em;
  color: var(--c-amber);
  font-weight: bold;
}

.bottom-strip {
  position: absolute;
  bottom: var(--sp-5);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--c-cream-soft);
  z-index: 1;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-amber);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.3); }
}
</style>

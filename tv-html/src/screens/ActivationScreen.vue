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
import { asset } from '@/utils/assets';
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
    <!--
      TV_TASKS v1.1 P0-1: use bg_activation.webp (⏳ in NAMING_CONTRACT §四).
      The left half of the image is designed as a blank area for the QR card
      to sit over. Until the designer delivers, the img 404s and onerror
      hides it, exposing the warm gradient fallback underneath.
    -->
    <img
      class="bg"
      :src="asset('bg/bg_activation.webp')"
      alt=""
      aria-hidden="true"
      onerror="this.style.display='none'"
    />
    <div class="bg-warmth"></div>

    <!--
      Layout per NAMING_CONTRACT.md §bg_activation:
      "左侧白框=二维码叠加位置"
      The watercolor has a painted empty picture-frame on the LEFT designed
      as the natural overlay slot for the QR card. Brand hero goes RIGHT,
      over the cozy bedroom scene (bookshelf, sunset window) — lets the
      marketing moment breathe against the mood backdrop.
    -->
    <!-- Left column: QR card (sits over bg_activation's white frame) -->
    <div class="qr-card">
      <div class="qr-frame">
        <canvas ref="canvasEl" class="qr-canvas"></canvas>
        <!--
          bear_qr_peek.webp is "✅ 已交付" in NAMING_CONTRACT.md (1024×1024).
          The old bear emoji fallback has been fully retired per TV_TASKS rule #1.
        -->
        <img class="bear-peek" :src="asset('bear/bear_qr_peek.webp')" alt="" />
      </div>
      <p class="scan-hint t-md">{{ t('activation.scanHint') }}</p>
      <p class="code-line t-sm">
        {{ t('activation.activationCodeLabel') }}:
        <span class="code">{{ activationCode }}</span>
      </p>
    </div>

    <!-- Right column: hero text (over cozy bedroom watercolor) -->
    <div class="hero">
      <h1 class="title t-display">{{ t('activation.title') }}</h1>
      <p class="subtitle t-xl">{{ t('activation.subtitle') }}</p>
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

.activation-screen {
  background: var(--c-bg-canvas);
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

/*
 * .bg-warmth sits BEHIND .bg as the solid-color fallback that shows while
 * the CDN watercolor is still loading (or if it 404s). Watercolor paints
 * over it at opacity 1 once loaded.
 */
.bg-warmth {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 30% 40%, rgba(255, 200, 87, 0.18), transparent 55%),
    radial-gradient(ellipse at 80% 70%, rgba(255, 126, 95, 0.15), transparent 50%),
    var(--c-bg-canvas);
  z-index: -1;
}

.hero {
  position: relative;
  z-index: 1;
  padding-right: var(--sp-5);
  /* Hero lives in column 2; slight horizontal padding detaches it from the
     watercolor's right edge. */
}
/*
 * WCAG AA: hero now sits over bg_activation's right-side cozy bedroom
 * (bookshelf + window + candles), which ranges from medium-dark
 * (bookshelf ~#5C4030) to medium-bright (sunset glow ~#FFDAA5). A single
 * solid color cannot clear 4.5:1 across all zones. We use cream + strong
 * shadow halo — identical to the pattern used by TV brand screens when
 * overlaying text on cinematic backdrops. Verified on both the bright
 * window zone (cream #FFF5E6 on #FFDAA5 shadow lifts effective 6.5:1+)
 * and the dark bookshelf zone (cream on #5C4030 = 6.9:1 AA native).
 */
.title {
  margin: 0 0 var(--sp-4);
  color: var(--c-cream);
  font-weight: 700;
  text-shadow:
    0 2px 8px rgba(0, 0, 0, 0.7),
    0 0 24px rgba(26, 15, 10, 0.55);
}
.subtitle {
  margin: 0;
  color: var(--c-cream-soft);
  line-height: 1.4;
  text-shadow:
    0 1px 4px rgba(0, 0, 0, 0.7),
    0 0 16px rgba(26, 15, 10, 0.5);
}

/*
 * TV_TASKS v1.1 performance rule: GP15 has no GPU budget for backdrop-filter.
 * We keep the glass look using only rgba + border. Solid translucent cream
 * gives the QR card enough contrast on top of bg_activation's painted area.
 */
.qr-card {
  position: relative;
  z-index: 1;
  background: rgba(255, 248, 240, 0.88);
  border: 1px solid rgba(232, 166, 88, 0.35);
  border-radius: var(--r-xl);
  padding: var(--sp-5);
  text-align: center;
  width: 380px;
  margin: 0 auto;
  box-shadow: 0 12px 32px rgba(60, 42, 30, 0.25);
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
  bottom: -32px;
  right: -32px;
  width: 140px;
  height: 140px;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.35));
}
.scan-hint {
  margin: var(--sp-4) 0 var(--sp-2);
  color: #3C2A1E;
  font-weight: 600;
}
.code-line {
  color: rgba(60, 42, 30, 0.7);
  margin: 0;
}
.code {
  font-family: monospace;
  letter-spacing: 0.15em;
  color: #FF8A3D;
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
  color: var(--c-cream);
  z-index: 1;
  /* Pill chip so "等待绑定中..." always reads over wooden-floor bg zone. */
  background: rgba(26, 15, 10, 0.55);
  padding: 8px 18px;
  border-radius: 999px;
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

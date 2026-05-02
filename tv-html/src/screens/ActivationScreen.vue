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
import { useChildStore } from '@/stores/child';
import { bridge } from '@/services/bridge';
import { api } from '@/services/api';
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

/*
 * 2026-04-25 iter: 3-frame bear loop on the right column.
 * Cycles bear_talk -> bear_think -> bear_wave every 700ms with a CSS
 * cross-fade for warmth. Pure src-swap is fine since these assets are
 * pre-loaded in <link rel="prefetch"> if needed; the browser cache
 * absorbs the rest after the first cycle.
 */
const BEAR_FRAMES = ['bear_talk', 'bear_think', 'bear_wave'] as const;
const bearFrameIdx = ref<number>(0);
let bearTimer: number | null = null;

/*
 * 2026-04-25 iter: support the Back hardware key in dev / gallery mode.
 * Real first-boot activation has no prior screen, so we only honour Back
 * when ?dev=1 or ?gallery=1 is in the URL (preview / audit context).
 *
 * 2026-04-27: also enabled automatically under `npm run dev` (Vite DEV
 * build) so localhost without query params still gets the escape hatch.
 * Production builds are unaffected.
 */
let backHandler: ((e: KeyboardEvent) => void) | null = null;
function isDevPreview(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return p.has('dev') || p.has('gallery');
}

async function renderQrCode(): Promise<void> {
  if (!device.deviceId || !device.activationCode || !canvasEl.value) return;
  const url = buildBindingUrl(device.deviceId, device.activationCode, device.oem);
  bindingUrl.value = url;
  bridge.log('activation', { event: 'qr_url_built', url });
  try {
    await QRCode.toCanvas(canvasEl.value, url, {
      width: 240,
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
  // ═══ WO-3.26: dev/QA fast-path — skip activation when ?dev_skip_activation=1
  // and wb_dev_marker=kristy_qa_2026 cookie is present. ═══
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('dev_skip_activation') === '1') {
      const hasDevMarker = document.cookie.includes('wb_dev_marker=kristy_qa_2026');
      if (hasDevMarker) {
        console.log('[WO-3.26] Dev fast-path activated (cookie marker present)');
        // Inject fake device token matching real key 'wb_device_token' (api.ts:55).
        api.setDeviceToken('dev-fake-token-' + Date.now());
        // Mark device as bound so isActivated getter returns true.
        device.status = 'bound';
        device.serverDeviceId = 'dev-fake-device';
        // Seed default child Dora so Home/Create screens don't error.
        useChildStore().setActiveLocal({
          id: 'dev-fake-child-dora',
          parentId: 'dev-fake-parent',
          name: 'Dora',
          age: 5,
          gender: 'female',
          avatar: '',
          primaryLang: 'zh',
          secondLang: 'en',
          birthday: null,
          coins: 0,
          voiceId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        screen.go('home');
        return;
      } else {
        console.warn('[WO-3.26] dev_skip_activation=1 requested but no dev marker cookie');
      }
    }
  }

  // Subscribe FIRST, before any await — the mock bridge's autobind flag
  // (?autobind=1) fires 'activation-status-change' 2500ms after boot, and
  // if OEM config / QR render takes longer than that, the event would be
  // missed. In real-device land this also protects against native pushing
  // the status before the QR finishes drawing.
  unsubActivation.value = bridge.on('activation-status-change', (status) => {
    if (status === 'bound') onActivated();
  });

  device.loadDeviceInfo();
  if (!device.oem) await device.loadOemConfig();
  await renderQrCode();

  // Poll every 3s per kickoff hard rule §3
  pollTimer.value = window.setInterval(pollStatus, 3000);
  // Initial check
  pollStatus();

  // 3-frame bear loop
  bearTimer = window.setInterval(() => {
    bearFrameIdx.value = (bearFrameIdx.value + 1) % BEAR_FRAMES.length;
  }, 700);

  // Back key (dev preview only).
  // 2026-04-27: pre-mark device as bound in-memory so any global guard
  // that watches device.status (or HomeScreen children that 401 in dev)
  // doesn't yo-yo us back to ActivationScreen. Pure store mutation,
  // not persisted (no localStorage / API write).
  if (isDevPreview()) {
    backHandler = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' || e.key === 'Escape' || e.key === 'GoBack') {
        e.preventDefault();
        if (pollTimer.value !== null) {
          clearInterval(pollTimer.value);
          pollTimer.value = null;
        }
        unsubActivation.value?.();
        device.status = 'bound';
        screen.go('home');
      }
    };
    window.addEventListener('keydown', backHandler);
  }
});

onBeforeUnmount(() => {
  if (pollTimer.value !== null) clearInterval(pollTimer.value);
  unsubActivation.value?.();
  if (bearTimer !== null) clearInterval(bearTimer);
  if (backHandler) window.removeEventListener('keydown', backHandler);
});
</script>

<template>
  <div class="activation-screen">
    <!--
      2026-04-25 iter: switched to bg_send.webp (Kristy's new send-themed
      illustration — left frame stays as the QR overlay slot, right side
      keeps a soft warmth zone for the bear animation).
    -->
    <img
      class="bg"
      :src="asset('bg/bg_send.webp')"
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
    <!--
      Left column: QR card sits high in the watercolor's white frame slot.
      Iter 2026-04-25 round 3: bear is no longer above the QR (moved to a
      free-floating lower-left position) so the card returns to its
      original chest-height placement.
    -->
    <div class="qr-card">
      <div class="qr-frame">
        <canvas ref="canvasEl" class="qr-canvas"></canvas>
      </div>
      <p class="scan-hint t-md">{{ t('activation.scanHint') }}</p>
      <p class="code-line t-sm">
        {{ t('activation.activationCodeLabel') }}:
        <span class="code">{{ activationCode }}</span>
      </p>
    </div>

    <!--
      Right column: subtitle only.
      Iter 2026-04-25 round 6: text could clip on overscan-heavy TVs when
      anchored to the bottom; pulled to the TOP and shrunk one notch so
      it sits well inside the TV safe zone (top inset ≈ var(--sp-7)).
    -->
    <div class="hero">
      <p class="subtitle t-lg">{{ t('activation.subtitle') }}</p>
    </div>

    <!--
      Animated bear floats over the bottom-left of the watercolor (lower
      paw of the white rug). Absolute positioning lets it sit outside the
      2-column grid so the QR card stays compact and centered.
    -->
    <div class="bear-anim" aria-hidden="true">
      <img
        v-for="(name, i) in BEAR_FRAMES"
        :key="name"
        class="bear-frame"
        :class="{ active: bearFrameIdx === i }"
        :src="asset(`bear/${name}.webp`)"
        alt=""
      />
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
  /*
   * Iter 2026-04-25 round 8: the painted bear's ears start around y≈200
   * so the round-7 128px push collided with the head. Pulled back to
   * 48px top inset (still inside the TV safe zone, ~7% of 720h) so the
   * 3 lines fit between top edge and the bear's ear line.
   */
  align-self: start;
  padding: var(--sp-6) var(--sp-5) 0 var(--sp-7);
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
/*
 * Iter 2026-04-25 round 4: subtitle dialled down from display to xl so
 * the line wraps shorter and clears the painted bear's head; still solid
 * cream + heavy halo for readability over the watercolor.
 */
.subtitle {
  margin: 0;
  color: var(--c-cream);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0.005em;
  /*
   * Iter round 9: locale string carries an explicit \n so the line
   * breaks deterministically into 2 lines regardless of TV width.
   */
  white-space: pre-line;
  text-shadow:
    0 2px 8px rgba(0, 0, 0, 0.75),
    0 0 24px rgba(26, 15, 10, 0.55);
}

/*
 * 3-frame bear loop. Round 4: scaled up 160 → 220 so the lively bear
 * reads from across the room. Position nudged slightly so the bigger
 * footprint still sits clear of both the QR card and the screen edge.
 */
.bear-anim {
  position: absolute;
  left: 80px;
  bottom: 60px;
  width: 220px;
  height: 220px;
  z-index: 2;
  pointer-events: none;
  user-select: none;
}
.bear-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  transform: scale(0.96);
  transition: opacity 280ms var(--ease-out), transform 280ms var(--ease-out);
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
}
.bear-frame.active {
  opacity: 1;
  transform: scale(1);
}

/*
 * TV_TASKS v1.1 performance rule: GP15 has no GPU budget for backdrop-filter.
 * We keep the glass look using only rgba + border. Solid translucent cream
 * gives the QR card enough contrast on top of bg_activation's painted area.
 */
/*
 * Iter 2026-04-25 round 7: cream card chrome stripped — bg / border /
 * padding / shadow all dropped. Only the QR canvas (which already paints
 * its own cream bg as part of the QR image) and the helper text remain
 * floating directly on the watercolor.
 */
.qr-card {
  position: relative;
  z-index: 1;
  align-self: start;
  /* Round 10: pushed down ~64px so it lines up with the painted bear's
     mid-body — a touch lower feels more anchored on the watercolor. */
  margin: 96px auto 0 auto;
  text-align: center;
  width: 300px;
  background: transparent;
  border: 0;
  padding: 0;
  box-shadow: none;
}
.qr-frame {
  position: relative;
  display: inline-block;
  background: transparent;
  border-radius: 0;
  padding: 0;
}
.qr-canvas {
  display: block;
  width: 240px;
  height: 240px;
}
/*
 * Iter round 7: card chrome removed → these labels now sit directly on
 * the watercolor. Switched the dark-on-cream palette to dark-with-halo
 * so the text still reads on every zone of bg_send (mostly amber/cream
 * tones, deep enough to keep dark ink legible with a soft cream halo).
 */
.scan-hint {
  margin: var(--sp-4) 0 var(--sp-2);
  color: #3C2A1E;
  font-weight: 700;
  text-shadow: 0 0 12px rgba(255, 245, 230, 0.85);
}
.code-line {
  color: rgba(60, 42, 30, 0.85);
  margin: 0;
  text-shadow: 0 0 10px rgba(255, 245, 230, 0.8);
}
.code {
  font-family: monospace;
  letter-spacing: 0.15em;
  color: #C95A1A;
  font-weight: bold;
  text-shadow: 0 0 10px rgba(255, 245, 230, 0.85);
}

.bottom-strip {
  /*
   * Iter 2026-04-25 round 5: chip parked next to the animated bear's
   * right shoulder so the message reads with the action, not as an
   * unrelated bottom-of-screen status. This also frees up the right
   * column so the "Discover…" line below isn't bisected.
   */
  position: absolute;
  bottom: 110px;
  left: 310px;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--c-cream);
  z-index: 2;
  background: rgba(26, 15, 10, 0.6);
  padding: 8px 18px;
  border-radius: 999px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
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

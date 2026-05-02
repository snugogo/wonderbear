<!--
  ErrorScreen — generic error renderer.
  Reads screen.errorCode + dispatches per errorCodes.ts tvAction map.

  All 12 tvAction enum values are handled:
    silent_reactivate       → screen.go('home')
    show_on_h5_only         → screen.back() immediately (kid sees nothing)
    goto_activation         → screen.go('home')
    show_retry              → "Retry" button → screen.back()
    show_retry_countdown    → 5s countdown then auto-back
    show_upgrade_prompt     → bear + message, no retry (parent acts on H5)
    show_tomorrow           → bear_sleep + message, no retry
    rewind_dialogue         → restart dialogue from round 1
    redo_speak              → screen.back() (back to dialogue)
    silent_degrade_to_text  → log + immediate back (no UI shown)
    show_support_contact    → message + support email from oem
    goto_offline            → screen.go('offline')

  Hard rule (kickoff §一规则 4): NEVER show error code or English to children.
  All localization goes through getErrorInfo(code, locale).
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useScreenStore } from '@/stores/screen';
import { useDeviceStore } from '@/stores/device';
import { useDialogueStore } from '@/stores/dialogue';
import { useStoryStore } from '@/stores/story';
import { useI18n } from 'vue-i18n';
import { bridge } from '@/services/bridge';
import { useFocusable, getCurrentFocusId, onFocusChange } from '@/services/focus';
import { getErrorInfo, type Locale, type TvAction, type BearAsset } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';

const screen = useScreenStore();
const device = useDeviceStore();
const dialogue = useDialogueStore();
const storyStore = useStoryStore();
const { t, locale } = useI18n();

const COUNTDOWN_SEC = 5;

const retryEl = ref<HTMLElement | null>(null);
const homeEl = ref<HTMLElement | null>(null);
const focusedId = ref<string>('');
const countdown = ref<number>(0);
let countdownTimer: number | null = null;
let unsubFocus: (() => void) | null = null;
let mounted = true;

const errorCode = computed<number>(() => screen.errorCode ?? 50001);
const info = computed(() => getErrorInfo(errorCode.value, locale.value as Locale));

const action: TvAction = (() => info.value.tvAction)() as TvAction;

const bearImage = computed<string | null>(() => {
  const b: BearAsset = info.value.bear;
  return b ? asset(`bear/${b}.webp`) : null;
});

// Action plan derived from tvAction. Determines whether buttons are shown
// + how lifecycle behaves (auto-back, countdown, etc.)
const plan = computed<{
  showRetry: boolean;
  showHome: boolean;
  showCountdown: boolean;
  showSupport: boolean;
  autoExit: boolean;
}>(() => {
  switch (info.value.tvAction) {
    case 'show_retry':
      return { showRetry: true, showHome: true, showCountdown: false, showSupport: false, autoExit: false };
    case 'show_retry_countdown':
      return { showRetry: true, showHome: true, showCountdown: true, showSupport: false, autoExit: false };
    case 'show_upgrade_prompt':
    case 'show_tomorrow':
      return { showRetry: false, showHome: true, showCountdown: false, showSupport: false, autoExit: false };
    case 'show_support_contact':
      return { showRetry: false, showHome: true, showCountdown: false, showSupport: true, autoExit: false };
    case 'silent_reactivate':
    case 'goto_activation':
    case 'goto_offline':
    case 'rewind_dialogue':
    case 'redo_speak':
    case 'silent_degrade_to_text':
    case 'show_on_h5_only':
      return { showRetry: false, showHome: false, showCountdown: false, showSupport: false, autoExit: true };
    default:
      return { showRetry: true, showHome: true, showCountdown: false, showSupport: false, autoExit: false };
  }
});

const supportEmail = computed<string | null>(() =>
  device.oem?.support?.email ?? null,
);

function clearCountdown(): void {
  if (countdownTimer != null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function doRetry(): void {
  // For show_retry / show_retry_countdown — go back to where we came from
  // and let the previous screen retry naturally on mount.
  clearCountdown();
  screen.back();
}

function goHome(): void {
  clearCountdown();
  screen.go('home');
}

function performAutoExit(): void {
  switch (info.value.tvAction) {
    case 'silent_reactivate':
    case 'goto_activation':
      screen.go('home');
      break;
    case 'goto_offline':
      screen.go('offline');
      break;
    case 'rewind_dialogue':
      dialogue.reset();
      storyStore.clearGeneration();
      screen.go('dialogue');
      break;
    case 'redo_speak':
    case 'silent_degrade_to_text':
    case 'show_on_h5_only':
      // Step back to where we came from
      screen.back();
      break;
    default:
      screen.back();
  }
}

useFocusable(retryEl, {
  id: 'error-retry',
  autoFocus: plan.value.showRetry,
  neighbors: { right: 'error-home' },
  onEnter: doRetry,
  disabled: !plan.value.showRetry,
});

useFocusable(homeEl, {
  id: 'error-home',
  autoFocus: !plan.value.showRetry && plan.value.showHome,
  neighbors: { left: 'error-retry' },
  onEnter: goHome,
  disabled: !plan.value.showHome,
});

onMounted(() => {
  bridge.log('error-screen', { event: 'shown', code: errorCode.value, action });

  // Auto-exit actions: dispatch on next tick so the screen briefly mounts
  // (helps debugging via dev console) then jumps.
  if (plan.value.autoExit) {
    window.setTimeout(() => {
      if (mounted) performAutoExit();
    }, action === 'silent_degrade_to_text' || action === 'show_on_h5_only' ? 0 : 600);
    return;
  }

  if (plan.value.showCountdown) {
    countdown.value = COUNTDOWN_SEC;
    countdownTimer = window.setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0) {
        clearCountdown();
        if (mounted) doRetry();
      }
    }, 1000);
  }

  focusedId.value = getCurrentFocusId() ?? '';
  unsubFocus = onFocusChange((id) => {
    if (mounted) focusedId.value = id ?? '';
  });
});

onBeforeUnmount(() => {
  mounted = false;
  clearCountdown();
  unsubFocus?.();
});
</script>

<template>
  <div class="error-screen">
    <!-- TV_TASKS v1.1 P0-1: bg_welcome watercolor backdrop (warm, non-scary). -->
    <img class="bg" :src="asset('bg/bg_welcome.webp')" alt="" aria-hidden="true" />

    <!-- Auto-exit actions render almost nothing during the brief beat before redirect -->
    <div v-if="plan.autoExit" class="loading t-md">{{ t('common.loading') }}</div>

    <div v-else class="content">
      <img v-if="bearImage" class="bear" :src="bearImage" alt="">

      <h1 class="title t-xl">{{ t('error.title') }}</h1>
      <p class="message t-lg">{{ info.message }}</p>

      <p v-if="plan.showSupport && supportEmail" class="support t-md">
        <!--
          TV_TASKS rule #1: the envelope glyph is banned as an emoji symbol.
          Render as inline SVG until ui_envelope.svg lands (NAMING_CONTRACT C5).
        -->
        <svg
          class="email-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
        <span>{{ supportEmail }}</span>
      </p>

      <p v-if="plan.showCountdown && countdown > 0" class="countdown t-sm">
        {{ countdown }}…
      </p>

      <div v-if="plan.showRetry || plan.showHome" class="actions">
        <button
          v-if="plan.showRetry"
          ref="retryEl"
          class="action-btn primary wb-focus-feedback"
          :class="{ 'is-focused': focusedId === 'error-retry' }"
          type="button"
          @click="doRetry"
        >
          <span class="t-lg">{{ t('error.retry') }}</span>
        </button>
        <button
          v-if="plan.showHome"
          ref="homeEl"
          class="action-btn wb-focus-feedback"
          :class="{ 'is-focused': focusedId === 'error-home' }"
          type="button"
          @click="goHome"
        >
          <span class="t-lg">{{ t('error.backHome') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.error-screen {
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
.loading, .content { position: relative; z-index: 1; }

.loading {
  color: var(--c-cream-soft);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

/*
 * 2026-04-25 iter:
 *   - Bear shrunk 340 → 240 and stage padding bumped so the action
 *     buttons clear the TV safe zone (overscan eats ~5-7% bottom on
 *     cheap panels — was clipping the "Try again" button).
 *   - Message line was using cream-soft (rgba 70%) → muddy gray on the
 *     watercolor; switched to solid cream + heavier shadow halo.
 *   - Action buttons restyled to match the Story End cartoon
 *     vocabulary (rounded amber slabs with focus ring).
 */
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-7) var(--sp-6);
  text-align: center;
  max-width: 900px;
}

.bear {
  width: 240px;
  height: 240px;
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
.message {
  color: var(--c-cream);
  font-weight: 600;
  margin: 0 0 var(--sp-3);
  line-height: 1.5;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7), 0 0 18px rgba(26, 15, 10, 0.45);
}
.support {
  color: var(--c-amber);
  letter-spacing: 0.05em;
  margin: 0 0 var(--sp-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
}
.email-icon {
  width: 36px;
  height: 36px;
  color: var(--c-amber);
  flex: 0 0 auto;
}
.countdown {
  color: var(--c-amber);
  letter-spacing: 0.2em;
  font-variant-numeric: tabular-nums;
}

.actions {
  display: flex;
  gap: var(--sp-3);
  margin-top: var(--sp-3);
}

.action-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 245, 230, 0.12);
  border: 2px solid rgba(255, 200, 87, 0.35);
  color: var(--c-cream);
  padding: 14px 32px;
  border-radius: var(--r-lg);
  cursor: pointer;
  font-family: var(--ff-display);
  font-size: 24px;
  font-weight: 700;
  min-width: 200px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.55);
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.action-btn.primary {
  background: rgba(255, 200, 87, 0.22);
  border-color: var(--c-amber-soft);
}
.action-btn.is-focused {
  transform: scale(1.08);
  border-color: var(--c-amber);
  box-shadow:
    0 0 0 3px rgba(245, 158, 11, 0.55),
    0 0 22px 6px var(--c-focus-soft);
}
</style>

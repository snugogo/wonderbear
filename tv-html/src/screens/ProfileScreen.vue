<!--
  ProfileScreen — "My Den".
  TV v1.0 redesign iter3 (2026-04-25).

  Iter3 changes vs iter2 (per Kristy review):
    - Reduced font weights everywhere (700 → 500/600); titles felt too
      heavy on the cream-card surface.
    - Removed HintBar (visual noise; the focus glow is enough indicator).
    - Removed the right-side scrollbar; layout now fits 1280×624 without
      overflow.
    - Added a Family card showing family name + family id + masked parent
      phone, plus an always-visible QR code that points to the billing /
      management URL so the parent can scan to upgrade or manage the
      account at any time.
    - Layout reflowed to a 3-column grid below the kids strip:
        ACTIVE CHILD (320w) | GENERAL SETTINGS (1fr) | FAMILY + QR (260w)

  Iter4 changes (review round 2):
    - Removed background image (bg_home_cozy + radial tint); flat
      canvas color now backs the cards directly. Less noise.
    - Removed the explicit "Back to Home" button — Back hardware key
      already navigates back, button was redundant.
    - QR caption no longer truncated; family card column now flows
      content top-down (qr-wrap is not margin-top:auto'd, so the caption
      lives flush under the QR with full width).

  Source of truth (mock):
    - Family + per-child stats: src/mock/profile.json
    - Stars: src/mock/leaderboard.json self_summary
    - QR encodes profileMock.family.billing_qr_url
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import QRCode from 'qrcode';
import { useChildStore, ageToBucket } from '@/stores/child';
import { useDeviceStore } from '@/stores/device';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { useFocusable, getCurrentFocusId, onFocusChange } from '@/services/focus';
import { setLocale } from '@/i18n';
import type { Locale } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';
import leaderboardMock from '@/mock/leaderboard.json';
import profileMock from '@/mock/profile.json';

type SubPlan = 'free' | 'monthly' | 'yearly';
type BilingualMode = 'off' | 'zhEn' | 'enZh' | 'zhOnly' | 'enOnly';

interface KidSlot {
  id: string | null;
  name: string;
  age: number;
  avatar: string;
  active: boolean;
  isPlaceholder: boolean;
}

const child = useChildStore();
const device = useDeviceStore();
const bgm = useBgmStore();
const { t, locale } = useI18n();

const focusedId = ref<string>('');
let unsubFocus: (() => void) | null = null;
let mounted = true;

/* ───────────── Refs (focusable elements) ───────────── */
const kidEls = [
  ref<HTMLElement | null>(null),
  ref<HTMLElement | null>(null),
  ref<HTMLElement | null>(null),
  ref<HTMLElement | null>(null),
];
const bgmEl = ref<HTMLElement | null>(null);
const dlZhEl = ref<HTMLElement | null>(null);
const dlEnEl = ref<HTMLElement | null>(null);
const dlPlEl = ref<HTMLElement | null>(null);
const dlRoEl = ref<HTMLElement | null>(null);
const blOffEl = ref<HTMLElement | null>(null);
const blZhEnEl = ref<HTMLElement | null>(null);
const blEnZhEl = ref<HTMLElement | null>(null);
const blZhOnlyEl = ref<HTMLElement | null>(null);
const blEnOnlyEl = ref<HTMLElement | null>(null);
const qrCanvasEl = ref<HTMLCanvasElement | null>(null);

/* ───────────── Family / subscription ───────────── */
const family = profileMock.family as {
  subscription_plan: SubPlan;
  plan_expires_in_days: number;
  plan_renews_at: string;
  family_name: string;
  family_id: string;
  parent_phone_masked: string;
  billing_qr_url: string;
};

const subBadge = computed<string>(() => {
  if (family.subscription_plan === 'free') {
    return t('profile.subBadgeFree', { count: device.storiesLeft });
  }
  if (family.subscription_plan === 'monthly') {
    return t('profile.subBadgeMonthly', { days: family.plan_expires_in_days });
  }
  return t('profile.subBadgeYearly', { days: family.plan_expires_in_days });
});

const subBadgeClass = computed<string>(() =>
  `sub-badge sub-${family.subscription_plan}`
);

/* ───────────── Kids (max 4) ───────────── */
const kidSlots = computed<KidSlot[]>(() => {
  type DemoKid = { id: string; name: string; age: number; avatar: string; active: boolean };
  const live = child.allChildren && child.allChildren.length
    ? child.allChildren.map((c) => ({
        id: c.id,
        name: c.name,
        age: c.age,
        avatar: c.avatar || 'avatar_bear_classic',
        active: c.id === child.activeChildId,
      }))
    : (profileMock.kids_demo as DemoKid[]);

  const slots: KidSlot[] = [];
  for (let i = 0; i < 4; i++) {
    const k = live[i];
    if (k) {
      slots.push({
        id: k.id, name: k.name, age: k.age, avatar: k.avatar,
        active: k.active, isPlaceholder: false,
      });
    } else {
      slots.push({ id: null, name: '', age: 0, avatar: '', active: false, isPlaceholder: true });
    }
  }
  return slots;
});

const activeKid = computed<KidSlot | null>(() =>
  kidSlots.value.find((k) => k.active && !k.isPlaceholder) ?? kidSlots.value[0] ?? null
);

const activeAvatarUrl = computed<string>(() => {
  const av = activeKid.value?.avatar || 'avatar_bear_classic';
  return asset(`avatar/${av.endsWith('.webp') ? av : `${av}.webp`}`);
});

const activeAgeLine = computed<string>(() => {
  const k = activeKid.value;
  if (!k || k.isPlaceholder) return '';
  return `${k.age} · ${ageToBucket(k.age)}`;
});

/* ───────────── Per-child stats ───────────── */
function fmtMinutes(secs: number): string {
  const total = Math.max(0, Math.round(secs / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const activeStats = computed(() => {
  const id = activeKid.value?.id ?? null;
  type StatBlock = { stories_created: number; learn_seconds: number; watch_seconds: number };
  const byId = profileMock.child_stats.by_id as Record<string, StatBlock>;
  const fallback = profileMock.child_stats.default as StatBlock;
  const block = (id && byId[id]) ? byId[id] : fallback;
  return {
    stars: (leaderboardMock as { self_summary?: { stars?: number } }).self_summary?.stars ?? 0,
    stories: block.stories_created,
    learn: fmtMinutes(block.learn_seconds),
    watch: fmtMinutes(block.watch_seconds),
  };
});

/* ───────────── Bilingual setting (global, localStorage) ───────────── */
const bilingual = ref<BilingualMode>('off');

function readBilingualPref(): BilingualMode {
  try {
    const v = localStorage.getItem('wb_bilingual');
    if (v === 'zhEn' || v === 'enZh' || v === 'zhOnly' || v === 'enOnly' || v === 'off') return v;
  } catch { /* ignore */ }
  return 'off';
}
function setBilingual(mode: BilingualMode): void {
  bilingual.value = mode;
  try { localStorage.setItem('wb_bilingual', mode); } catch { /* ignore */ }
}

/* ───────────── Actions ───────────── */
async function selectKid(slot: KidSlot): Promise<void> {
  if (slot.isPlaceholder) {
    /* eslint-disable-next-line no-console */
    console.info('[profile] add-kid is parent-app only:', t('profile.kidsAddHint'));
    return;
  }
  if (!slot.id || slot.active) return;
  const dev = device.deviceId;
  if (!dev) {
    const local = child.allChildren.find((c) => c.id === slot.id) || null;
    if (local) child.setActiveLocal(local);
    return;
  }
  try {
    await child.setActive(slot.id, dev);
  } catch (e) {
    const local = child.allChildren.find((c) => c.id === slot.id) || null;
    if (local) child.setActiveLocal(local);
    /* eslint-disable-next-line no-console */
    console.info('[profile] setActive failed (dev?), used local fallback', e);
  }
}

function toggleBgm(): void { bgm.setEnabled(!bgm.enabled); }
function changeLocale(target: Locale): void {
  setLocale(target);
  try { localStorage.setItem('wb_locale', target); } catch { /* ignore */ }
}

async function renderQr(): Promise<void> {
  if (!qrCanvasEl.value) return;
  try {
    await QRCode.toCanvas(qrCanvasEl.value, family.billing_qr_url, {
      width: 168,
      margin: 1,
      color: { dark: '#1a0f0a', light: '#fff5e6' },
      errorCorrectionLevel: 'M',
    });
  } catch (e) {
    /* eslint-disable-next-line no-console */
    console.warn('[profile] qr render failed', e);
  }
}

/* ───────────── Focus wiring ───────────── */
useFocusable(kidEls[0], {
  id: 'profile-kid-0',
  autoFocus: true,
  neighbors: { right: 'profile-kid-1', down: 'profile-bgm' },
  onEnter: () => selectKid(kidSlots.value[0]),
});
useFocusable(kidEls[1], {
  id: 'profile-kid-1',
  neighbors: { left: 'profile-kid-0', right: 'profile-kid-2', down: 'profile-bgm' },
  onEnter: () => selectKid(kidSlots.value[1]),
});
useFocusable(kidEls[2], {
  id: 'profile-kid-2',
  neighbors: { left: 'profile-kid-1', right: 'profile-kid-3', down: 'profile-bgm' },
  onEnter: () => selectKid(kidSlots.value[2]),
});
useFocusable(kidEls[3], {
  id: 'profile-kid-3',
  neighbors: { left: 'profile-kid-2', down: 'profile-bgm' },
  onEnter: () => selectKid(kidSlots.value[3]),
});

useFocusable(bgmEl, {
  id: 'profile-bgm',
  neighbors: { up: 'profile-kid-0', down: 'profile-displaylang-zh' },
  onEnter: toggleBgm,
});

useFocusable(dlZhEl, {
  id: 'profile-displaylang-zh',
  neighbors: { up: 'profile-bgm', right: 'profile-displaylang-en', down: 'profile-bilingual-off' },
  onEnter: () => changeLocale('zh'),
});
useFocusable(dlEnEl, {
  id: 'profile-displaylang-en',
  neighbors: { up: 'profile-bgm', left: 'profile-displaylang-zh', right: 'profile-displaylang-pl', down: 'profile-bilingual-zhEn' },
  onEnter: () => changeLocale('en'),
});
useFocusable(dlPlEl, {
  id: 'profile-displaylang-pl',
  neighbors: { up: 'profile-bgm', left: 'profile-displaylang-en', right: 'profile-displaylang-ro', down: 'profile-bilingual-enZh' },
  onEnter: () => changeLocale('pl'),
});
useFocusable(dlRoEl, {
  id: 'profile-displaylang-ro',
  neighbors: { up: 'profile-bgm', left: 'profile-displaylang-pl', down: 'profile-bilingual-zhOnly' },
  onEnter: () => changeLocale('ro'),
});

useFocusable(blOffEl, {
  id: 'profile-bilingual-off',
  neighbors: { up: 'profile-displaylang-zh', right: 'profile-bilingual-zhEn' },
  onEnter: () => setBilingual('off'),
});
useFocusable(blZhEnEl, {
  id: 'profile-bilingual-zhEn',
  neighbors: { up: 'profile-displaylang-en', left: 'profile-bilingual-off', right: 'profile-bilingual-enZh' },
  onEnter: () => setBilingual('zhEn'),
});
useFocusable(blEnZhEl, {
  id: 'profile-bilingual-enZh',
  neighbors: { up: 'profile-displaylang-pl', left: 'profile-bilingual-zhEn', right: 'profile-bilingual-zhOnly' },
  onEnter: () => setBilingual('enZh'),
});
useFocusable(blZhOnlyEl, {
  id: 'profile-bilingual-zhOnly',
  neighbors: { up: 'profile-displaylang-ro', left: 'profile-bilingual-enZh', right: 'profile-bilingual-enOnly' },
  onEnter: () => setBilingual('zhOnly'),
});
useFocusable(blEnOnlyEl, {
  id: 'profile-bilingual-enOnly',
  neighbors: { up: 'profile-displaylang-ro', left: 'profile-bilingual-zhOnly' },
  onEnter: () => setBilingual('enOnly'),
});

onMounted(async () => {
  bgm.play('home');
  bilingual.value = readBilingualPref();
  focusedId.value = getCurrentFocusId() ?? '';
  unsubFocus = onFocusChange((id) => {
    if (mounted) focusedId.value = id ?? '';
  });
  child.refreshActive().catch(() => { /* keep stale */ });
  await renderQr();
});

onBeforeUnmount(() => {
  mounted = false;
  unsubFocus?.();
});

function isLocale(target: Locale): boolean { return locale.value === target; }
function isBilingual(mode: BilingualMode): boolean { return bilingual.value === mode; }
</script>

<template>
  <div class="profile-screen">
    <header class="topbar">
      <h1 class="title">{{ t('profile.title') }}</h1>
      <div :class="subBadgeClass">{{ subBadge }}</div>
    </header>

    <main class="stage">
      <!-- Kids strip — 4 fixed slots. -->
      <section class="kids-card">
        <div class="kids-title">{{ t('profile.kidsTitle') }}</div>
        <div class="kids-row">
          <button
            v-for="(slot, i) in kidSlots"
            :key="i"
            :ref="(el) => { kidEls[i].value = el as HTMLElement | null; }"
            class="kid-cell wb-focus-feedback"
            :class="{
              'is-focused': focusedId === `profile-kid-${i}`,
              'is-active': slot.active,
              'is-placeholder': slot.isPlaceholder,
            }"
            type="button"
            @click="selectKid(slot)"
          >
            <template v-if="!slot.isPlaceholder">
              <div class="avatar-wrap">
                <img class="kid-avatar" :src="asset(`avatar/${slot.avatar}.webp`)" alt="">
                <span v-if="slot.active" class="active-dot" aria-hidden="true"></span>
              </div>
              <div class="kid-name">{{ slot.name }}</div>
              <div class="kid-age">{{ slot.age }}y</div>
            </template>
            <template v-else>
              <div class="placeholder-circle"><span class="plus">+</span></div>
              <div class="kid-name kid-name-placeholder">{{ t('profile.kidsAddSlot') }}</div>
            </template>
          </button>
        </div>
      </section>

      <!-- Three-column row: active child / general settings / family+QR. -->
      <div class="grid-row">
        <!-- Active child detail -->
        <section class="active-card" v-if="activeKid && !activeKid.isPlaceholder">
          <div class="ac-head">
            <img class="ac-avatar" :src="activeAvatarUrl" alt="">
            <div class="ac-meta">
              <div class="ac-name">{{ activeKid.name }}</div>
              <div class="ac-age">{{ activeAgeLine }}</div>
            </div>
          </div>
          <div class="divider" aria-hidden="true"></div>
          <div class="stat-grid">
            <div class="stat-cell">
              <div class="stat-icon-line">{{ t('profile.statStars', { n: activeStats.stars }) }}</div>
              <div class="stat-label">{{ t('profile.starsLabel') }}</div>
            </div>
            <div class="stat-cell">
              <div class="stat-icon-line">{{ t('profile.statStoriesCreated', { n: activeStats.stories }) }}</div>
              <div class="stat-label">{{ t('profile.statStoriesLabel') }}</div>
            </div>
            <div class="stat-cell">
              <div class="stat-icon-line">{{ t('profile.statLearnTime', { time: activeStats.learn }) }}</div>
              <div class="stat-label">{{ t('profile.statLearnLabel') }}</div>
            </div>
            <div class="stat-cell">
              <div class="stat-icon-line">{{ t('profile.statWatchTime', { time: activeStats.watch }) }}</div>
              <div class="stat-label">{{ t('profile.statWatchLabel') }}</div>
            </div>
          </div>
        </section>

        <!-- General settings -->
        <section class="settings-card">
          <div class="section-title">{{ t('profile.sectionGeneral') }}</div>

          <button
            ref="bgmEl"
            class="setting-row wb-focus-feedback"
            :class="{ 'is-focused': focusedId === 'profile-bgm' }"
            type="button"
            @click="toggleBgm"
          >
            <span class="row-label">{{ t('profile.settings.bgm') }}</span>
            <span class="row-toggle" :class="{ on: bgm.enabled }">
              <span class="toggle-text">{{ bgm.enabled ? t('common.yes') : t('common.no') }}</span>
            </span>
          </button>

          <div class="setting-row chip-row">
            <span class="row-label">{{ t('profile.settings.displayLang') }}</span>
            <div class="chip-options">
              <button ref="dlZhEl" class="chip wb-focus-feedback"
                :class="{ 'is-focused': focusedId === 'profile-displaylang-zh', active: isLocale('zh') }"
                type="button" @click="changeLocale('zh')">中文</button>
              <button ref="dlEnEl" class="chip wb-focus-feedback"
                :class="{ 'is-focused': focusedId === 'profile-displaylang-en', active: isLocale('en') }"
                type="button" @click="changeLocale('en')">EN</button>
              <button ref="dlPlEl" class="chip wb-focus-feedback"
                :class="{ 'is-focused': focusedId === 'profile-displaylang-pl', active: isLocale('pl') }"
                type="button" @click="changeLocale('pl')">PL</button>
              <button ref="dlRoEl" class="chip wb-focus-feedback"
                :class="{ 'is-focused': focusedId === 'profile-displaylang-ro', active: isLocale('ro') }"
                type="button" @click="changeLocale('ro')">RO</button>
            </div>
          </div>

          <div class="setting-row chip-row">
            <span class="row-label">{{ t('profile.settings.bilingual') }}</span>
            <div class="chip-options">
              <button ref="blOffEl" class="chip wb-focus-feedback"
                :class="{ 'is-focused': focusedId === 'profile-bilingual-off', active: isBilingual('off') }"
                type="button" @click="setBilingual('off')">{{ t('profile.bilingual.off') }}</button>
              <button ref="blZhEnEl" class="chip wb-focus-feedback"
                :class="{ 'is-focused': focusedId === 'profile-bilingual-zhEn', active: isBilingual('zhEn') }"
                type="button" @click="setBilingual('zhEn')">{{ t('profile.bilingual.zhEn') }}</button>
              <button ref="blEnZhEl" class="chip wb-focus-feedback"
                :class="{ 'is-focused': focusedId === 'profile-bilingual-enZh', active: isBilingual('enZh') }"
                type="button" @click="setBilingual('enZh')">{{ t('profile.bilingual.enZh') }}</button>
              <button ref="blZhOnlyEl" class="chip wb-focus-feedback"
                :class="{ 'is-focused': focusedId === 'profile-bilingual-zhOnly', active: isBilingual('zhOnly') }"
                type="button" @click="setBilingual('zhOnly')">{{ t('profile.bilingual.zhOnly') }}</button>
              <button ref="blEnOnlyEl" class="chip wb-focus-feedback"
                :class="{ 'is-focused': focusedId === 'profile-bilingual-enOnly', active: isBilingual('enOnly') }"
                type="button" @click="setBilingual('enOnly')">{{ t('profile.bilingual.enOnly') }}</button>
            </div>
          </div>
        </section>

        <!-- Family info + always-on QR -->
        <section class="family-card">
          <div class="section-title">{{ t('profile.sectionFamily') }}</div>
          <div class="family-name">{{ family.family_name }}</div>
          <div class="family-meta">
            <div class="meta-row">
              <span class="meta-label">{{ t('profile.familyIdLabel') }}</span>
              <span class="meta-value">{{ family.family_id }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">{{ t('profile.familyParentLabel') }}</span>
              <span class="meta-value">{{ family.parent_phone_masked }}</span>
            </div>
          </div>
          <div class="qr-wrap">
            <canvas ref="qrCanvasEl" class="qr-canvas" width="168" height="168"></canvas>
          </div>
          <div class="qr-caption">{{ t('profile.qrCaption') }}</div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.profile-screen {
  width: 100%;
  height: 100%;
  position: relative;
  /* Iter4: dropped bg image; flat warm canvas backs the cards directly. */
  background:
    radial-gradient(ellipse at top,
      rgba(61, 36, 24, 0.35) 0%,
      var(--c-bg-canvas) 70%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ───── Topbar ───── */
.topbar {
  flex: 0 0 88px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--sp-6);
}
.title {
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 56px;
  margin: 0;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  letter-spacing: 0.01em;
}
.sub-badge {
  display: inline-flex;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  background: rgba(26, 15, 10, 0.55);
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 22px;
  border: 2px solid rgba(255, 245, 230, 0.18);
  letter-spacing: 0.02em;
}
.sub-yearly  { border-color: var(--c-amber); color: var(--c-amber); }
.sub-monthly { border-color: var(--c-amber-soft); color: var(--c-amber); }
.sub-free    { border-color: var(--c-coral);     color: var(--c-coral); }

/* ───── Stage (no overflow, no scrollbar) ───── */
.stage {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: 0 var(--sp-6) var(--sp-3);
  overflow: hidden;
  min-height: 0;
}

/* ───── Kids strip ───── */
.kids-card {
  width: 100%;
  max-width: 1180px;
  background: rgba(255, 245, 230, 0.94);
  border: 2px solid rgba(255, 200, 87, 0.45);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-card);
  padding: 12px var(--sp-5) 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 0 0 auto;
}
.kids-title {
  color: var(--c-bg-warm);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 20px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
}
.kids-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-3);
}
.kid-cell {
  appearance: none;
  background: rgba(255, 255, 255, 0.55);
  border: 2px solid rgba(255, 200, 87, 0.4);
  border-radius: var(--r-lg);
  padding: 8px 8px 10px;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: background var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out);
}
.kid-cell.is-active {
  background: rgba(255, 200, 87, 0.28);
  border-color: var(--c-amber);
}
.kid-cell.is-focused {
  border-color: var(--c-focus);
  box-shadow: var(--shadow-focus);
}
.kid-cell.is-placeholder {
  background: rgba(255, 255, 255, 0.25);
  border-style: dashed;
  border-color: rgba(61, 36, 24, 0.25);
}
.avatar-wrap {
  position: relative;
  width: 64px;
  height: 64px;
}
.kid-avatar {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 50%;
  background: var(--c-cream);
}
.active-dot {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--c-mint);
  border: 3px solid var(--c-cream);
}
.placeholder-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(61, 36, 24, 0.06);
  border: 2px dashed rgba(61, 36, 24, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}
.plus {
  color: rgba(61, 36, 24, 0.5);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 32px;
  line-height: 1;
}
.kid-name {
  color: var(--c-bg-deep);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 22px;
  text-align: center;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kid-name-placeholder {
  color: rgba(61, 36, 24, 0.55);
  font-weight: 500;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.kid-age {
  color: var(--c-bg-warm);
  font-size: 16px;
  opacity: 0.7;
}

/* ───── Three-column grid ───── */
.grid-row {
  width: 100%;
  max-width: 1180px;
  display: grid;
  grid-template-columns: 320px 1fr 280px;
  gap: var(--sp-3);
  align-items: stretch;
  flex: 1 1 auto;
  min-height: 0;
}
.active-card,
.settings-card,
.family-card {
  background: rgba(255, 245, 230, 0.94);
  border: 2px solid rgba(255, 200, 87, 0.45);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-card);
  padding: var(--sp-3) var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-height: 0;
}
.section-title {
  color: var(--c-bg-warm);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 18px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.65;
}

/* Active child card */
.ac-head { display: flex; align-items: center; gap: var(--sp-3); }
.ac-avatar {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid var(--c-amber);
  background: var(--c-cream);
}
.ac-meta { display: flex; flex-direction: column; gap: 2px; }
.ac-name {
  color: var(--c-bg-deep);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 32px;
  line-height: 1.1;
}
.ac-age {
  color: var(--c-bg-warm);
  font-size: 20px;
}
.divider {
  height: 1px;
  background: rgba(61, 36, 24, 0.18);
  margin: 2px 0;
}
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2);
}
.stat-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(255, 200, 87, 0.3);
  border-radius: var(--r-md);
}
.stat-icon-line {
  color: var(--c-bg-deep);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 24px;
  line-height: 1.1;
}
.stat-label {
  color: var(--c-bg-warm);
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
}

/* Settings rows */
.setting-row {
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  width: 100%;
  padding: 10px var(--sp-3);
  background: rgba(255, 255, 255, 0.55);
  border: 2px solid rgba(255, 200, 87, 0.4);
  border-radius: var(--r-md);
  font-family: inherit;
  cursor: pointer;
  color: var(--c-bg-deep);
  transition: background var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out);
}
.setting-row.chip-row { cursor: default; }
.setting-row.is-focused {
  border-color: var(--c-focus);
  background: rgba(255, 200, 87, 0.28);
  box-shadow: var(--shadow-focus);
}
.row-label {
  color: var(--c-bg-deep);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 22px;
  flex: 0 0 auto;
}
.row-toggle {
  display: inline-flex;
  align-items: center;
  padding: 4px 14px;
  border-radius: 999px;
  background: rgba(61, 36, 24, 0.08);
  border: 1px solid rgba(61, 36, 24, 0.2);
  min-width: 76px;
  justify-content: center;
}
.row-toggle.on {
  background: rgba(126, 214, 165, 0.35);
  border-color: var(--c-mint);
}
.toggle-text {
  color: var(--c-bg-deep);
  font-size: 20px;
  font-weight: 500;
}

/* Chip groups */
.chip-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}
.chip {
  appearance: none;
  background: rgba(255, 255, 255, 0.6);
  border: 2px solid rgba(255, 200, 87, 0.45);
  color: var(--c-bg-deep);
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 18px;
  min-width: 56px;
  transition: background var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              color var(--t-fast) var(--ease-out);
}
.chip.active {
  background: rgba(255, 200, 87, 0.35);
  border-color: var(--c-amber);
  color: var(--c-bg-deep);
}
.chip.is-focused {
  background: var(--c-focus);
  color: var(--c-cream);
  border-color: var(--c-focus);
  box-shadow: var(--shadow-focus);
}

/* Family card */
.family-card { align-items: center; }
.family-name {
  color: var(--c-bg-deep);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 24px;
  line-height: 1.1;
  margin-top: -4px;
}
.family-meta {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
  color: var(--c-bg-warm);
}
.meta-label { opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; font-size: 12px; }
.meta-value {
  color: var(--c-bg-deep);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 16px;
  letter-spacing: 0.02em;
}
.qr-wrap {
  margin-top: var(--sp-2);
  padding: 8px;
  background: var(--c-cream);
  border: 2px solid rgba(255, 200, 87, 0.45);
  border-radius: var(--r-md);
  line-height: 0;
  flex: 0 0 auto;
}
.qr-canvas {
  display: block;
  width: 168px;
  height: 168px;
}
.qr-caption {
  width: 100%;
  color: var(--c-bg-warm);
  font-family: var(--ff-display);
  font-weight: 500;
  font-size: 16px;
  opacity: 0.85;
  text-align: center;
  letter-spacing: 0.02em;
  line-height: 1.25;
  white-space: normal;
  flex: 0 0 auto;
}
</style>

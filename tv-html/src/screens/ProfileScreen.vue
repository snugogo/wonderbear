<!--
  ProfileScreen — "我的家" (My Home).
  PRD §4.6.

  TV uses deviceToken only — server's /subscription/* and /parent/me require
  parentToken (handled in parent H5). So this screen shows what TV can see:
    - Child profile card (name, age, avatar)
    - Per-device storiesLeft quota (from Device.storiesLeft, set on register/status)
    - BGM toggle (local preference, also synced from Parent.playBgm via /device/status)
    - Language switcher (4 locales)
    - "All other settings on parent app" hint

  No focusable arrow nav between rows yet — Up/Down between toggles is
  enough; horizontal nav inside language switcher uses neighbor map.
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useChildStore, ageToBucket } from '@/stores/child';
import { useDeviceStore } from '@/stores/device';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { useFocusable, getCurrentFocusId, onFocusChange } from '@/services/focus';
import { setLocale } from '@/i18n';
import type { Locale } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';

const child = useChildStore();
const device = useDeviceStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t, locale } = useI18n();

const bgmEl = ref<HTMLElement | null>(null);
const langZhEl = ref<HTMLElement | null>(null);
const langEnEl = ref<HTMLElement | null>(null);
const langPlEl = ref<HTMLElement | null>(null);
const langRoEl = ref<HTMLElement | null>(null);
const homeEl = ref<HTMLElement | null>(null);

const focusedId = ref<string>('');
let unsubFocus: (() => void) | null = null;
let mounted = true;

const childAvatarUrl = computed<string>(() => {
  const key = child.active?.avatar || 'avatar_bear_classic';
  // Server avatar field is just the key, e.g. "avatar_bear_classic" or "avatar_cat".
  // Strip a possible suffix and map to CDN folder layout.
  const filename = key.endsWith('.webp') ? key : `${key}.webp`;
  return asset(`avatar/${filename}`);
});

const childName = computed<string>(() => child.active?.name ?? t('home.greetingDefault'));
const childAge = computed<string>(() => {
  if (!child.active) return '';
  return `${child.active.age} · ${ageToBucket(child.active.age)}`;
});

function toggleBgm(): void {
  bgm.setEnabled(!bgm.enabled);
}

function changeLocale(target: Locale): void {
  setLocale(target);
  // Persist preference in localStorage so next boot uses it
  try { localStorage.setItem('wb_locale', target); } catch { /* ignore */ }
}

function goHome(): void {
  screen.go('home');
}

useFocusable(bgmEl, {
  id: 'profile-bgm',
  autoFocus: true,
  neighbors: { down: 'profile-lang-zh' },
  onEnter: toggleBgm,
});
useFocusable(langZhEl, {
  id: 'profile-lang-zh',
  neighbors: { up: 'profile-bgm', right: 'profile-lang-en', down: 'profile-home' },
  onEnter: () => changeLocale('zh'),
});
useFocusable(langEnEl, {
  id: 'profile-lang-en',
  neighbors: { up: 'profile-bgm', left: 'profile-lang-zh', right: 'profile-lang-pl', down: 'profile-home' },
  onEnter: () => changeLocale('en'),
});
useFocusable(langPlEl, {
  id: 'profile-lang-pl',
  neighbors: { up: 'profile-bgm', left: 'profile-lang-en', right: 'profile-lang-ro', down: 'profile-home' },
  onEnter: () => changeLocale('pl'),
});
useFocusable(langRoEl, {
  id: 'profile-lang-ro',
  neighbors: { up: 'profile-bgm', left: 'profile-lang-pl', down: 'profile-home' },
  onEnter: () => changeLocale('ro'),
});
useFocusable(homeEl, {
  id: 'profile-home',
  neighbors: { up: 'profile-lang-zh' },
  onEnter: goHome,
});

onMounted(() => {
  bgm.play('home');
  focusedId.value = getCurrentFocusId() ?? '';
  unsubFocus = onFocusChange((id) => {
    if (mounted) focusedId.value = id ?? '';
  });
  child.refreshActive().catch(() => { /* keep stale */ });
});

onBeforeUnmount(() => {
  mounted = false;
  unsubFocus?.();
});
</script>

<template>
  <div class="profile-screen">
    <!-- TV_TASKS v1.1 P0-1: bg_room watercolor. -->
    <img class="bg" :src="asset('bg/bg_room.webp')" alt="" aria-hidden="true" />

    <header class="topbar">
      <h1 class="title t-xl">{{ t('profile.title') }}</h1>
    </header>

    <main class="content">
      <!-- Child card -->
      <section class="child-card">
        <img class="avatar" :src="childAvatarUrl" alt="">
        <div class="child-info">
          <div class="t-2xl child-name">{{ childName }}</div>
          <div v-if="childAge" class="t-md child-age">{{ childAge }}</div>
          <div class="t-md stories-left">
            <img class="coin" :src="asset('deco/deco_coins.webp')" alt="">
            <span>{{ t('profile.storiesRemaining', { count: device.storiesLeft }) }}</span>
          </div>
        </div>
      </section>

      <!-- Settings -->
      <section class="settings">
        <button
          ref="bgmEl"
          class="setting-row wb-focus-feedback"
          :class="{ 'is-focused': focusedId === 'profile-bgm' }"
          type="button"
          @click="toggleBgm"
        >
          <span class="t-md row-label">{{ t('profile.settings.bgm') }}</span>
          <span class="row-toggle" :class="{ on: bgm.enabled }">
            <span class="t-sm toggle-text">{{ bgm.enabled ? t('common.yes') : t('common.no') }}</span>
          </span>
        </button>

        <div class="lang-row">
          <span class="t-md row-label">{{ t('profile.settings.language') }}</span>
          <div class="lang-options">
            <button
              ref="langZhEl"
              class="lang-btn wb-focus-feedback"
              :class="{ 'is-focused': focusedId === 'profile-lang-zh', active: locale === 'zh' }"
              type="button"
              @click="changeLocale('zh')"
            >中文</button>
            <button
              ref="langEnEl"
              class="lang-btn wb-focus-feedback"
              :class="{ 'is-focused': focusedId === 'profile-lang-en', active: locale === 'en' }"
              type="button"
              @click="changeLocale('en')"
            >EN</button>
            <button
              ref="langPlEl"
              class="lang-btn wb-focus-feedback"
              :class="{ 'is-focused': focusedId === 'profile-lang-pl', active: locale === 'pl' }"
              type="button"
              @click="changeLocale('pl')"
            >PL</button>
            <button
              ref="langRoEl"
              class="lang-btn wb-focus-feedback"
              :class="{ 'is-focused': focusedId === 'profile-lang-ro', active: locale === 'ro' }"
              type="button"
              @click="changeLocale('ro')"
            >RO</button>
          </div>
        </div>
      </section>

      <button
        ref="homeEl"
        class="home-btn wb-focus-feedback"
        :class="{ 'is-focused': focusedId === 'profile-home' }"
        type="button"
        @click="goHome"
      >
        <span class="t-lg">{{ t('error.backHome') }}</span>
      </button>
    </main>
  </div>
</template>

<style scoped>
.profile-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-canvas);
  display: flex;
  flex-direction: column;
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
.topbar, .content { position: relative; z-index: 1; }

.topbar {
  flex: 0 0 auto;
  height: 70px;
  display: flex;
  align-items: center;
  padding: 0 var(--sp-6);
  /* WCAG AA contrast strip over watercolor bg. */
  background: linear-gradient(180deg,
    rgba(26, 15, 10, 0.65) 0%,
    rgba(26, 15, 10, 0.35) 70%,
    rgba(26, 15, 10, 0) 100%);
}
.title {
  color: var(--c-cream);
  font-weight: 700;
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-4);
  padding: 0 var(--sp-6) var(--sp-5);
  overflow-y: auto;
}

.child-card {
  width: 100%;
  max-width: 720px;
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  padding: var(--sp-4);
  background: rgba(255, 245, 230, 0.05);
  border-radius: var(--r-lg);
  border: 1px solid rgba(255, 200, 87, 0.15);
}
.avatar {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid var(--c-amber-soft);
}
.child-info {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.child-name { color: var(--c-cream); font-weight: 700; line-height: 1.1; }
.child-age { color: var(--c-cream-soft); }
.stories-left {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--c-amber);
  margin-top: var(--sp-1);
}
.coin { width: 28px; height: 28px; object-fit: contain; }

.settings {
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.setting-row, .lang-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-4);
  background: rgba(255, 245, 230, 0.04);
  border: 2px solid rgba(255, 200, 87, 0.12);
  border-radius: var(--r-md);
  font-family: inherit;
  cursor: pointer;
  transition: all var(--t-fast) var(--ease-out);
}
.setting-row { appearance: none; color: inherit; width: 100%; }
.setting-row.is-focused {
  border-color: var(--c-amber);
  background: rgba(255, 200, 87, 0.12);
  box-shadow: var(--shadow-focus);
}
.row-label { color: var(--c-cream); }
.row-toggle {
  display: inline-flex;
  align-items: center;
  padding: 4px 14px;
  border-radius: 999px;
  background: rgba(255, 245, 230, 0.1);
  border: 1px solid rgba(255, 245, 230, 0.2);
  min-width: 70px;
  justify-content: center;
}
.row-toggle.on {
  background: rgba(126, 214, 165, 0.25);
  border-color: var(--c-mint);
}
.toggle-text { color: var(--c-cream); font-weight: 600; }

.lang-options {
  display: flex;
  gap: var(--sp-2);
}
.lang-btn {
  appearance: none;
  background: rgba(255, 245, 230, 0.06);
  border: 2px solid rgba(255, 200, 87, 0.18);
  color: var(--c-cream-soft);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  min-width: 56px;
  transition: all var(--t-fast) var(--ease-out);
}
.lang-btn.active {
  background: rgba(255, 200, 87, 0.18);
  color: var(--c-cream);
  border-color: var(--c-amber-soft);
}
/* Spring transform lives on .wb-focus-feedback.is-focused (global). */
.lang-btn.is-focused {
  background: var(--c-amber);
  color: #1a0f0a;
  border-color: var(--c-amber);
  box-shadow: var(--shadow-focus);
}

.home-btn {
  appearance: none;
  background: rgba(255, 245, 230, 0.06);
  border: 2px solid rgba(255, 200, 87, 0.18);
  color: var(--c-cream);
  padding: var(--sp-3) var(--sp-6);
  border-radius: var(--r-lg);
  cursor: pointer;
  font-family: inherit;
  margin-top: var(--sp-2);
  min-width: 240px;
  transition: all var(--t-fast) var(--ease-out);
}
/* Spring transform lives on .wb-focus-feedback.is-focused (global). */
.home-btn.is-focused {
  background: var(--c-amber);
  border-color: var(--c-amber);
  color: #1a0f0a;
  box-shadow: var(--shadow-focus);
}
</style>

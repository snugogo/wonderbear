<!--
  HomeScreen — 6-card menu landing.
  Per PRD §4.2.

  Layout:
    - Top status bar: avatar + name + coins | logo | switch-child
    - 6 menu cards in 3×2 grid (uses MenuCard component for ref encapsulation)
    - 120ms direction throttle handled in focus/keyRouter (global)
-->

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useChildStore } from '@/stores/child';
import { useDeviceStore } from '@/stores/device';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import MenuCard from '@/components/MenuCard.vue';
import type { FocusableNeighbors } from '@/services/focus';
import { asset } from '@/utils/assets';

const child = useChildStore();
const device = useDeviceStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

/*
 * TV_TASKS_v6 task 1 + v1.1 P0-2:
 * The six home-card icons (ui/ui_home_*.webp) are still in "P0 A / 状态 ⏳"
 * per NAMING_CONTRACT.md. We ship a letter placeholder and the final asset
 * path is already wired. When USE_ICON_ASSETS flips to true, MenuCard
 * auto-renders <img> without any other code change.
 */
const USE_ICON_ASSETS = false;

interface MenuItem {
  id: string;
  i18nKey: string;
  letter: string;
  icon: string;
  enabled: boolean;
  neighbors: FocusableNeighbors;
  action: () => void;
}

const menus: MenuItem[] = [
  // Row 1
  {
    id: 'home-card-create',
    i18nKey: 'home.menus.create',
    letter: 'C', icon: 'ui/ui_home_create.webp',
    enabled: true,
    neighbors: { right: 'home-card-stories', down: 'home-card-explore' },
    action: () => screen.go('dialogue'),
  },
  {
    id: 'home-card-stories',
    i18nKey: 'home.menus.stories',
    letter: 'S', icon: 'ui/ui_home_stories_map.webp',
    enabled: false,
    neighbors: { left: 'home-card-create', right: 'home-card-library', down: 'home-card-profile' },
    action: () => {},
  },
  {
    id: 'home-card-library',
    i18nKey: 'home.menus.library',
    letter: 'L', icon: 'ui/ui_home_library.webp',
    enabled: true,
    neighbors: { left: 'home-card-stories', down: 'home-card-cast' },
    action: () => screen.go('library'),
  },
  // Row 2
  {
    id: 'home-card-explore',
    i18nKey: 'home.menus.explore',
    letter: 'E', icon: 'ui/ui_home_explore.webp',
    enabled: false,
    neighbors: { right: 'home-card-profile', up: 'home-card-create' },
    action: () => {},
  },
  {
    id: 'home-card-profile',
    i18nKey: 'home.menus.profile',
    letter: 'P', icon: 'ui/ui_home_profile.webp',
    enabled: true,
    neighbors: { left: 'home-card-explore', right: 'home-card-cast', up: 'home-card-stories' },
    action: () => screen.go('profile'),
  },
  {
    id: 'home-card-cast',
    i18nKey: 'home.menus.cast',
    letter: 'T', icon: 'ui/ui_home_cast.webp',
    enabled: false,
    neighbors: { left: 'home-card-profile', up: 'home-card-library' },
    action: () => {},
  },
];

/** Active child avatar, replaces the former bear emoji in the top bar. */
const childAvatarUrl = computed<string>(() => {
  const key = child.active?.avatar || 'avatar_bear_classic';
  const filename = key.endsWith('.webp') ? key : `${key}.webp`;
  return asset(`avatar/${filename}`);
});

function handleEnter(id: string): void {
  const item = menus.find((m) => m.id === id);
  item?.action();
}

function greeting(): string {
  const name = child.active?.name;
  return name ? t('home.greeting', { name }) : t('home.greetingDefault');
}

onMounted(async () => {
  bgm.play('home');
  child.refreshActive().catch(() => { /* default greeting */ });
});
</script>

<template>
  <div class="home-screen">
    <!--
      TV_TASKS v1.1 P0-1: every screen that has a bg_ watercolor must use it.
      bg_home_cozy is listed as P2-H (optional, not yet delivered) in
      NAMING_CONTRACT.md §H — per contract "代码先写,图后到", we reference it
      now and the browser will fall through to the base --c-bg-canvas color
      until the designer pushes the image.
    -->
    <img class="bg" :src="asset('bg/bg_home_cozy.webp')" alt="" aria-hidden="true" onerror="this.style.display='none'" />

    <!--
      TV_TASKS v1.1 P0-3: bear_idle decoration bottom-right of home, 280×280.
      Kept separate from the 6 menu cards so it reads as a passive companion.
    -->
    <img
      class="home-bear-deco"
      :src="asset('bear/bear_idle.webp')"
      alt=""
      aria-hidden="true"
    />

    <!-- Top status bar -->
    <header class="topbar">
      <div class="topbar-left">
        <!-- bear emoji replaced by the active child's avatar image per TV_TASKS_v6 rule #1. -->
        <img class="avatar" :src="childAvatarUrl" alt="" />
        <div class="meta">
          <div class="t-md greeting">{{ greeting() }}</div>
          <div class="t-sm coins">
            <!-- coin emoji replaced by deco/deco_coins.webp (already in git). -->
            <img class="coin-icon" :src="asset('deco/deco_coins.webp')" alt="" />
            <span>{{ child.active?.coins ?? 0 }}</span>
          </div>
        </div>
      </div>
      <div class="topbar-center">
        <div class="logo t-lg">{{ device.brandName }}</div>
      </div>
      <div class="topbar-right">
        <div class="t-sm switch-child">{{ t('home.switchChild') }}</div>
      </div>
    </header>

    <!-- 6-card grid -->
    <div class="menu-grid">
      <MenuCard
        v-for="item in menus"
        :key="item.id"
        :id="item.id"
        :label="t(item.i18nKey)"
        :letter="item.letter"
        :icon="USE_ICON_ASSETS ? item.icon : ''"
        :enabled="item.enabled"
        :auto-focus="item.id === 'home-card-create'"
        :neighbors="item.neighbors"
        :coming-soon-label="!item.enabled ? t('home.menuComingSoon') : ''"
        @enter="handleEnter"
      />
    </div>
  </div>
</template>

<style scoped>
.home-screen {
  width: 100%;
  height: 100%;
  position: relative;
  /* Solid warm fallback; bg_home_cozy img overlays this when delivered. */
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
  opacity: 0.55;
  z-index: 0;
  user-select: none;
  pointer-events: none;
}

.home-bear-deco {
  position: absolute;
  bottom: -24px;
  right: -24px;
  width: 280px;
  height: 280px;
  object-fit: contain;
  opacity: 0.9;
  z-index: 0;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.35));
  pointer-events: none;
  user-select: none;
}

/* Keep topbar + grid above background layers. */
.topbar, .menu-grid {
  position: relative;
  z-index: 1;
}

.topbar {
  flex: 0 0 auto;
  height: 80px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 var(--sp-5);
}
.topbar-left { display: flex; align-items: center; gap: var(--sp-3); }
.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 200, 87, 0.2);
  object-fit: cover;
  border: 2px solid var(--c-amber-soft);
}
.greeting { color: var(--c-cream); font-weight: 600; }
.coins {
  color: var(--c-amber);
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
}
.coin-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  margin-right: 4px;
}
.topbar-center { text-align: center; }
.logo {
  color: var(--c-cream-soft);
  letter-spacing: 0.1em;
  font-weight: 700;
}
.topbar-right { text-align: right; color: var(--c-cream-soft); }
.switch-child { padding: var(--sp-2) var(--sp-3); }

.menu-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: 1fr 1fr;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-6) var(--sp-6);
}
</style>

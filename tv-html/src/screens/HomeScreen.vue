<!--
  HomeScreen — 6-card menu landing.
  Per PRD §4.2.

  Layout:
    - Top status bar: avatar + name + coins | logo | switch-child
    - 6 menu cards in 3×2 grid (uses MenuCard component for ref encapsulation)
    - 120ms direction throttle handled in focus/keyRouter (global)
-->

<script setup lang="ts">
import { onMounted } from 'vue';
import { useChildStore } from '@/stores/child';
import { useDeviceStore } from '@/stores/device';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import MenuCard from '@/components/MenuCard.vue';
import type { FocusableNeighbors } from '@/services/focus';

const child = useChildStore();
const device = useDeviceStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

interface MenuItem {
  id: string;
  i18nKey: string;
  emoji: string;
  enabled: boolean;
  neighbors: FocusableNeighbors;
  action: () => void;
}

const menus: MenuItem[] = [
  // Row 1
  {
    id: 'home-card-create', i18nKey: 'home.menus.create', emoji: '🎨', enabled: true,
    neighbors: { right: 'home-card-stories', down: 'home-card-explore' },
    action: () => screen.go('dialogue'),
  },
  {
    id: 'home-card-stories', i18nKey: 'home.menus.stories', emoji: '🗺', enabled: false,
    neighbors: { left: 'home-card-create', right: 'home-card-library', down: 'home-card-profile' },
    action: () => {},
  },
  {
    id: 'home-card-library', i18nKey: 'home.menus.library', emoji: '📚', enabled: true,
    neighbors: { left: 'home-card-stories', down: 'home-card-cast' },
    action: () => screen.go('library'),
  },
  // Row 2
  {
    id: 'home-card-explore', i18nKey: 'home.menus.explore', emoji: '🏆', enabled: false,
    neighbors: { right: 'home-card-profile', up: 'home-card-create' },
    action: () => {},
  },
  {
    id: 'home-card-profile', i18nKey: 'home.menus.profile', emoji: '🏠', enabled: true,
    neighbors: { left: 'home-card-explore', right: 'home-card-cast', up: 'home-card-stories' },
    action: () => screen.go('profile'),
  },
  {
    id: 'home-card-cast', i18nKey: 'home.menus.cast', emoji: '📺', enabled: false,
    neighbors: { left: 'home-card-profile', up: 'home-card-library' },
    action: () => {},
  },
];

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
    <!-- Top status bar -->
    <header class="topbar">
      <div class="topbar-left">
        <div class="avatar">🐻</div>
        <div class="meta">
          <div class="t-md greeting">{{ greeting() }}</div>
          <div class="t-sm coins">
            <span class="coin-icon">🪙</span> {{ child.active?.coins ?? 0 }}
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
        :emoji="item.emoji"
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
  background:
    radial-gradient(ellipse at 20% 10%, rgba(255, 200, 87, 0.12), transparent 50%),
    radial-gradient(ellipse at 80% 90%, rgba(126, 214, 165, 0.10), transparent 55%),
    var(--c-bg-canvas);
  display: flex;
  flex-direction: column;
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
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 200, 87, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  border: 2px solid var(--c-amber-soft);
}
.greeting { color: var(--c-cream); font-weight: 600; }
.coins { color: var(--c-amber); }
.coin-icon { margin-right: 4px; }
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

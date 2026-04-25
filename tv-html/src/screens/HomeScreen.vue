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
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import MenuCard from '@/components/MenuCard.vue';
// HintBar removed from Home 2026-04-24 iter6; kept import-free.
import type { FocusableNeighbors } from '@/services/focus';
import { asset } from '@/utils/assets';

const child = useChildStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

/*
 * 2026-04-23: flipped to true after CDN verification.
 * All 6 ui/ui_home_*.webp confirmed 200 on jsDelivr
 * (create / stories_map / library / explore / profile / cast).
 * MenuCard auto-renders <img>; letter placeholder removed from Home.
 */
const USE_ICON_ASSETS = true;

interface MenuItem {
  id: string;
  i18nKey: string;
  letter: string;
  icon: string;
  enabled: boolean;
  neighbors: FocusableNeighbors;
  action: () => void;
}

/*
 * TV v1.0 §2.1 — locked 6-entry layout (3×2):
 *
 *   Row 1: [ 1. 来讲故事 / Create     ] [ 2. 故事乐园 / Stories ] [ 3. 小熊星光 / Bear Stars ]
 *   Row 2: [ 4. 手机投屏 / Cast       ] [ 5. 小熊小屋 / My Den  ] [ 6. 系统设置 / Settings   ]
 *
 * Card #2 (Stories) → /library, Card #3 (Bear Stars) → /leaderboard (NEW),
 * Cards 4 / 6 are stubs (Cast / Settings) wired later via native bridge.
 *
 * Per founder note in TV_ASSETS_IN_USE.md §maint #4: Card #5 keeps
 * `bear/bear_my_home.webp` art (NOT ui_home_profile). Don't revert.
 */
function stubAction(kind: string): () => void {
  return () => {
    // Real wiring goes to native bridge later (window.AndroidBridge.openSettings()).
    // eslint-disable-next-line no-console
    console.log(`[home] stub card '${kind}' pressed — native jump not wired yet`);
  };
}

const menus: MenuItem[] = [
  // Row 1
  {
    id: 'home-card-create',
    i18nKey: 'home.menus.create',
    letter: 'C', icon: 'ui/ui_home_create.webp',
    enabled: true,
    neighbors: { right: 'home-card-stories', down: 'home-card-cast' },
    action: () => screen.go('create'),
  },
  {
    id: 'home-card-stories',
    // §2.1 #2: 故事乐园 / Stories → /library
    i18nKey: 'home.menus.stories',
    letter: 'S', icon: 'ui/ui_home_library.webp',
    enabled: true,
    neighbors: { left: 'home-card-create', right: 'home-card-bearstars', down: 'home-card-myden' },
    action: () => screen.go('library'),
  },
  {
    id: 'home-card-bearstars',
    // §2.1 #3: 小熊星光 / Bear Stars → /leaderboard (NEW screen).
    i18nKey: 'home.menus.bearStars',
    letter: 'B', icon: 'ui/ui_home_stories_map.webp',
    enabled: true,
    neighbors: { left: 'home-card-stories', down: 'home-card-settings' },
    action: () => screen.go('leaderboard'),
  },
  // Row 2
  {
    id: 'home-card-cast',
    i18nKey: 'home.menus.cast',
    letter: 'T', icon: 'ui/ui_home_cast.webp',
    enabled: true,
    neighbors: { right: 'home-card-myden', up: 'home-card-create' },
    action: stubAction('cast'),
  },
  {
    id: 'home-card-myden',
    // §2.1 #5: 小熊小屋 / My Den → /profile.
    i18nKey: 'home.menus.myDen',
    letter: 'P', icon: 'bear/bear_my_home.webp',
    enabled: true,
    neighbors: { left: 'home-card-cast', right: 'home-card-settings', up: 'home-card-stories' },
    action: () => screen.go('profile'),
  },
  {
    id: 'home-card-settings',
    i18nKey: 'home.menus.settings',
    letter: 'G', icon: 'ui/ui_home_explore.webp',
    enabled: true,
    neighbors: { left: 'home-card-myden', up: 'home-card-bearstars' },
    action: stubAction('settings'),
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
      bg_home_cozy already paints cozy bears / shelves / plants in the
      background watercolor, so a foreground bear_idle deco adds visual
      noise and competes with the 6 menu cards for attention. Removed
      2026-04-23; re-add with a smaller deco if designer asks.
    -->

    <!-- Top status bar — iter5: "Switch child" removed; child switching lives
         on the Profile screen. Home topbar only *reads* the current child. -->
    <header class="topbar">
      <div class="topbar-left">
        <img class="avatar" :src="childAvatarUrl" alt="" />
        <div class="meta">
          <div class="greeting wb-text-outline">{{ greeting() }}</div>
          <div class="coins wb-text-outline-sm">
            <img class="coin-icon" :src="asset('deco/deco_coins.webp')" alt="" />
            <span>{{ child.active?.coins ?? 0 }}</span>
          </div>
        </div>
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

    <!--
      iter6: HintBar removed entirely from Home — the 6 bear cards speak
      for themselves. Frees up the bottom 40-ish px for bigger bears.
      (Other screens still use HintBar; this is a Home-only removal.)
    -->

    
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
  opacity: 1;
  z-index: 0;
  user-select: none;
  pointer-events: none;
}

/* Keep topbar + grid above background layers. */
.topbar, .menu-grid {
  position: relative;
  z-index: 1;
}

.topbar {
  flex: 0 0 auto;
  /* iter5: TV safe-area top padding 36 px (≈5% of 720 vertical overscan).
   * Removed 3-column grid since the right slot (Switch child) is gone — now
   * just a left-aligned status block. Topbar wrapper height = 40 px content
   * + 36 px top safe-area = 76 px. */
  height: 76px;
  display: flex;
  align-items: center;
  padding: 36px 64px 8px;
  /*
   * 2026-04-24 Phase B iter2: the dark gradient strip is no longer needed
   * now that every topbar text carries .wb-text-outline* (4-way black
   * stroke + glow). Letting the watercolor show through full strength
   * stops the topbar reading as a chrome bar floating above the scene.
   */
}
.topbar-left { display: flex; align-items: center; gap: var(--sp-3); }
.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 200, 87, 0.2);
  object-fit: cover;
  border: 2px solid var(--c-focus);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
}
/*
 * iter5: topbar is read-only status; font-sizes reduced so the block
 * stays compact inside the 36 px top safe-area.
 */
.greeting {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
}
.coins {
  color: var(--c-cream);
  font-size: 18px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
}
.coin-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  margin-right: 4px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
}
/* iter5: topbar-center / topbar-right / switch-child rules removed — DOM is gone. */

.menu-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: 1fr 1fr;
  /*
   * iter11: TV overscan on some panels crops the bottom 60-80 px, pushing
   * the lower row off-screen. Bumped bottom padding from 36→96 px and
   * reduced top/gap so both rows shift up into the visible center zone.
   *   top padding:   16 →  0
   *   row gap:       16 →  0   (rows tighten together)
   *   bottom pad:    36 → 96   (keep bottom bears safe from overscan crop)
   */
  gap: 0;
  padding: 0 64px 96px;
  min-height: 0;
}
</style>

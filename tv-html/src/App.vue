<!--
  Root App component.
  - Maps current screen name → component
  - Mounts DevConsole only in dev
  - Subscribes to global bridge events (network, voice key) at mount time
-->

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, defineAsyncComponent, ref } from 'vue';
import { useScreenStore, type ScreenName } from '@/stores/screen';
import { useDeviceStore } from '@/stores/device';
import { useDialogueStore } from '@/stores/dialogue';
import { bridge } from '@/services/bridge';
import { setGlobalBackFallback, onFocusChange, getCurrentFocusId } from '@/services/focus';

import ActivationScreen from '@/screens/ActivationScreen.vue';
import HomeScreen from '@/screens/HomeScreen.vue';
import CreateScreen from '@/screens/CreateScreen.vue';
import DialogueScreen from '@/screens/DialogueScreen.vue';
import StoryPreviewScreen from '@/screens/StoryPreviewScreen.vue';
import GeneratingScreen from '@/screens/GeneratingScreen.vue';
import StoryCoverScreen from '@/screens/StoryCoverScreen.vue';
import StoryBodyScreen from '@/screens/StoryBodyScreen.vue';
import StoryEndScreen from '@/screens/StoryEndScreen.vue';
import LibraryScreen from '@/screens/LibraryScreen.vue';
import FavoritesScreen from '@/screens/FavoritesScreen.vue';
import LearningScreen from '@/screens/LearningScreen.vue';
import ProfileScreen from '@/screens/ProfileScreen.vue';
import LeaderboardScreen from '@/screens/LeaderboardScreen.vue';
import CreateInviteScreen from '@/screens/CreateInviteScreen.vue';
import OfflineScreen from '@/screens/OfflineScreen.vue';
import ErrorScreen from '@/screens/ErrorScreen.vue';

// Tree-shake DevConsole from production bundle
const DevConsole = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/components/DevConsole.vue'))
  : null;

const screen = useScreenStore();
const device = useDeviceStore();
const dialogue = useDialogueStore();

const screenMap: Record<ScreenName, unknown> = {
  boot: null, // shows nothing — index.html boot loader covers this gap
  activation: ActivationScreen,
  home: HomeScreen,
  create: CreateScreen,
  dialogue: DialogueScreen,
  'story-preview': StoryPreviewScreen,
  generating: GeneratingScreen,
  'story-cover': StoryCoverScreen,
  'story-body': StoryBodyScreen,
  'story-end': StoryEndScreen,
  library: LibraryScreen,
  favorites: FavoritesScreen,
  learning: LearningScreen,
  profile: ProfileScreen,
  leaderboard: LeaderboardScreen,
  'create-invite': CreateInviteScreen,
  offline: OfflineScreen,
  error: ErrorScreen,
};

const CurrentScreen = computed(() => screenMap[screen.current]);

const isDev = import.meta.env.DEV;
const showDev = isDev || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev'));

let unsubNetwork: (() => void) | null = null;
let homeKeyHandler: ((e: Event) => void) | null = null;
let unsubFocusForBadge: (() => void) | null = null;
let devHotkeyHandler: ((e: KeyboardEvent) => void) | null = null;

// Dev-only badge state (top-left corner) — shows current screen + focus.
const devBadgeFocus = ref<string>('');
const devBadgeShow = computed<boolean>(() => isDev
  || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev')));

const screenCnLabel = computed<string>(() => {
  const map: Record<string, string> = {
    boot: '启动', activation: '激活', home: '主页',
    create: '创造工坊', dialogue: '对话(你一句我一句)', generating: '生成绘本中',
    'story-cover': '故事封面', 'story-body': '故事播放(4按键+翻译卡)',
    'story-end': '故事结尾', library: '故事馆', favorites: '收藏',
    learning: '学习页(光标+小熊跟随)', profile: '档案', leaderboard: '排行榜',
    'create-invite': '邀请', offline: '离线', error: '错误',
  };
  return map[screen.current] ?? '';
});

onMounted(() => {
  // Network state — initial + push subscription
  device.setOnline(navigator.onLine);
  unsubNetwork = bridge.on('network-change', (online) => {
    device.setOnline(online);
    if (!online && screen.current !== 'activation') {
      screen.go('offline');
    } else if (online && screen.current === 'offline') {
      // Auto-recover to previous screen on reconnect
      screen.back();
    }
  });

  // Home key from Shell → always go to home (unless on activation)
  homeKeyHandler = () => {
    if (screen.current !== 'activation') screen.go('home');
  };
  window.addEventListener('wb:home-key', homeKeyHandler);

  /*
   * 2026-04-27: global Back/ESC fallback.
   * Most screens register onBack on individual focusables; this catches
   * the gaps (HomeScreen MenuCards, DialogueScreen / StoryCoverScreen /
   * StoryEndScreen / FavoritesScreen / ProfileScreen, etc.) so ESC always
   * has a sensible "go back" target.
   *   - activation : no-op (origin screen, nothing to go back to)
   *   - error/offline : screen.back() to whatever was on-screen before
   *   - home      : dev/?dev → activation (so testers can return to QR
   *                  flow); production → no-op (home is the root)
   *   - everything else : screen.go('home')
   */
  setGlobalBackFallback(() => {
    const cur = screen.current;
    const prev = screen.previous;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[ESC fallback]', { from: cur, prev, focus: getCurrentFocusId() });
    }
    // Activation is the root — nothing to go back to. Stay put.
    if (cur === 'activation') return;
    // Home is the app root — pressing back here is a no-op (user is already
    // at the top of the navigation tree). Production parity.
    if (cur === 'home') return;
    // Every other screen: go back to the previous screen if known,
    // otherwise fall through to home (screen.back's built-in fallback).
    screen.back();
  });

  // Dev-only badge — track focus changes
  if (devBadgeShow.value) {
    devBadgeFocus.value = getCurrentFocusId() ?? '';
    unsubFocusForBadge = onFocusChange((id) => {
      devBadgeFocus.value = id ?? '';
    });

    // Trace every screen transition so multi-jump bugs surface immediately.
    screen.$subscribe((mutation, state) => {
      // eslint-disable-next-line no-console
      console.log('[screen]', state.previous, '→', state.current,
        mutation.type === 'patch object' ? '' : `(${mutation.type})`);
    });

    // 2026-04-27: global dev hotkeys for jumping to any screen.
    // Hold Ctrl + letter to teleport — saves having to walk the entire
    // create→cover→body→ended chain when QA-ing one specific surface.
    //   Ctrl+H → home          Ctrl+C → create
    //   Ctrl+D → dialogue      Ctrl+G → generating
    //   Ctrl+L → learning      Ctrl+B → story-body (last page)
    //   Ctrl+S → story-cover   Ctrl+I → library
    devHotkeyHandler = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      const map: Record<string, ScreenName> = {
        h: 'home',
        c: 'create',
        d: 'dialogue',
        g: 'generating',
        l: 'learning',
        b: 'story-body',
        s: 'story-cover',
        i: 'library',
      };
      const target = map[k];
      if (target) {
        e.preventDefault();
        // eslint-disable-next-line no-console
        console.log('[dev-hotkey] jumping to', target);
        screen.go(target);
      }
    };
    window.addEventListener('keydown', devHotkeyHandler);
  }
});

onBeforeUnmount(() => {
  unsubNetwork?.();
  if (homeKeyHandler) window.removeEventListener('wb:home-key', homeKeyHandler);
  if (devHotkeyHandler) window.removeEventListener('keydown', devHotkeyHandler);
  setGlobalBackFallback(null);
  unsubFocusForBadge?.();
});
</script>

<template>
  <div class="tv-stage">
    <!--
      2026-04-27: removed mode="out-in" — when a leaving screen's CSS
      opacity transition was interrupted (HMR / fast back-navigation /
      animation-disable), the next screen would never mount and the user
      saw a blank stage with stale focus. Default mode lets the new screen
      mount immediately while the old one fades out concurrently.
    -->
    <Transition name="screen">
      <component
        v-if="CurrentScreen"
        :is="CurrentScreen"
        :key="screen.current"
      />
    </Transition>

    <component v-if="showDev && DevConsole" :is="DevConsole" />

    <!--
      2026-04-27 dev-only status badge (top-left).
      Always visible in DEV build / ?dev sessions so it's obvious which
      screen is active and which focusable currently has focus. Removed
      from production bundles via v-if on devBadgeShow.
    -->
    <div v-if="devBadgeShow" class="dev-status-badge">
      <div>screen: <b>{{ screen.current }}</b> <span class="dev-cn">{{ screenCnLabel }}</span></div>
      <div>focus: <b>{{ devBadgeFocus || '(none)' }}</b></div>
      <div v-if="screen.current === 'dialogue'" class="dev-cn">
        round: <b>{{ dialogue.round }}/{{ dialogue.roundCount }}</b>
        · phase: <b>{{ dialogue.phase }}</b>
        <span v-if="dialogue.summary"> · summary ✓</span>
      </div>
      <div class="dev-hint">Ctrl+L 学习 · Ctrl+D 对话 · Ctrl+G 生成 · Ctrl+B 播放 · Ctrl+H 主页</div>
    </div>
  </div>
</template>

<style scoped>
.dev-status-badge {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.7);
  color: #ffd9a0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.35;
  padding: 6px 10px;
  border-radius: 6px;
  pointer-events: none;
  user-select: none;
  letter-spacing: 0.02em;
  border: 1px solid rgba(255, 217, 160, 0.3);
}
.dev-status-badge b { color: #ffe8c0; }
.dev-status-badge .dev-cn {
  color: #aef0b6;
  font-weight: 600;
  margin-left: 6px;
}
.dev-status-badge .dev-hint {
  color: #888;
  font-size: 10px;
  margin-top: 4px;
  letter-spacing: 0;
}
</style>

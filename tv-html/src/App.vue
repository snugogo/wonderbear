<!--
  Root App component.
  - Maps current screen name → component
  - Mounts DevConsole only in dev
  - Subscribes to global bridge events (network, voice key) at mount time
-->

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue';
import { useScreenStore, type ScreenName } from '@/stores/screen';
import { useDeviceStore } from '@/stores/device';
import { bridge } from '@/services/bridge';

import ActivationScreen from '@/screens/ActivationScreen.vue';
import HomeScreen from '@/screens/HomeScreen.vue';
import CreateScreen from '@/screens/CreateScreen.vue';
import DialogueScreen from '@/screens/DialogueScreen.vue';
import GeneratingScreen from '@/screens/GeneratingScreen.vue';
import StoryCoverScreen from '@/screens/StoryCoverScreen.vue';
import StoryBodyScreen from '@/screens/StoryBodyScreen.vue';
import StoryEndScreen from '@/screens/StoryEndScreen.vue';
import LibraryScreen from '@/screens/LibraryScreen.vue';
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

const screenMap: Record<ScreenName, unknown> = {
  boot: null, // shows nothing — index.html boot loader covers this gap
  activation: ActivationScreen,
  home: HomeScreen,
  create: CreateScreen,
  dialogue: DialogueScreen,
  generating: GeneratingScreen,
  'story-cover': StoryCoverScreen,
  'story-body': StoryBodyScreen,
  'story-end': StoryEndScreen,
  library: LibraryScreen,
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
});

onBeforeUnmount(() => {
  unsubNetwork?.();
  if (homeKeyHandler) window.removeEventListener('wb:home-key', homeKeyHandler);
});
</script>

<template>
  <div class="tv-stage">
    <Transition name="screen" mode="out-in">
      <component
        v-if="CurrentScreen"
        :is="CurrentScreen"
        :key="screen.current"
      />
    </Transition>

    <component v-if="showDev && DevConsole" :is="DevConsole" />
  </div>
</template>

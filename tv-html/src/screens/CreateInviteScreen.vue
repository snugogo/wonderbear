<!--
  CreateInviteScreen — 激励创作引导页
  TV v1.0 §3.2.

  Layout (centered, 1 col):
    +----------------------------------------------+
    |                                              |
    |              [bear cheer / idle]             |
    |                                              |
    |          每讲一个故事 = ⭐ 10 星光            |
    |                                              |
    |    你家现在 ⭐ {n} 星光,还差 ⭐ {gap} ...      |
    |                                              |
    |     [立即开始创作]    [稍后再说]               |
    |                                              |
    +----------------------------------------------+

  Entry: from LeaderboardScreen Writers tab when a row is pressed.
  Carries `screen.payload = { stars, stars_to_top10, in_top10 }`.

  Resources:
    - 主立绘: bear_cheer (TV 在用) — PRD wanted bear_writing_quill,
      not in CSV → 建议人工补图 / 占位 cheer 即可.
    - 装饰: deco_stars 左右点缀.
    - 背景: bg_home_cozy.

  GP15: only opacity entry transition; static art.
-->

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { asset } from '@/utils/assets';
import { bridge } from '@/services/bridge';
import {
  useFocusable,
  setFocus,
  getCurrentFocusId,
  onFocusChange,
} from '@/services/focus';

interface InvitePayload {
  stars?: number;
  stars_to_top10?: number;
  in_top10?: boolean;
}

const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

const focusedId = ref<string>('');
let unsubFocus: (() => void) | null = null;
let mounted = true;

const ctaCreateEl = ref<HTMLElement | null>(null);
const ctaLaterEl  = ref<HTMLElement | null>(null);

const payload = computed<InvitePayload>(() => (screen.payload ?? {}) as InvitePayload);
const stars = computed<number>(() => payload.value.stars ?? 0);
const gap = computed<number>(() => payload.value.stars_to_top10 ?? 0);
const inTop10 = computed<boolean>(() => payload.value.in_top10 === true);

useFocusable(ctaCreateEl, {
  id: 'ci-create',
  autoFocus: true,
  neighbors: { right: 'ci-later' },
  onEnter: () => {
    bridge.log('create_invite', { event: 'cta_create_pressed', stars: stars.value });
    screen.go('create');
  },
  onBack: () => { screen.go('leaderboard'); },
});
useFocusable(ctaLaterEl, {
  id: 'ci-later',
  neighbors: { left: 'ci-create' },
  onEnter: () => {
    bridge.log('create_invite', { event: 'cta_later_pressed' });
    screen.go('leaderboard');
  },
  onBack: () => { screen.go('leaderboard'); },
});

onMounted(() => {
  bgm.play('home');
  bridge.log('create_invite', { event: 'mounted', payload: payload.value });
  focusedId.value = getCurrentFocusId() ?? '';
  unsubFocus = onFocusChange((id) => {
    if (mounted) focusedId.value = id ?? '';
  });
});
onBeforeUnmount(() => {
  mounted = false;
  unsubFocus?.();
});
</script>

<template>
  <div class="invite-screen">
    <img class="bg" :src="asset('bg/bg_home_cozy.webp')" alt="" aria-hidden="true" />
    <img class="deco-l" :src="asset('deco/deco_stars.webp')" alt="" aria-hidden="true" />
    <img class="deco-r" :src="asset('deco/deco_stars.webp')" alt="" aria-hidden="true" />

    <main class="content">
      <!--
        Main bear sprite — PRD wanted `bear_writing_quill`. CSV doesn't
        carry it, so we use bear_cheer as the closest emotional match
        ("hooray, go create!"). 建议人工补图: bear_writing_quill.webp.
      -->
      <img class="hero-bear" :src="asset('bear/bear_cheer.webp')" alt="" />

      <h1 class="headline">{{ t('createInvite.headline') }}</h1>

      <p class="subline" v-if="inTop10">
        {{ t('createInvite.subInTop10') }}
      </p>
      <p class="subline" v-else>
        {{ t('createInvite.subBelow', { stars, gap }) }}
      </p>

      <div class="cta-row">
        <button
          ref="ctaCreateEl"
          type="button"
          class="cta cta-primary"
          :class="{ 'is-focused': focusedId === 'ci-create' }"
          @mouseenter="setFocus('ci-create')"
          @click="screen.go('create')"
        >
          {{ t('createInvite.ctaCreate') }}
        </button>
        <button
          ref="ctaLaterEl"
          type="button"
          class="cta cta-secondary"
          :class="{ 'is-focused': focusedId === 'ci-later' }"
          @mouseenter="setFocus('ci-later')"
          @click="screen.go('leaderboard')"
        >
          {{ t('createInvite.ctaLater') }}
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.invite-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-canvas);
  overflow: hidden;
}
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  user-select: none;
  pointer-events: none;
}
/* Decorative stars left/right — flat, no animation. */
.deco-l, .deco-r {
  position: absolute;
  top: 18%;
  width: 120px;
  height: 120px;
  object-fit: contain;
  opacity: 0.7;
  z-index: 1;
  pointer-events: none;
}
.deco-l { left: 12%; }
.deco-r { right: 12%; transform: scaleX(-1); }

.content {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 0 var(--sp-7);
}

.hero-bear {
  width: 280px;
  height: 280px;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
}
.headline {
  margin: 0;
  font-family: var(--ff-display);
  font-size: 48px;
  font-weight: 800;
  color: #3D2817;
  text-align: center;
  text-shadow: 0 1px 3px rgba(255, 255, 255, 0.4);
}
.subline {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: #3D2817;
  text-align: center;
  background: rgba(255, 255, 255, 0.55);
  padding: 12px 28px;
  border-radius: 16px;
}

.cta-row {
  display: flex;
  gap: 24px;
  margin-top: 12px;
}
.cta {
  appearance: none;
  border: 0;
  font-family: var(--ff-display);
  font-size: 26px;
  font-weight: 800;
  padding: 16px 40px;
  border-radius: 16px;
  cursor: pointer;
  transition: transform 120ms ease-out, background 120ms ease-out;
}
.cta-primary {
  background: #F0B95C;
  color: #3D2817;
}
.cta-secondary {
  background: rgba(255, 255, 255, 0.7);
  color: #3D2817;
}
.cta.is-focused {
  transform: scale(1.06);
}
.cta-primary.is-focused   { background: #FFC85F; }
.cta-secondary.is-focused { background: rgba(255, 255, 255, 0.95); }
</style>

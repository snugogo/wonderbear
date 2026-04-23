<template>
  <div class="page wb-page">
    <van-nav-bar :title="t('subscribe.title')" />

    <div class="content">
      <!-- 处理中 -->
      <div v-if="status === 'pending'" class="state">
        <van-loading size="48" color="var(--wb-primary)" vertical>
          {{ t('subscribe.successTitle') }}
        </van-loading>
        <p class="desc">{{ t('subscribe.successDesc') }}</p>
      </div>

      <!-- 成功 -->
      <EmptyState
        v-else-if="status === 'done'"
        asset="h5.successSubscribed"
        fallback-asset="bear.cheer"
        :title="t('subscribe.successDone')"
        :desc="''"
      >
        <template #action>
          <van-button type="primary" round @click="router.replace('/home')">
            {{ t('subscribe.backToHome') }}
          </van-button>
        </template>
      </EmptyState>

      <!-- 超时 -->
      <EmptyState
        v-else
        asset="bear.confused"
        fallback-asset="bear.idle"
        :title="t('subscribe.successTitle')"
        :desc="t('subscribe.successTimeout')"
      >
        <template #action>
          <van-button round @click="router.replace('/subscribe')">
            {{ t('subscribe.backToHome') }}
          </van-button>
        </template>
      </EmptyState>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { subscriptionApi } from '@/api/subscription';
import { useAuthStore } from '@/stores/auth';
import { SUBSCRIPTION_POLL_INTERVAL_MS, SUBSCRIPTION_POLL_TIMEOUT_MS } from '@/config';
import EmptyState from '@/components/EmptyState.vue';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const status = ref<'pending' | 'done' | 'timeout'>('pending');
let timer: ReturnType<typeof setInterval> | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

async function checkOnce() {
  try {
    const s = await subscriptionApi.status();
    if (s.status === 'active' || s.status === 'past_due') {
      status.value = 'done';
      // 同步到 store,首页徽章可立刻反映
      if (authStore.parent) {
        authStore.parent.subscription = {
          plan: s.plan,
          status: s.status,
          expiresAt: s.expiresAt,
          pdfExportsLeft: s.pdfExportsLeft,
        };
      }
      stop();
    }
  } catch {
    // 静默,继续下次轮询
  }
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = null;
}

onMounted(() => {
  // 立即查一次,然后按间隔轮询,最长 3 分钟
  checkOnce();
  timer = setInterval(checkOnce, SUBSCRIPTION_POLL_INTERVAL_MS);
  timeoutId = setTimeout(() => {
    if (status.value === 'pending') status.value = 'timeout';
    stop();
  }, SUBSCRIPTION_POLL_TIMEOUT_MS);
});

onUnmounted(stop);
</script>

<style scoped>
.page {
  background: var(--wb-bg);
  padding: 0;
  min-height: 100vh;
}
:deep(.van-nav-bar) {
  background: var(--wb-bg);
}
:deep(.van-nav-bar__title) {
  color: var(--wb-text);
  font-weight: 600;
}
.content {
  padding: 32px 24px;
}
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
}
.desc {
  margin-top: 16px;
  font-size: 14px;
  color: var(--wb-text-sub);
  text-align: center;
}
</style>

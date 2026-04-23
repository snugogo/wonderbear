<template>
  <div class="page wb-page">
    <van-nav-bar :title="t('subscribe.title')" />
    <div class="content">
      <EmptyState
        asset="bear.confused"
        fallback-asset="bear.idle"
        :title="t('subscribe.cancelPageTitle')"
        :desc="t('subscribe.cancelPageDesc')"
      >
        <template #action>
          <div class="actions">
            <van-button type="primary" round @click="router.replace('/subscribe')">
              {{ t('subscribe.tryAgain') }}
            </van-button>
            <van-button round plain @click="router.replace('/home')">
              {{ t('subscribe.backToHome') }}
            </van-button>
          </div>
        </template>
      </EmptyState>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import EmptyState from '@/components/EmptyState.vue';

const { t } = useI18n();
const router = useRouter();
</script>

<style scoped>
.page { background: var(--wb-bg); min-height: 100vh; padding: 0; }
:deep(.van-nav-bar) { background: var(--wb-bg); }
:deep(.van-nav-bar__title) { color: var(--wb-text); font-weight: 600; }
.content { padding: 32px 24px; }
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 280px;
}
</style>

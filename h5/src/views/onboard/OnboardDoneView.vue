<template>
  <div class="done-page">
    <!-- 进度指示:全满 -->
    <div class="stepper">
      <div class="step done">
        <van-icon name="success" />
        <span>{{ t('onboard.step1') }}</span>
      </div>
      <div class="step-line active" />
      <div class="step done">
        <van-icon name="success" />
        <span>{{ t('onboard.step2') }}</span>
      </div>
      <div class="step-line active" />
      <div class="step done active">
        <van-icon name="success" />
        <span>{{ t('onboard.step3') }}</span>
      </div>
    </div>

    <!-- 主体:欢庆 + 指引 -->
    <div class="card">
      <div class="img-wrap">
        <img
          v-if="!imgBroken"
          :src="asset('bear.cheer')"
          class="hero-img"
          alt=""
          @error="imgBroken = true"
        />
        <span v-else class="hero-img fallback" aria-hidden="true" />
      </div>

      <h1 class="title">{{ t('onboard.doneTitle') }}</h1>

      <!-- 流程小卡,给用户明确预期 -->
      <div class="steps-hint">
        <div class="hint-row">
          <div class="hint-num">1</div>
          <div class="hint-text">{{ t('onboard.backToTvStep1') }}</div>
        </div>
        <div class="hint-row">
          <div class="hint-num">2</div>
          <div class="hint-text">{{ t('onboard.backToTvStep2') }}</div>
        </div>
        <div class="hint-row">
          <div class="hint-num">3</div>
          <div class="hint-text">{{ t('onboard.backToTvStep3') }}</div>
        </div>
      </div>

      <p v-if="wasSkipped" class="note">
        <van-icon name="info-o" />
        {{ t('onboard.skippedNote') }}
      </p>
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <van-button type="primary" round block class="btn-primary" @click="onDone">
        <van-icon name="smile-o" />
        <span class="btn-text">{{ t('onboard.doneButton') }}</span>
      </van-button>
      <van-button round block plain class="btn-secondary" @click="onAddAnother">
        <van-icon name="plus" />
        <span>{{ t('onboard.addAnother') }}</span>
      </van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { asset } from '@/config/assets';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const imgBroken = ref(false);
const wasSkipped = computed(() => route.query.skipped === '1');

function onDone() {
  // 完成 onboard,清掉 deviceCtx(如有),跳 Home
  authStore.clearDeviceContext();
  router.replace({ name: 'Home' });
}

function onAddAnother() {
  router.replace({ name: 'OnboardChild' });
}
</script>

<style scoped>
.done-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #FFF8F0 0%, #FFD9B8 50%, #F5BFA3 100%);
  padding: 20px 20px 32px;
  display: flex;
  flex-direction: column;
}

/* 顶部进度条 */
.stepper {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  padding: 0 8px;
}
.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--wb-text-sub);
}
.step .van-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 13px;
  background: var(--wb-success);
  color: #fff;
}
.step.active {
  color: var(--wb-primary-dark);
  font-weight: 600;
}
.step-line {
  flex: 1;
  height: 2px;
  background: var(--wb-border);
  margin: 0 8px;
  margin-bottom: 16px;
}
.step-line.active {
  background: var(--wb-success);
}

/* 主卡 */
.card {
  flex: 1;
  background: var(--wb-card);
  border-radius: 24px;
  padding: 28px 20px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(255, 138, 61, 0.12);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.img-wrap {
  margin-bottom: 16px;
}
.hero-img {
  width: 140px;
  height: 140px;
  object-fit: contain;
  display: block;
}
.hero-img.fallback {
  display: block;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--wb-primary-light), var(--wb-primary) 140%);
}
.title {
  margin: 0 0 20px;
  font-size: 22px;
  font-weight: 700;
  color: var(--wb-text);
  line-height: 1.3;
}

.steps-hint {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}
.hint-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--wb-bg);
  border-radius: 14px;
  text-align: left;
}
.hint-num {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--wb-primary);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hint-text {
  flex: 1;
  font-size: 14px;
  color: var(--wb-text);
  line-height: 1.45;
}

.note {
  margin: 16px 0 0;
  padding: 10px 12px;
  background: rgba(232, 200, 120, 0.2);
  color: #8C7E6A;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.5;
  display: flex;
  gap: 6px;
  align-items: center;
  text-align: left;
}

/* 底部按钮 */
.actions {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.btn-primary {
  height: 52px;
  font-weight: 600;
  font-size: 17px;
}
.btn-primary .btn-text {
  margin-left: 6px;
}
.btn-secondary {
  height: 44px;
  color: var(--wb-text-sub);
  border-color: var(--wb-border);
  font-size: 14px;
}
.btn-secondary :deep(.van-icon) {
  margin-right: 6px;
}
</style>

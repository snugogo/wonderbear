<template>
  <div class="page wb-page">
    <van-nav-bar
      :title="t('subscribe.title')"
      left-arrow
      @click-left="router.back()"
    />

    <div v-if="loading" class="loading">
      <van-loading color="var(--wb-primary)" />
    </div>

    <!-- 已订阅:状态卡 + 管理 + 取消 -->
    <template v-else-if="isActive">
      <div class="status-card active">
        <div class="status-row">
          <span class="badge">{{ t(`subscribe.${sub.plan}`) }}</span>
          <van-icon name="success" color="var(--wb-success)" size="20" />
        </div>
        <p class="status-line" v-if="sub.expiresAt && !sub.cancelAtPeriodEnd">
          {{ t('subscribe.expiresAt', { date: formatDate(sub.expiresAt) }) }}
        </p>
        <p class="status-line warn" v-if="sub.cancelAtPeriodEnd && sub.expiresAt">
          {{ t('subscribe.canceledNotice', { date: formatDate(sub.expiresAt) }) }}
        </p>
        <p class="status-line" v-if="sub.pdfExportsLeft >= 0">
          {{ t('subscribe.pdfLeft', { n: sub.pdfExportsLeft }) }}
        </p>
      </div>

      <div class="benefits">
        <div class="benefit"><van-icon name="success" color="var(--wb-success)" /> {{ t('subscribe.benefits.unlimited') }}</div>
        <div class="benefit"><van-icon name="success" color="var(--wb-success)" /> {{ t('subscribe.benefits.pdf') }}</div>
        <div class="benefit"><van-icon name="success" color="var(--wb-success)" /> {{ t('subscribe.benefits.priority') }}</div>
      </div>

      <van-button
        v-if="sub.stripeCustomerId"
        block
        round
        plain
        :loading="portalLoading"
        @click="onManage"
        class="action-btn"
      >
        {{ t('subscribe.manage') }}
      </van-button>
      <van-button
        v-if="!sub.cancelAtPeriodEnd"
        block
        round
        type="danger"
        plain
        :loading="cancelLoading"
        @click="onCancel"
        class="action-btn"
      >
        {{ t('subscribe.cancel') }}
      </van-button>
    </template>

    <!-- 未订阅:套餐卡 + 支付 -->
    <template v-else>
      <div class="upgrade-head">
        <h2>{{ t('subscribe.upgradeTitle') }}</h2>
        <p>{{ t('subscribe.upgradeDesc') }}</p>
      </div>

      <div class="plans">
        <!-- 月度 -->
        <div
          class="plan-card"
          :class="{ active: chosenPlan === 'monthly' }"
          @click="chosenPlan = 'monthly'"
        >
          <div class="plan-name">{{ t('subscribe.monthly') }}</div>
          <div class="plan-price">
            <span class="amount">€{{ (PLAN_PRICES.monthly.amountCents / 100).toFixed(2) }}</span>
            <span class="period">{{ t('subscribe.perMonth') }}</span>
          </div>
        </div>

        <!-- 年度 -->
        <div
          class="plan-card"
          :class="{ active: chosenPlan === 'yearly' }"
          @click="chosenPlan = 'yearly'"
        >
          <div class="save-tag">{{ t('subscribe.save33') }}</div>
          <div class="plan-name">{{ t('subscribe.yearly') }}</div>
          <div class="plan-price">
            <span class="amount">€{{ (PLAN_PRICES.yearly.amountCents / 100).toFixed(2) }}</span>
            <span class="period">{{ t('subscribe.perYear') }}</span>
          </div>
        </div>
      </div>

      <div class="benefits">
        <div class="benefit"><van-icon name="success" color="var(--wb-primary)" /> {{ t('subscribe.benefits.unlimited') }}</div>
        <div class="benefit"><van-icon name="success" color="var(--wb-primary)" /> {{ t('subscribe.benefits.pdf') }}</div>
        <div class="benefit"><van-icon name="success" color="var(--wb-primary)" /> {{ t('subscribe.benefits.priority') }}</div>
        <div class="benefit"><van-icon name="success" color="var(--wb-primary)" /> {{ t('subscribe.benefits.multi') }}</div>
      </div>

      <van-button
        type="primary"
        block
        round
        :loading="stripeLoading"
        @click="onPayStripe"
        class="pay-btn"
      >
        {{ t('subscribe.payWithStripe') }}
      </van-button>
      <van-button
        block
        round
        plain
        :loading="paypalLoading"
        @click="onPayPaypal"
        class="pay-btn"
      >
        {{ t('subscribe.payWithPaypal') }}
      </van-button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showDialog, showSuccessToast, showToast } from 'vant';
import { subscriptionApi } from '@/api/subscription';
import { useApiError } from '@/composables/useApiError';
import { PLAN_PRICES } from '@/config';
import { formatDate } from '@/utils/time';
import { i18n } from '@/i18n';
import type { Locale, SubscriptionStatusData } from '@/types';

const { t } = useI18n();
const router = useRouter();
const { format: fmtErr } = useApiError();

const sub = ref<SubscriptionStatusData>({
  plan: 'free',
  status: 'free',
  provider: null,
  expiresAt: null,
  pdfExportsLeft: 0,
  pdfExportsResetAt: null,
  stripeCustomerId: null,
  paypalSubId: null,
  cancelAtPeriodEnd: false,
});
const loading = ref(true);
const stripeLoading = ref(false);
const paypalLoading = ref(false);
const portalLoading = ref(false);
const cancelLoading = ref(false);
const chosenPlan = ref<'monthly' | 'yearly'>('yearly');

const isActive = computed(() => sub.value.status === 'active' || sub.value.status === 'past_due');

async function load() {
  loading.value = true;
  try {
    sub.value = await subscriptionApi.status();
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    loading.value = false;
  }
}

function buildSuccessUrl(): string {
  // hash 模式下 success 页面带上 plan 信息,方便支付成功页给文案
  return `${window.location.origin}/#/subscribe/success?plan=${chosenPlan.value}`;
}

function buildCancelUrl(): string {
  return `${window.location.origin}/#/subscribe/cancel`;
}

async function onPayStripe() {
  stripeLoading.value = true;
  try {
    const { url } = await subscriptionApi.stripeCreate({
      plan: chosenPlan.value,
      successUrl: buildSuccessUrl(),
      cancelUrl: buildCancelUrl(),
      locale: i18n.global.locale.value as Locale,
    });
    // 直接跳转 Stripe Checkout(或 mock 的 success 页)
    window.location.href = url;
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    stripeLoading.value = false;
  }
}

async function onPayPaypal() {
  paypalLoading.value = true;
  try {
    const { approvalUrl } = await subscriptionApi.paypalCreate({
      plan: chosenPlan.value,
      returnUrl: buildSuccessUrl(),
      cancelUrl: buildCancelUrl(),
    });
    window.location.href = approvalUrl;
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    paypalLoading.value = false;
  }
}

async function onManage() {
  portalLoading.value = true;
  try {
    const { url } = await subscriptionApi.portalSession({
      returnUrl: `${window.location.origin}/#/subscribe`,
    });
    window.location.href = url;
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    portalLoading.value = false;
  }
}

async function onCancel() {
  try {
    await showDialog({
      title: t('subscribe.cancelConfirm'),
      message: t('subscribe.cancelDesc', {
        date: formatDate(sub.value.expiresAt) || '',
      }),
      confirmButtonText: t('subscribe.cancel'),
      cancelButtonText: t('common.back'),
      showCancelButton: true,
      confirmButtonColor: 'var(--wb-danger)',
    });
  } catch {
    return;
  }
  cancelLoading.value = true;
  try {
    await subscriptionApi.cancel();
    showSuccessToast(t('common.success'));
    await load();
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    cancelLoading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page {
  background: var(--wb-bg);
  padding: 0 0 32px;
}
:deep(.van-nav-bar) {
  background: var(--wb-bg);
}
:deep(.van-nav-bar__title) {
  color: var(--wb-text);
  font-weight: 600;
}
.loading {
  display: flex;
  justify-content: center;
  padding: 80px 0;
}

/* ---- 已订阅 ---- */
.status-card {
  margin: 16px;
  padding: 20px;
  background: var(--wb-card);
  border-radius: 16px;
  box-shadow: 0 4px 14px rgba(255, 138, 61, 0.08);
}
.status-card.active {
  background: linear-gradient(135deg, #FFD9B8 0%, #FFFFFF 100%);
}
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.badge {
  padding: 6px 16px;
  background: var(--wb-primary);
  color: #fff;
  border-radius: 999px;
  font-weight: 600;
  font-size: 14px;
}
.status-line {
  margin: 4px 0;
  font-size: 13px;
  color: var(--wb-text);
}
.status-line.warn {
  color: var(--wb-danger);
  font-weight: 500;
}

/* ---- 套餐卡 ---- */
.upgrade-head {
  padding: 16px 20px 8px;
}
.upgrade-head h2 {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  color: var(--wb-text);
}
.upgrade-head p {
  margin: 0;
  font-size: 14px;
  color: var(--wb-text-sub);
  line-height: 1.5;
}
.plans {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px;
}
.plan-card {
  position: relative;
  background: var(--wb-card);
  border: 2px solid var(--wb-border);
  border-radius: 16px;
  padding: 20px 12px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
}
.plan-card:active {
  transform: scale(0.98);
}
.plan-card.active {
  border-color: var(--wb-primary);
  background: var(--wb-primary-light);
}
.save-tag {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 12px;
  background: var(--wb-primary);
  color: #fff;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.plan-name {
  font-size: 14px;
  color: var(--wb-text-sub);
  margin-bottom: 8px;
  font-weight: 500;
}
.plan-price {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
}
.amount {
  font-size: 22px;
  font-weight: 700;
  color: var(--wb-text);
}
.period {
  font-size: 12px;
  color: var(--wb-text-sub);
}

/* ---- 权益 ---- */
.benefits {
  margin: 8px 16px 16px;
  padding: 16px;
  background: var(--wb-card);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.benefit {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--wb-text);
}

/* ---- 按钮 ---- */
.pay-btn,
.action-btn {
  height: 48px;
  margin: 8px 16px 0;
  width: calc(100% - 32px);
  font-size: 16px;
  font-weight: 600;
}
</style>

<template>
  <div class="page wb-page">
    <van-nav-bar :title="t('devices.title')" left-arrow @click-left="router.back()" />

    <div v-if="loading" class="loading">
      <van-loading color="var(--wb-primary)" />
    </div>

    <EmptyState
      v-else-if="devices.length === 0"
      asset="h5.scanQrGuide"
      fallback-asset="bear.qrPeek"
      :title="t('devices.empty')"
      :desc="t('devices.emptyDesc')"
    />

    <div v-else class="list">
      <div v-for="d in devices" :key="d.id" class="card">
        <div class="card-head">
          <div class="model">
            <van-icon name="tv-o" color="var(--wb-primary)" size="20" />
            <span class="model-name">{{ d.model }}</span>
            <span class="dot" :class="{ online: d.online }" />
            <span class="status-text">
              {{ d.online ? t('devices.online') : t('devices.offline') }}
            </span>
          </div>
          <div class="device-id">{{ d.deviceId }}</div>
        </div>

        <div class="meta">
          <div>{{ t('devices.storiesLeft', { n: d.storiesLeft }) }}</div>
          <div v-if="d.lastSeenAt">{{ t('devices.lastSeen', { time: relativeTime(d.lastSeenAt) }) }}</div>
        </div>

        <div class="actions">
          <van-button size="small" plain :loading="rebootingId === d.id" @click="onReboot(d.id)">
            {{ t('devices.rebootBtn') }}
          </van-button>
          <van-button size="small" type="danger" plain @click="onUnbindStart(d)">
            {{ t('devices.unbindBtn') }}
          </van-button>
        </div>
      </div>
    </div>

    <!-- 解绑二次确认弹窗 -->
    <van-popup v-model:show="showUnbindPopup" round position="bottom" :style="{ padding: '24px 16px 32px' }">
      <h3 class="popup-title">
        {{ t('devices.unbindTitle', { name: unbindTarget?.model || '' }) }}
      </h3>
      <p class="popup-desc">{{ t('devices.unbindDesc') }}</p>

      <div class="popup-code-row">
        <CodeInput v-model="unbindCode" :length="CODE_LENGTH" />
      </div>

      <div class="popup-resend">
        <van-button
          size="small"
          plain
          :disabled="!canSendCode || sendingCode"
          :loading="sendingCode"
          @click="onResendCode"
        >
          {{ canSendCode ? t('auth.sendCode') : t('auth.resendIn', { sec: codeRemaining }) }}
        </van-button>
      </div>

      <van-button
        type="danger"
        block
        round
        :loading="unbindLoading"
        @click="onUnbindConfirm"
        class="popup-confirm"
      >
        {{ t('devices.unbindBtn') }}
      </van-button>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showSuccessToast, showToast } from 'vant';
import { deviceApi } from '@/api/device';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useApiError } from '@/composables/useApiError';
import { useCountdown } from '@/composables/useCountdown';
import { CODE_COOLDOWN, CODE_LENGTH } from '@/config';
import { relativeTime } from '@/utils/time';
import { i18n } from '@/i18n';
import type { DeviceSummary, Locale } from '@/types';
import EmptyState from '@/components/EmptyState.vue';
import CodeInput from '@/components/CodeInput.vue';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const { format: fmtErr } = useApiError();
const { remaining: codeRemaining, canSend: canSendCode, start: startCountdown } =
  useCountdown(CODE_COOLDOWN);

const devices = ref<DeviceSummary[]>([]);
const loading = ref(true);
const rebootingId = ref<string>('');

// 解绑流程
const showUnbindPopup = ref(false);
const unbindTarget = ref<DeviceSummary | null>(null);
const unbindCode = ref('');
const unbindLoading = ref(false);
const sendingCode = ref(false);

async function load() {
  loading.value = true;
  try {
    const { items } = await deviceApi.list();
    devices.value = items;
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    loading.value = false;
  }
}

async function onReboot(id: string) {
  rebootingId.value = id;
  try {
    const { willExecuteWithin } = await deviceApi.reboot(id);
    showSuccessToast(t('devices.rebootSuccess', { sec: willExecuteWithin }));
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    rebootingId.value = '';
  }
}

function onUnbindStart(d: DeviceSummary) {
  unbindTarget.value = d;
  unbindCode.value = '';
  showUnbindPopup.value = true;
  // 进入弹窗即发一次验证码
  sendUnbindCode();
}

async function sendUnbindCode() {
  if (!authStore.parent) return;
  sendingCode.value = true;
  try {
    await authApi.sendCode({
      email: authStore.parent.email,
      purpose: 'login',
      locale: i18n.global.locale.value as Locale,
    });
    showSuccessToast(t('devices.unbindCodeSent'));
    startCountdown();
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    sendingCode.value = false;
  }
}

function onResendCode() {
  sendUnbindCode();
}

async function onUnbindConfirm() {
  if (!unbindTarget.value) return;
  if (!/^\d{6}$/.test(unbindCode.value)) {
    showToast(t('auth.invalidCode'));
    return;
  }
  unbindLoading.value = true;
  try {
    await deviceApi.unbind({
      deviceId: unbindTarget.value.deviceId,
      confirmCode: unbindCode.value,
    });
    showSuccessToast(t('devices.unbindSuccess'));
    showUnbindPopup.value = false;
    await load();
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    unbindLoading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page { background: var(--wb-bg); min-height: 100vh; padding: 0 0 24px; }
:deep(.van-nav-bar) { background: var(--wb-bg); }
:deep(.van-nav-bar__title) { color: var(--wb-text); font-weight: 600; }
.loading { display: flex; justify-content: center; padding: 80px 0; }

.list {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card {
  background: var(--wb-card);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 10px rgba(255, 138, 61, 0.06);
}
.card-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.model {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 600;
  color: var(--wb-text);
}
.model-name { margin-right: 6px; }
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--wb-text-sub);
  margin-left: 4px;
}
.dot.online { background: var(--wb-success); }
.status-text { font-size: 12px; color: var(--wb-text-sub); font-weight: 400; }
.device-id {
  font-family: monospace;
  font-size: 11px;
  color: var(--wb-text-sub);
  word-break: break-all;
}
.meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--wb-text-sub);
  margin-bottom: 14px;
}
.actions {
  display: flex;
  gap: 8px;
}

/* ---- 解绑弹窗 ---- */
.popup-title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 600;
  color: var(--wb-text);
}
.popup-desc {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--wb-text-sub);
  line-height: 1.5;
}
.popup-code-row {
  margin-bottom: 12px;
}
.popup-resend {
  text-align: right;
  margin-bottom: 16px;
}
.popup-confirm {
  height: 48px;
}
</style>

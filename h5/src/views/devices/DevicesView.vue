<template>
  <div class="page wb-page">
    <van-nav-bar :title="t('devices.title')" left-arrow @click-left="router.back()" />

    <div v-if="loading" class="loading">
      <van-loading color="var(--wb-primary)" />
    </div>

    <template v-else>
      <EmptyState
        v-if="devices.length === 0"
        asset="h5.scanQrGuide"
        fallback-asset="bear.qrPeek"
        :title="t('devices.empty')"
        :desc="t('devices.emptyDesc')"
      />

      <!-- + 添加设备按钮(空状态 & 列表状态都展示) -->
      <div class="add-btn-wrap">
        <van-button
          block
          round
          type="primary"
          icon="plus"
          @click="onAddStart"
        >
          {{ t('devices.add') }}
        </van-button>
      </div>
    </template>

    <div v-if="!loading && devices.length > 0" class="list">
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

    <!-- 手输激活码绑定弹窗 -->
    <van-popup v-model:show="showAddPopup" round position="bottom" :style="{ padding: '24px 16px 32px' }">
      <h3 class="popup-title">{{ t('devices.addTitle') }}</h3>
      <p class="popup-desc">{{ t('devices.addDesc') }}</p>

      <div class="popup-field">
        <label class="popup-label">{{ t('devices.activationCodeLabel') }}</label>
        <CodeInput
          v-model="addForm.activationCode"
          mode="alphanumeric"
          :length="ACTIVATION_CODE_LENGTH"
          :placeholder="t('devices.activationCodePlaceholder')"
        />
      </div>

      <van-button
        type="primary"
        block
        round
        :loading="bindLoading"
        @click="onBindConfirm"
        class="popup-confirm"
      >
        {{ t('devices.bindBtn') }}
      </van-button>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showDialog, showSuccessToast, showToast } from 'vant';
import { deviceApi } from '@/api/device';
import { authApi } from '@/api/auth';
import { BusinessError } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { useApiError } from '@/composables/useApiError';
import { useCountdown } from '@/composables/useCountdown';
import { CODE_COOLDOWN, CODE_LENGTH } from '@/config';
import { relativeTime } from '@/utils/time';
import { i18n } from '@/i18n';
import type { DeviceSummary, Locale } from '@/types';
import EmptyState from '@/components/EmptyState.vue';
import CodeInput from '@/components/CodeInput.vue';

/** TV 屏幕显示的激活码长度(字母+数字混合,如 CRRTXMGL) */
const ACTIVATION_CODE_LENGTH = 8;

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

// 绑定流程(手输激活码)
const showAddPopup = ref(false);
const bindLoading = ref(false);
const addForm = reactive({ activationCode: '' });

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

// ---- 手输激活码绑定 ----
function onAddStart() {
  addForm.activationCode = '';
  showAddPopup.value = true;
}

/**
 * 调用 /api/device/bind(服务端 §5.3),**只传 activationCode**,
 * 由服务端按 code 唯一反查设备完成绑定。
 *
 * 产品决策(2026-04-23):TV 屏幕不显示 deviceId,业内主流同类产品(小米/华为/极米)
 * 也都是"一码一用",deviceId 让用户手输会徒增出错率。
 *
 * 20003(已绑定到其他账户)允许 forceOverride:true 强制覆盖,但需二次确认。
 */
async function onBindConfirm(force = false) {
  const code = addForm.activationCode.trim().toUpperCase();
  if (code.length !== ACTIVATION_CODE_LENGTH) {
    showToast(t('devices.activationCodeInvalid'));
    return;
  }

  bindLoading.value = true;
  try {
    await deviceApi.bind({
      activationCode: code,
      forceOverride: force || undefined,
    });
    showSuccessToast(t('devices.bindSuccess'));
    showAddPopup.value = false;
    await load();
  } catch (e) {
    if (e instanceof BusinessError && e.code === 20003 && !force) {
      try {
        await showDialog({
          title: t('errors.20003'),
          message: t('devices.bindOverrideConfirm'),
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
          showCancelButton: true,
          confirmButtonColor: 'var(--wb-danger)',
        });
        // 递归调用走 forceOverride=true 分支
        bindLoading.value = false;
        return onBindConfirm(true);
      } catch {
        // 用户拒绝覆盖
      }
    }
    showToast(fmtErr(e));
  } finally {
    bindLoading.value = false;
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

/* ---- 添加设备 ---- */
.add-btn-wrap {
  padding: 16px;
}
.popup-field {
  margin-bottom: 16px;
}
.popup-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--wb-text);
  margin-bottom: 8px;
}
.popup-field :deep(.van-cell) {
  padding-left: 12px;
  padding-right: 12px;
  background: var(--wb-card);
  border: 1px solid var(--wb-border);
  border-radius: 12px;
}
</style>

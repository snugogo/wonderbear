<template>
  <AuthLayout>
    <h1 class="wb-title">{{ t('auth.registerTitle') }}</h1>
    <p class="wb-subtitle">{{ t('auth.registerSubtitle') }}</p>

    <!-- 扫码带入的设备提示 -->
    <div v-if="deviceCode" class="device-banner">
      <van-icon name="link-o" size="18" />
      <span>{{ t('auth.registerWithDevice', { code: deviceCode }) }}</span>
    </div>

    <div class="wb-card">
      <van-form class="form" @submit="onSubmit">
        <!-- 邮箱 -->
        <van-field
          v-model.trim="form.email"
          type="email"
          :label="t('auth.email')"
          :placeholder="t('auth.emailPlaceholder')"
          label-align="top"
          :rules="[{ validator: vEmail, message: t('auth.invalidEmail') }]"
          clearable
        />

        <!-- 6 格验证码 + 发送按钮 -->
        <div class="code-field">
          <div class="code-head">
            <label class="code-label">{{ t('auth.code') }}</label>
            <van-button
              size="small"
              type="primary"
              plain
              :disabled="!canSend || sending"
              :loading="sending"
              @click="onSendCode"
            >
              {{ canSend ? t('auth.sendCode') : t('auth.resendIn', { sec: remaining }) }}
            </van-button>
          </div>
          <CodeInput v-model="form.code" :length="CODE_LENGTH" />
        </div>

        <!-- 可选密码 -->
        <van-field
          v-model="form.password"
          :label="t('auth.setPasswordOptional')"
          :placeholder="t('auth.passwordPlaceholder')"
          label-align="top"
          :type="showPwd ? 'text' : 'password'"
          :right-icon="showPwd ? 'eye-o' : 'closed-eye'"
          @click-right-icon="showPwd = !showPwd"
        />
        <div class="hint">{{ t('auth.passwordHint') }}</div>

        <div class="agree">
          <van-checkbox v-model="form.agreed" icon-size="16px" shape="square">
            <i18n-t keypath="auth.agreeTerms" tag="span">
              <template #terms>
                <a class="wb-link" href="#" @click.prevent>{{ t('auth.terms') }}</a>
              </template>
              <template #privacy>
                <a class="wb-link" href="#" @click.prevent>{{ t('auth.privacy') }}</a>
              </template>
            </i18n-t>
          </van-checkbox>
        </div>

        <van-button
          type="primary"
          native-type="submit"
          block
          round
          :loading="submitting"
          class="submit"
        >
          {{ t('auth.createAccount') }}
        </van-button>

        <div class="foot">
          <span>{{ t('auth.haveAccount') }}</span>
          <router-link class="wb-link" :to="{ name: 'Login', query: $route.query }">
            {{ t('auth.signIn') }}
          </router-link>
        </div>
      </van-form>
    </div>
  </AuthLayout>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast, showSuccessToast } from 'vant';
import { showDialog } from 'vant';
import AuthLayout from '@/layouts/AuthLayout.vue';
import CodeInput from '@/components/CodeInput.vue';
import { authApi } from '@/api/auth';
import { deviceApi } from '@/api/device';
import { useAuthStore } from '@/stores/auth';
import { useCountdown } from '@/composables/useCountdown';
import { useApiError } from '@/composables/useApiError';
import { BusinessError } from '@/api/http';
import { EMAIL_REGEX, PASSWORD_REGEX, CODE_COOLDOWN, CODE_LENGTH } from '@/config';
import { i18n } from '@/i18n';
import type { Locale } from '@/types';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const { remaining, canSend, start } = useCountdown(CODE_COOLDOWN);
const { format: fmtErr } = useApiError();

const sending = ref(false);
const submitting = ref(false);
const showPwd = ref(false);

const form = reactive({
  email: '',
  code: '',
  password: '',
  agreed: false,
});

const deviceCode = computed(() => authStore.deviceCtx?.activationCode || '');

const vEmail = (v: string) => !!v && EMAIL_REGEX.test(v);
const vCode = (v: string) => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(v);

async function onSendCode() {
  if (!vEmail(form.email)) {
    showToast(t('auth.invalidEmail'));
    return;
  }
  sending.value = true;
  try {
    await authApi.sendCode({
      email: form.email,
      purpose: 'register',
      locale: i18n.global.locale.value as Locale,
    });
    showSuccessToast(t('auth.codeSent'));
    start();
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    sending.value = false;
  }
}

async function onSubmit() {
  if (submitting.value) return;
  if (!vEmail(form.email)) return showToast(t('auth.invalidEmail'));
  if (!vCode(form.code)) return showToast(t('auth.invalidCode'));
  if (form.password && !PASSWORD_REGEX.test(form.password)) {
    return showToast(t('auth.invalidPassword'));
  }
  if (!form.agreed) return showToast(t('auth.mustAgree'));

  submitting.value = true;
  try {
    const resp = await authApi.register({
      email: form.email,
      code: form.code,
      password: form.password || undefined,
      deviceId: authStore.deviceCtx?.deviceId ?? '',
      activationCode: authStore.deviceCtx?.activationCode ?? '',
      locale: i18n.global.locale.value as Locale,
    });

    // 是否扫码来的(有 deviceCtx)
    const cameFromQR = !!authStore.deviceCtx?.deviceId;

    // 批次 2 的 register 只建 Parent,device 始终是 null;这里把 parentToken + parent 写入 store
    authStore.setAuth(resp.parentToken, resp.parent, resp.device);

    // 扫码场景 → 紧接着调 /api/device/bind 完成真正绑定(批次 3)
    if (cameFromQR) {
      await bindDeviceAfterRegister();
      router.replace({ name: 'OnboardChild' });
    } else {
      authStore.clearDeviceContext();
      showSuccessToast(t('auth.registerSuccess'));
      router.replace({ name: 'Home' });
    }
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    submitting.value = false;
  }
}

/**
 * 注册成功后立即绑定设备(批次 3 /api/device/bind):
 *  - 首次绑定:activatedQuota=true,发 6 本免费故事
 *  - 20003 已绑别家:询问家长是否强制覆盖(forceOverride: true)
 *  - 其他错误只提示,不阻断 OnboardChild(孩子是独立数据)
 */
async function bindDeviceAfterRegister(force = false) {
  const ctx = authStore.deviceCtx;
  if (!ctx?.deviceId || !ctx.activationCode) return;
  try {
    const r = await deviceApi.bind({
      deviceId: ctx.deviceId,
      activationCode: ctx.activationCode,
      forceOverride: force || undefined,
    });
    authStore.setDevice(r.device);
    showSuccessToast(t('auth.registerSuccess'));
  } catch (e) {
    if (e instanceof BusinessError && e.code === 20003 && !force) {
      try {
        await showDialog({
          title: t('errors.20003'),
          message: t('auth.deviceBoundOverrideConfirm'),
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
          showCancelButton: true,
        });
        await bindDeviceAfterRegister(true);
        return;
      } catch {
        // 用户拒绝覆盖,仍然进入 OnboardChild(账户/孩子可用,只是未绑设备)
      }
    }
    showToast(fmtErr(e));
  }
}
</script>

<style scoped>
.form {
  margin-top: 12px;
}
.code-field {
  padding: 10px 0 16px;
}
.code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.code-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--wb-text);
}
.device-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  margin-bottom: 16px;
  background: var(--wb-primary-light);
  color: var(--wb-primary-dark);
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
}
.hint {
  margin: -6px 4px 8px;
  font-size: 12px;
  color: var(--wb-text-sub);
}
.agree {
  margin: 16px 4px;
  font-size: 13px;
  line-height: 1.5;
}
.agree :deep(.van-checkbox__label) {
  color: var(--wb-text-sub);
  line-height: 1.5;
}
.submit {
  margin-top: 8px;
  font-weight: 600;
  font-size: 16px;
  height: 48px;
}
.foot {
  margin-top: 20px;
  text-align: center;
  font-size: 14px;
  color: var(--wb-text-sub);
}
.foot .wb-link {
  margin-left: 6px;
}
:deep(.van-field__label) {
  font-weight: 600;
  color: var(--wb-text);
}
:deep(.van-cell) {
  padding-left: 0;
  padding-right: 0;
}
</style>

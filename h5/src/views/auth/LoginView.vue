<template>
  <AuthLayout>
    <h1 class="wb-title">{{ t('auth.loginTitle') }}</h1>
    <p class="wb-subtitle">{{ t('auth.loginSubtitle') }}</p>

    <div class="wb-card">
      <van-tabs v-model:active="mode" shrink animated line-width="24" line-height="3">
        <van-tab :title="t('auth.loginByCode')" name="code" />
        <van-tab :title="t('auth.loginByPassword')" name="password" />
      </van-tabs>

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

        <!-- 验证码模式 -->
        <template v-if="mode === 'code'">
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
            <CodeInput
              v-model="form.code"
              :length="CODE_LENGTH"
              @complete="onSubmit"
            />
          </div>
        </template>

        <!-- 密码模式 -->
        <van-field
          v-if="mode === 'password'"
          v-model="form.password"
          :label="t('auth.password')"
          :placeholder="t('auth.passwordPlaceholder')"
          label-align="top"
          :type="showPwd ? 'text' : 'password'"
          :right-icon="showPwd ? 'eye-o' : 'closed-eye'"
          :rules="[{ validator: vPassword, message: t('auth.invalidPassword') }]"
          @click-right-icon="showPwd = !showPwd"
        />

        <div class="remember">
          <van-checkbox v-model="form.remember" icon-size="16px" shape="square">
            {{ t('auth.rememberMe') }}
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
          {{ t('auth.signIn') }}
        </van-button>

        <div class="foot">
          <span>{{ t('auth.noAccount') }}</span>
          <router-link class="wb-link" :to="{ name: 'Register', query: $route.query }">
            {{ t('auth.signUp') }}
          </router-link>
        </div>
      </van-form>
    </div>
  </AuthLayout>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import { showToast, showSuccessToast } from 'vant';
import AuthLayout from '@/layouts/AuthLayout.vue';
import CodeInput from '@/components/CodeInput.vue';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useCountdown } from '@/composables/useCountdown';
import { useApiError } from '@/composables/useApiError';
import {
  EMAIL_REGEX,
  PASSWORD_REGEX,
  CODE_COOLDOWN,
  CODE_LENGTH,
  STORAGE_KEYS,
} from '@/config';
import { storage } from '@/utils/storage';
import { i18n } from '@/i18n';
import type { Locale } from '@/types';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { remaining, canSend, start } = useCountdown(CODE_COOLDOWN);
const { format: fmtErr } = useApiError();

const mode = ref<'code' | 'password'>('code');
const showPwd = ref(false);
const sending = ref(false);
const submitting = ref(false);

const form = reactive({
  email: storage.get<string>(STORAGE_KEYS.LAST_EMAIL) || '',
  code: '',
  password: '',
  remember: !!storage.get<boolean>(STORAGE_KEYS.REMEMBER_ME),
});

const vEmail = (v: string) => !!v && EMAIL_REGEX.test(v);
const vCode = (v: string) => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(v);
const vPassword = (v: string) => !!v && PASSWORD_REGEX.test(v);

async function onSendCode() {
  if (!vEmail(form.email)) {
    showToast(t('auth.invalidEmail'));
    return;
  }
  sending.value = true;
  try {
    await authApi.sendCode({
      email: form.email,
      purpose: 'login',
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
  if (submitting.value) return; // 防止 complete 事件二次触发
  if (!vEmail(form.email)) {
    showToast(t('auth.invalidEmail'));
    return;
  }
  if (mode.value === 'code' && !vCode(form.code)) {
    showToast(t('auth.invalidCode'));
    return;
  }
  if (mode.value === 'password' && !vPassword(form.password)) {
    showToast(t('auth.invalidPassword'));
    return;
  }

  submitting.value = true;
  try {
    const resp =
      mode.value === 'code'
        ? await authApi.loginByCode({ email: form.email, code: form.code })
        : await authApi.loginByPassword({ email: form.email, password: form.password });

    authStore.setAuth(resp.parentToken, resp.parent);
    storage.set(STORAGE_KEYS.REMEMBER_ME, form.remember);
    showSuccessToast(t('auth.loginSuccess'));

    const redirect = (route.query.redirect as string) || '/home';
    router.replace(redirect);
  } catch (e) {
    showToast(fmtErr(e));
    // 密码连续 5 次失败被锁 → 10008,自动切到验证码模式(API_CONTRACT §10008)
    if ((e as { code?: number })?.code === 10008 && mode.value === 'password') {
      mode.value = 'code';
    }
  } finally {
    submitting.value = false;
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
.remember {
  margin: 16px 4px;
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

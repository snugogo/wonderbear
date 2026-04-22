<template>
  <div class="page wb-page">
    <van-nav-bar :title="t('settings.title')" left-arrow @click-left="router.back()" />

    <!-- 账户 -->
    <section class="section">
      <div class="section-title">{{ t('settings.sectionAccount') }}</div>
      <van-cell-group inset>
        <van-cell :title="t('settings.email')" :value="authStore.parent?.email || ''" />
        <van-cell
          :title="t('settings.changePassword')"
          is-link
          @click="showPwdPopup = true"
        />
      </van-cell-group>
    </section>

    <!-- 偏好 -->
    <section class="section">
      <div class="section-title">{{ t('settings.sectionPreferences') }}</div>
      <van-cell-group inset>
        <van-cell :title="t('settings.language')" :value="currentLangLabel" is-link @click="showLangPopup = true" />
        <van-cell :title="t('settings.bgm')" :label="t('settings.bgmDesc')">
          <template #right-icon>
            <van-switch v-model="form.playBgm" size="22" :loading="bgmSaving" @update:model-value="onBgmChange" />
          </template>
        </van-cell>
      </van-cell-group>
    </section>

    <!-- 关于 -->
    <section class="section">
      <div class="section-title">{{ t('settings.sectionAbout') }}</div>
      <van-cell-group inset>
        <van-cell :title="t('settings.appVersion')" :value="APP_VERSION" />
        <van-cell :title="t('settings.privacyPolicy')" is-link />
        <van-cell :title="t('settings.terms')" is-link />
      </van-cell-group>
    </section>

    <!-- 语言切换弹窗 -->
    <van-popup v-model:show="showLangPopup" position="bottom" round :style="{ padding: '16px' }">
      <div class="lang-list">
        <div
          v-for="l in SUPPORTED_LOCALES"
          :key="l.value"
          class="lang-item"
          :class="{ active: l.value === localeStore.current }"
          @click="onPickLang(l.value)"
        >
          <span class="flag">{{ l.flag }}</span>
          <span class="label">{{ l.label }}</span>
          <van-icon
            v-if="l.value === localeStore.current"
            name="success"
            color="var(--wb-primary)"
          />
        </div>
      </div>
    </van-popup>

    <!-- 改密码弹窗 -->
    <van-popup
      v-model:show="showPwdPopup"
      position="bottom"
      round
      :style="{ padding: '24px 16px 32px' }"
    >
      <h3 class="popup-title">{{ t('settings.changePassword') }}</h3>
      <van-form @submit="onChangePwd">
        <van-field
          v-model="pwdForm.current"
          type="password"
          :label="t('settings.pwdCurrent')"
          label-align="top"
          :placeholder="t('auth.passwordPlaceholder')"
        />
        <van-field
          v-model="pwdForm.next"
          type="password"
          :label="t('settings.pwdNew')"
          label-align="top"
          :placeholder="t('auth.passwordPlaceholder')"
        />
        <van-field
          v-model="pwdForm.confirm"
          type="password"
          :label="t('settings.pwdConfirm')"
          label-align="top"
          :placeholder="t('auth.passwordPlaceholder')"
        />
        <van-button
          type="primary"
          native-type="submit"
          block
          round
          :loading="pwdSaving"
          class="pwd-submit"
        >
          {{ t('common.confirm') }}
        </van-button>
      </van-form>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showSuccessToast, showToast } from 'vant';
import { useAuthStore } from '@/stores/auth';
import { useLocaleStore } from '@/stores/locale';
import { parentApi } from '@/api/parent';
import { useApiError } from '@/composables/useApiError';
import { PASSWORD_REGEX, SUPPORTED_LOCALES } from '@/config';
import type { Locale } from '@/types';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const localeStore = useLocaleStore();
const { format: fmtErr } = useApiError();

const APP_VERSION = '0.5.0';

const form = reactive({
  playBgm: true,
});
const bgmSaving = ref(false);

const showLangPopup = ref(false);
const showPwdPopup = ref(false);

const pwdForm = reactive({
  current: '',
  next: '',
  confirm: '',
});
const pwdSaving = ref(false);

const currentLangLabel = computed(
  () => SUPPORTED_LOCALES.find((l) => l.value === localeStore.current)?.label || ''
);

// 进入时取一次最新设置(playBgm 等)
onMounted(async () => {
  try {
    const { parent } = await parentApi.me();
    form.playBgm = parent.playBgm;
  } catch {
    // 用默认值
  }
});

async function onBgmChange(value: boolean) {
  bgmSaving.value = true;
  try {
    await parentApi.update({ playBgm: value });
    showSuccessToast(t('settings.saved'));
  } catch (e) {
    form.playBgm = !value; // 回滚
    showToast(fmtErr(e));
  } finally {
    bgmSaving.value = false;
  }
}

async function onPickLang(l: Locale) {
  await localeStore.change(l);
  showLangPopup.value = false;
  // 同步到后端,失败也不阻塞 UI(本地已生效)
  parentApi.update({ locale: l }).catch(() => {});
}

async function onChangePwd() {
  if (!pwdForm.current || !pwdForm.next || !pwdForm.confirm) {
    showToast(t('common.required'));
    return;
  }
  if (pwdForm.next !== pwdForm.confirm) {
    showToast(t('settings.pwdMismatch'));
    return;
  }
  if (!PASSWORD_REGEX.test(pwdForm.next)) {
    showToast(t('auth.invalidPassword'));
    return;
  }
  pwdSaving.value = true;
  try {
    await parentApi.update({
      currentPassword: pwdForm.current,
      password: pwdForm.next,
    });
    showSuccessToast(t('settings.pwdSuccess'));
    pwdForm.current = '';
    pwdForm.next = '';
    pwdForm.confirm = '';
    showPwdPopup.value = false;
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    pwdSaving.value = false;
  }
}
</script>

<style scoped>
.page { background: var(--wb-bg); min-height: 100vh; padding: 0 0 24px; }
:deep(.van-nav-bar) { background: var(--wb-bg); }
:deep(.van-nav-bar__title) { color: var(--wb-text); font-weight: 600; }

.section {
  margin-bottom: 16px;
}
.section-title {
  padding: 16px 20px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--wb-text-sub);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.lang-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0 16px;
}
.lang-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  border-radius: 12px;
  font-size: 16px;
  color: var(--wb-text);
  cursor: pointer;
}
.lang-item:active { background: var(--wb-primary-light); }
.lang-item.active { background: var(--wb-primary-light); font-weight: 600; }
.lang-item .flag { font-size: 22px; }
.lang-item .label { flex: 1; }

.popup-title {
  margin: 0 0 16px;
  font-size: 17px;
  font-weight: 600;
  color: var(--wb-text);
}
.pwd-submit {
  margin-top: 16px;
  height: 44px;
  font-weight: 600;
}
</style>

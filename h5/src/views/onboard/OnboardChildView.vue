<template>
  <div class="onboard-page">
    <!-- 进度指示 -->
    <div class="stepper">
      <div class="step done">
        <van-icon name="success" />
        <span>{{ t('onboard.step1') }}</span>
      </div>
      <div class="step-line active" />
      <div class="step active">
        <span class="num">2</span>
        <span>{{ t('onboard.step2') }}</span>
      </div>
      <div class="step-line" />
      <div class="step">
        <span class="num">3</span>
        <span>{{ t('onboard.step3') }}</span>
      </div>
    </div>

    <!-- 头图引导 -->
    <div class="intro">
      <img
        v-if="!imgBroken"
        :src="asset('bear.readingHero')"
        class="intro-img"
        alt=""
        @error="imgBroken = true"
      />
      <span v-else class="intro-img fallback" aria-hidden="true" />
      <h1 class="intro-title">{{ t('onboard.childTitle') }}</h1>
      <p class="intro-desc">{{ t('onboard.childDesc') }}</p>
    </div>

    <!-- 精简表单:只留最核心的头像 + 名字 + 年龄,次级信息折叠 -->
    <van-form class="form" @submit="onSubmit">
      <section class="section">
        <label class="label">{{ t('children.avatar') }}</label>
        <AvatarPicker v-model="form.avatar" />
      </section>

      <section class="section">
        <label class="label">{{ t('children.name') }}</label>
        <van-field
          v-model.trim="form.name"
          :placeholder="t('onboard.namePlaceholder')"
          :maxlength="CHILD_NAME_MAX"
          show-word-limit
          class="field-plain"
        />
      </section>

      <section class="section">
        <label class="label">{{ t('children.age') }}</label>
        <div class="age-row">
          <van-stepper
            v-model="form.age"
            :min="CHILD_AGE_MIN"
            :max="CHILD_AGE_MAX"
            integer
          />
          <span class="age-unit">{{ t('children.ageUnit') }}</span>
        </div>
      </section>

      <!-- 更多选项(折叠) -->
      <van-collapse v-model="moreExpanded" class="more">
        <van-collapse-item :title="t('onboard.moreOptions')" name="1">
          <section class="section">
            <label class="label">{{ t('children.gender') }}</label>
            <van-radio-group v-model="form.gender" direction="horizontal" class="gender-group">
              <van-radio name="male">{{ t('children.genderMale') }}</van-radio>
              <van-radio name="female">{{ t('children.genderFemale') }}</van-radio>
              <van-radio name="prefer_not_say">{{ t('children.genderNeutral') }}</van-radio>
            </van-radio-group>
          </section>

          <section class="section">
            <label class="label">{{ t('children.primaryLang') }}</label>
            <div class="lang-chips">
              <div
                v-for="opt in LANG_OPTIONS"
                :key="opt.value"
                class="chip"
                :class="{ active: form.primaryLang === opt.value }"
                @click="form.primaryLang = opt.value"
              >
                <span class="flag">{{ opt.flag }}</span>
                <span>{{ opt.label }}</span>
              </div>
            </div>
          </section>

          <section class="section">
            <label class="label">{{ t('children.secondLang') }}</label>
            <div class="lang-chips">
              <div
                class="chip"
                :class="{ active: form.secondLang === 'none' }"
                @click="form.secondLang = 'none'"
              >
                <span>— {{ t('children.secondLangNone') }}</span>
              </div>
              <div
                v-for="opt in LANG_OPTIONS.filter((o) => o.value !== form.primaryLang)"
                :key="opt.value"
                class="chip"
                :class="{ active: form.secondLang === opt.value }"
                @click="form.secondLang = opt.value"
              >
                <span class="flag">{{ opt.flag }}</span>
                <span>{{ opt.label }}</span>
              </div>
            </div>
          </section>
        </van-collapse-item>
      </van-collapse>

      <van-button
        type="primary"
        native-type="submit"
        block
        round
        :loading="submitting"
        class="submit"
      >
        {{ t('onboard.createNext') }}
      </van-button>

      <div class="skip-link">
        <a class="wb-link" href="#" @click.prevent="onSkip">
          {{ t('onboard.skipForNow') }}
        </a>
      </div>
    </van-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import AvatarPicker from '@/components/AvatarPicker.vue';
import { childApi } from '@/api/child';
import { useAuthStore } from '@/stores/auth';
import { useApiError } from '@/composables/useApiError';
import {
  CHILD_AGE_MAX,
  CHILD_AGE_MIN,
  CHILD_NAME_MAX,
} from '@/config';
import { DEFAULT_AVATAR_STEM } from '@/config/assets';
import { asset } from '@/config/assets';
import type { Locale } from '@/types';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const { format: fmtErr } = useApiError();

const imgBroken = ref(false);
const submitting = ref(false);
const moreExpanded = ref<string[]>([]);

const LANG_OPTIONS: Array<{ value: Locale; label: string; flag: string }> = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'pl', label: 'Polski', flag: '🇵🇱' },
  { value: 'ro', label: 'Română', flag: '🇷🇴' },
  { value: 'zh', label: '中文', flag: '🇨🇳' },
];

// 根据家长 locale 猜默认主语言
const parentLocale = (authStore.parent?.locale ?? 'en') as Locale;

const form = reactive({
  name: '',
  age: 5,
  gender: 'prefer_not_say' as 'male' | 'female' | 'prefer_not_say',
  avatar: DEFAULT_AVATAR_STEM,
  primaryLang: parentLocale,
  secondLang: 'none' as Locale | 'none',
});

async function onSubmit() {
  if (submitting.value) return;
  if (!form.name.trim()) return showToast(t('children.invalidName'));
  submitting.value = true;
  try {
    await childApi.create({
      name: form.name.trim(),
      age: form.age,
      gender: form.gender,
      avatar: form.avatar,
      primaryLang: form.primaryLang,
      secondLang: form.secondLang,
      birthday: null,
    });
    router.replace({ name: 'OnboardDone' });
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    submitting.value = false;
  }
}

function onSkip() {
  // 允许用户跳过,直接去 done 页;服务端仍能等孩子建好,孩子可以之后从 Home 补建
  router.replace({ name: 'OnboardDone', query: { skipped: '1' } });
}
</script>

<style scoped>
.onboard-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #FFF8F0 0%, #FFE4CC 100%);
  padding: 20px 20px 32px;
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
.step .van-icon,
.step .num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  background: var(--wb-border);
  color: #fff;
}
.step.done .van-icon {
  background: var(--wb-success);
}
.step.active {
  color: var(--wb-primary-dark);
  font-weight: 600;
}
.step.active .num {
  background: var(--wb-primary);
}
.step-line {
  flex: 1;
  height: 2px;
  background: var(--wb-border);
  margin: 0 8px;
  margin-bottom: 16px;
}
.step-line.active {
  background: var(--wb-primary);
}

.intro {
  text-align: center;
  margin-bottom: 20px;
}
.intro-img {
  width: 120px;
  height: 120px;
  object-fit: contain;
  margin: 0 auto 8px;
  display: block;
}
.intro-img.fallback {
  border-radius: 50%;
  background: linear-gradient(135deg, #F5E6D3, var(--wb-primary-light));
}
.intro-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
  color: var(--wb-text);
}
.intro-desc {
  margin: 0;
  font-size: 14px;
  color: var(--wb-text-sub);
  line-height: 1.5;
}

.form {
  background: var(--wb-card);
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 4px 20px rgba(255, 138, 61, 0.08);
}

.section {
  padding: 12px 0;
  border-bottom: 1px solid var(--wb-border);
}
.section:last-child {
  border-bottom: none;
}
.label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--wb-text);
  margin-bottom: 10px;
}
.field-plain :deep(.van-cell) {
  padding: 8px 0;
}
.age-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.age-unit {
  font-size: 14px;
  color: var(--wb-text-sub);
}
.gender-group {
  gap: 20px;
}
.lang-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--wb-bg);
  font-size: 13px;
  color: var(--wb-text-sub);
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: all 0.12s;
}
.chip.active {
  background: var(--wb-primary-light);
  color: var(--wb-primary-dark);
  border-color: var(--wb-primary);
  font-weight: 600;
}
.flag {
  font-size: 16px;
}
.more {
  margin: 12px 0;
  background: transparent;
}
.more :deep(.van-collapse-item__title) {
  background: transparent;
  padding: 10px 0;
}
.more :deep(.van-collapse-item__wrapper) {
  background: transparent;
}
.submit {
  margin-top: 16px;
  height: 48px;
  font-weight: 600;
  font-size: 16px;
}
.skip-link {
  text-align: center;
  margin-top: 14px;
  font-size: 13px;
}
</style>

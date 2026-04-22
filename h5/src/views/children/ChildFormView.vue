<template>
  <div class="page">
    <van-nav-bar
      :title="isEdit ? t('children.formTitleEdit') : t('children.formTitleCreate')"
      left-arrow
      @click-left="router.back()"
    />

    <!-- 加载态(编辑模式首次拉数据) -->
    <div v-if="loading" class="loading">
      <van-loading color="var(--wb-primary)" />
    </div>

    <van-form v-else class="form" @submit="onSubmit">
      <!-- 头像 -->
      <section class="section">
        <label class="label">{{ t('children.avatar') }}</label>
        <AvatarPicker v-model="form.avatar" />
      </section>

      <!-- 名字 -->
      <section class="section">
        <label class="label">{{ t('children.name') }}</label>
        <van-field
          v-model.trim="form.name"
          :placeholder="t('children.namePlaceholder')"
          :maxlength="CHILD_NAME_MAX"
          show-word-limit
          :rules="[{ validator: vName, message: t('children.invalidName') }]"
          class="field-plain"
        />
      </section>

      <!-- 年龄 -->
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

      <!-- 性别 -->
      <section class="section">
        <label class="label">{{ t('children.gender') }}</label>
        <van-radio-group v-model="form.gender" direction="horizontal" class="gender-group">
          <van-radio name="male">{{ t('children.genderMale') }}</van-radio>
          <van-radio name="female">{{ t('children.genderFemale') }}</van-radio>
          <van-radio name="prefer_not_say">{{ t('children.genderNeutral') }}</van-radio>
        </van-radio-group>
      </section>

      <!-- 主语言 -->
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

      <!-- 学习语言(可选) -->
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

      <!-- 生日(可选) -->
      <section class="section">
        <label class="label">{{ t('children.birthdayOptional') }}</label>
        <van-field
          :model-value="form.birthday || ''"
          readonly
          is-link
          :placeholder="t('children.birthdayPick')"
          @click="showBirthdayPicker = true"
          class="field-plain"
        />
      </section>

      <van-popup v-model:show="showBirthdayPicker" position="bottom" round>
        <van-date-picker
          :model-value="birthdayPickerValue"
          :min-date="minDate"
          :max-date="maxDate"
          @confirm="onBirthdayConfirm"
          @cancel="showBirthdayPicker = false"
          :title="t('children.birthday')"
        />
      </van-popup>

      <!-- 提交 -->
      <van-button
        type="primary"
        native-type="submit"
        block
        round
        :loading="submitting"
        class="submit"
      >
        {{ isEdit ? t('children.save') : t('children.create') }}
      </van-button>
    </van-form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import { showSuccessToast, showToast } from 'vant';
import AvatarPicker from '@/components/AvatarPicker.vue';
import { childApi } from '@/api/child';
import { useApiError } from '@/composables/useApiError';
import {
  CHILD_AGE_MAX,
  CHILD_AGE_MIN,
  CHILD_NAME_MAX,
} from '@/config';
import { DEFAULT_AVATAR_STEM } from '@/config/assets';
import type { Locale } from '@/types';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const { format: fmtErr } = useApiError();

const isEdit = computed(() => route.name === 'ChildEdit');
const editId = computed(() => (route.params.id as string) || '');

const LANG_OPTIONS: Array<{ value: Locale; label: string; flag: string }> = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'pl', label: 'Polski', flag: '🇵🇱' },
  { value: 'ro', label: 'Română', flag: '🇷🇴' },
  { value: 'zh', label: '中文', flag: '🇨🇳' },
];

const form = reactive({
  name: '',
  age: 5,
  gender: 'prefer_not_say' as 'male' | 'female' | 'prefer_not_say',
  avatar: DEFAULT_AVATAR_STEM,
  primaryLang: 'en' as Locale,
  secondLang: 'none' as Locale | 'none',
  birthday: '' as string, // ISO date "2020-05-14"
});

const loading = ref(false);
const submitting = ref(false);
const showBirthdayPicker = ref(false);

// DatePicker 用 ['YYYY','MM','DD'] 数组模式
const birthdayPickerValue = computed<string[]>(() => {
  if (!form.birthday) {
    const d = new Date(Date.now() - 5 * 365 * 86400_000); // 默认 5 岁左右
    return [String(d.getFullYear()), pad2(d.getMonth() + 1), pad2(d.getDate())];
  }
  const [y, m, d] = form.birthday.split('-');
  return [y, m, d];
});
const minDate = new Date(new Date().getFullYear() - 10, 0, 1);
const maxDate = new Date();

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function onBirthdayConfirm({ selectedValues }: { selectedValues: string[] }) {
  form.birthday = selectedValues.join('-');
  showBirthdayPicker.value = false;
}

// ---- 校验 ----
const vName = (v: string) => !!v && v.trim().length > 0 && v.length <= CHILD_NAME_MAX;

async function onSubmit() {
  if (submitting.value) return;
  if (!vName(form.name)) return showToast(t('children.invalidName'));
  if (form.age < CHILD_AGE_MIN || form.age > CHILD_AGE_MAX)
    return showToast(t('children.invalidAge'));
  if (!form.avatar) return showToast(t('children.invalidAvatar'));

  submitting.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      age: form.age,
      gender: form.gender,
      avatar: form.avatar,
      primaryLang: form.primaryLang,
      secondLang: form.secondLang,
      birthday: form.birthday || null,
    };
    if (isEdit.value) {
      await childApi.update(editId.value, payload);
      showSuccessToast(t('children.updateSuccess'));
    } else {
      await childApi.create(payload);
      showSuccessToast(t('children.createSuccess'));
    }
    router.replace({ name: 'Children' });
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    submitting.value = false;
  }
}

// 编辑模式:进入时拉一次数据
onMounted(async () => {
  if (!isEdit.value || !editId.value) return;
  loading.value = true;
  try {
    const { child } = await childApi.get(editId.value);
    form.name = child.name;
    form.age = child.age;
    form.gender = child.gender ?? 'prefer_not_say';
    form.avatar = child.avatar;
    form.primaryLang = child.primaryLang;
    form.secondLang = child.secondLang;
    form.birthday = child.birthday || '';
  } catch (e) {
    showToast(fmtErr(e));
    router.replace({ name: 'Children' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--wb-bg);
  padding-bottom: 24px;
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
.form {
  padding: 8px 16px;
}
.section {
  background: var(--wb-card);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--wb-text);
  margin-bottom: 10px;
}
.field-plain {
  padding: 0;
  background: transparent;
}
.field-plain::after {
  border-bottom: none;
}
:deep(.van-field__control) {
  font-size: 15px;
}

.age-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.age-unit {
  font-size: 14px;
  color: var(--wb-text-sub);
}

.gender-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
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
  background: var(--wb-bg);
  border: 1px solid var(--wb-border);
  border-radius: 999px;
  font-size: 13px;
  color: var(--wb-text);
  cursor: pointer;
  transition: all 0.12s;
}
.chip:active {
  transform: scale(0.96);
}
.chip.active {
  background: var(--wb-primary-light);
  border-color: var(--wb-primary);
  color: var(--wb-primary-dark);
  font-weight: 600;
}
.flag {
  font-size: 15px;
}

.submit {
  margin-top: 16px;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
}
</style>

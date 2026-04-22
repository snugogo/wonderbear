import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Locale } from '@/types';
import { i18n, setLocale as applyLocale } from '@/i18n';

export const useLocaleStore = defineStore('locale', () => {
  const current = ref<Locale>(i18n.global.locale.value as Locale);

  async function change(locale: Locale) {
    current.value = locale;
    await applyLocale(locale);
  }

  return { current, change };
});

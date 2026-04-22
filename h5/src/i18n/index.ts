import { createI18n } from 'vue-i18n';
import type { Locale } from '@/types';
import { detectLocale, saveLocale } from '@/utils/locale';

import en from './locales/en';
import zh from './locales/zh';
import pl from './locales/pl';
import ro from './locales/ro';

export const i18n = createI18n({
  legacy: false, // Composition API 模式
  globalInjection: true, // 模板里可用 $t
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en, zh, pl, ro },
  missingWarn: false,
  fallbackWarn: false,
});

/** 运行时切换语言,同时持久化 + 更新 html[lang] + Vant 组件语言 */
export async function setLocale(locale: Locale): Promise<void> {
  i18n.global.locale.value = locale;
  document.documentElement.setAttribute('lang', locale);
  saveLocale(locale);

  // Vant 内置组件的本地化(按需导入时需要各自配置,此处做 best-effort)
  try {
    const { Locale: VantLocale } = await import('vant');
    const map: Record<Locale, () => Promise<{ default: object }>> = {
      en: () => import('vant/es/locale/lang/en-US'),
      zh: () => import('vant/es/locale/lang/zh-CN'),
      pl: () => import('vant/es/locale/lang/en-US'), // Vant 无波兰语,兜底英语
      ro: () => import('vant/es/locale/lang/en-US'), // Vant 无罗马尼亚语,兜底英语
    };
    const mod = await map[locale]();
    VantLocale.use(locale === 'pl' || locale === 'ro' ? 'en-US' : locale === 'zh' ? 'zh-CN' : 'en-US', mod.default);
  } catch {
    // ignore
  }
}

/** 初始化时同步一次 HTML lang + Vant 语言 */
export async function initLocale(): Promise<void> {
  await setLocale(i18n.global.locale.value as Locale);
}

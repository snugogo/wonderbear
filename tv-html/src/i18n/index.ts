/**
 * vue-i18n setup.
 * Default zh; ?locale=en|pl|ro overrides for dev.
 */

import { createI18n } from 'vue-i18n';
import zh from './locales/zh';
import en from './locales/en';
import pl from './locales/pl';
import ro from './locales/ro';
import type { Locale } from '@/utils/errorCodes';

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh';
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('locale');
  if (fromUrl === 'zh' || fromUrl === 'en' || fromUrl === 'pl' || fromUrl === 'ro') {
    return fromUrl;
  }
  return 'zh';
}

// vue-i18n's strict types want LocaleMessages keyed by their default locales.
// We type the messages map loosely and let vue-i18n's runtime fall back to fallbackLocale.
const messages: Record<Locale, unknown> = { zh, en, pl, ro };

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: detectInitialLocale(),
  fallbackLocale: 'zh',
  messages: messages as never,
});

export function setLocale(locale: Locale): void {
  // Composition mode: locale is a Ref<string>
  const loc = i18n.global.locale as unknown as { value: string };
  loc.value = locale;
}

export function getLocale(): Locale {
  const loc = i18n.global.locale as unknown as { value: string };
  return (loc.value || 'zh') as Locale;
}

export type { Locale };

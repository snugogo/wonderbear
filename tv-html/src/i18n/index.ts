/**
 * vue-i18n setup.
 *
 * Precedence of initial locale:
 *   1. ?locale=zh|en|pl|ro  in URL (explicit dev override)
 *   2. navigator.language prefix match (zh / en / pl / ro)
 *   3. 'en' fallback — demo phase targets overseas market default.
 *
 * All 4 locale bundles remain fully loaded; setLocale(code) switches at runtime.
 */

import { createI18n } from 'vue-i18n';
import zh from './locales/zh';
import en from './locales/en';
import pl from './locales/pl';
import ro from './locales/ro';
import type { Locale } from '@/utils/errorCodes';

const DEFAULT_LOCALE: Locale = 'en';

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  // 1. Explicit URL param takes highest precedence
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('locale');
  if (fromUrl === 'zh' || fromUrl === 'en' || fromUrl === 'pl' || fromUrl === 'ro') {
    return fromUrl;
  }

  // 2. Browser language prefix
  const lang = (navigator.language || '').toLowerCase();
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('en')) return 'en';
  if (lang.startsWith('pl')) return 'pl';
  if (lang.startsWith('ro')) return 'ro';

  // 3. Demo-phase default
  return DEFAULT_LOCALE;
}

// vue-i18n's strict types want LocaleMessages keyed by their default locales.
// We type the messages map loosely and let vue-i18n's runtime fall back to fallbackLocale.
const messages: Record<Locale, unknown> = { zh, en, pl, ro };

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: detectInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: messages as never,
});

export function setLocale(locale: Locale): void {
  // Composition mode: locale is a Ref<string>
  const loc = i18n.global.locale as unknown as { value: string };
  loc.value = locale;
}

export function getLocale(): Locale {
  const loc = i18n.global.locale as unknown as { value: string };
  return (loc.value || DEFAULT_LOCALE) as Locale;
}

export type { Locale };

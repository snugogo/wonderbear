/**
 * vue-i18n setup.
 *
 * Precedence of initial locale (demo phase, overseas-first):
 *   1. ?locale=zh|en|pl|ro|ja|de|es  in URL (explicit override)
 *   2. 'en' — hard default. We intentionally do NOT read navigator.language
 *      because overseas demo TVs running on a Chinese dev box would otherwise
 *      boot into zh. Users select language from the in-app switcher, not
 *      from browser locale.
 *
 * All locale bundles remain fully loaded; setLocale(code) switches at runtime.
 */

import { createI18n } from 'vue-i18n';
import zh from './locales/zh';
import en from './locales/en';
import pl from './locales/pl';
import ro from './locales/ro';
import ja from './locales/ja';
import de from './locales/de';
import es from './locales/es';
import type { Locale } from '@/utils/errorCodes';

const DEFAULT_LOCALE: Locale = 'en';

const ALL_LOCALES: ReadonlyArray<Locale> = ['zh', 'en', 'pl', 'ro', 'ja', 'de', 'es'];

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('locale');
  if (fromUrl && (ALL_LOCALES as readonly string[]).includes(fromUrl)) {
    return fromUrl as Locale;
  }

  // Intentional: do not sniff navigator.language (would flip dev boxes to zh).
  return DEFAULT_LOCALE;
}

// vue-i18n's strict types want LocaleMessages keyed by their default locales.
// We type the messages map loosely and let vue-i18n's runtime fall back to fallbackLocale.
const messages: Record<Locale, unknown> = { zh, en, pl, ro, ja, de, es };

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

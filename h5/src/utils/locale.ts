import type { Locale } from '@/types';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, STORAGE_KEYS } from '@/config';
import { storage } from './storage';

const supportedSet = new Set(SUPPORTED_LOCALES.map((l) => l.value));

/**
 * 按优先级决定当前语言:
 * 1. localStorage 已保存的用户选择
 * 2. 浏览器 navigator.language 前缀匹配
 * 3. 环境默认
 */
export function detectLocale(): Locale {
  const saved = storage.get<Locale>(STORAGE_KEYS.LOCALE);
  if (saved && supportedSet.has(saved)) return saved;

  const navLang = (navigator.language || '').toLowerCase();
  // zh-CN / zh-TW 都归 zh
  const prefix = navLang.split('-')[0] as Locale;
  if (supportedSet.has(prefix)) return prefix;

  return DEFAULT_LOCALE;
}

/** 持久化用户选择 */
export function saveLocale(locale: Locale): void {
  storage.set(STORAGE_KEYS.LOCALE, locale);
}

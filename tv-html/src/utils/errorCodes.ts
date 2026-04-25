/**
 * WonderBear TV · Error Code Table
 * Source: API_CONTRACT.md §2 (authoritative).
 *
 * Usage:
 *   import { getErrorInfo, ERR } from '@/utils/errorCodes';
 *   const info = getErrorInfo(ERR.QUOTA_EXHAUSTED, 'zh');
 *   // → { code, name, message, bear, tvAction }
 */

export type Locale = 'zh' | 'en' | 'pl' | 'ro' | 'ja' | 'de' | 'es';

export type TvAction =
  | 'silent_reactivate'
  | 'show_on_h5_only'
  | 'goto_activation'
  | 'show_retry'
  | 'show_retry_countdown'
  | 'show_upgrade_prompt'
  | 'show_tomorrow'
  | 'rewind_dialogue'
  | 'redo_speak'
  | 'silent_degrade_to_text'
  | 'show_support_contact'
  | 'goto_offline';

export type BearAsset =
  | 'bear_sit'
  | 'bear_confused'
  | 'bear_qr_peek'
  | 'bear_error_oops'
  | 'bear_think'
  | 'bear_sleep'
  | 'bear_no_network'
  | null; // null = silent (no bear shown)

export interface ErrorInfo {
  code: number;
  name: string;
  message: string;
  bear: BearAsset;
  tvAction: TvAction;
}

interface ErrorEntry {
  name: string;
  zh: string;
  en: string;
  pl: string;
  ro: string;
  // Optional preview-grade locales (fall back to en at runtime).
  ja?: string;
  de?: string;
  es?: string;
  bear: BearAsset;
  tvAction: TvAction;
}

// Named constants — reference by name in business code, not magic numbers.
export const ERR = {
  // 1xxxx Auth
  TOKEN_EXPIRED:            10001,
  VERIFY_CODE_INVALID:      10002,
  EMAIL_INVALID:            10003,
  VERIFY_CODE_EXPIRED:      10004,
  EMAIL_ALREADY_REGISTERED: 10005,
  TOKEN_TYPE_MISMATCH:      10006,
  PASSWORD_WRONG:           10007,
  ACCOUNT_LOCKED:           10008,
  PASSWORD_TOO_WEAK:        10009,
  TOKEN_REVOKED:            10010,

  // 2xxxx Device
  DEVICE_NOT_ACTIVATED:     20001,
  ACTIVATION_CODE_INVALID:  20002,
  DEVICE_BOUND_TO_OTHER:    20003,
  ACTIVATION_CODE_USED:     20004,
  DEVICE_NOT_FOUND:         20005,
  DEVICE_DISABLED:          20006,
  DEVICE_ID_FORMAT_INVALID: 20007,
  MAX_DEVICES_REACHED:      20008,

  // 3xxxx Story / Content
  STORY_GEN_FAILED:         30001,
  IMAGE_GEN_ALL_FAILED:     30002,
  TTS_FAILED:               30003,
  QUOTA_EXHAUSTED:          30004,
  DAILY_LIMIT_REACHED:      30005,
  CONTENT_SAFETY_BLOCKED:   30006,
  STORY_NOT_FOUND:          30007,
  STORY_NOT_READY:          30008,
  CHILD_NOT_FOUND:          30009,
  MAX_CHILDREN_REACHED:     30010,
  ASR_FAILED:               30011,
  DIALOGUE_ROUND_OVERFLOW:  30012,

  // 4xxxx Payment
  STRIPE_PAYMENT_FAILED:        40001,
  PAYPAL_PAYMENT_FAILED:        40002,
  SUBSCRIPTION_ALREADY_ACTIVE:  40003,
  SUBSCRIPTION_NOT_FOUND:       40004,
  PDF_QUOTA_EXHAUSTED:          40005,
  PDF_LOCKED_FOR_FREE:          40006,
  WEBHOOK_SIGNATURE_INVALID:    40007,

  // 5xxxx Server / Upstream
  INTERNAL_ERROR:       50001,
  UPSTREAM_UNAVAILABLE: 50002,
  DB_UNAVAILABLE:       50003,
  REDIS_UNAVAILABLE:    50004,
  EMAIL_SEND_FAILED:    50005,

  // 9xxxx Client
  PARAM_MISSING:         90001,
  PARAM_INVALID:         90002,
  RATE_LIMITED:          90003,
  IDEMPOTENCY_CONFLICT:  90004,
  METHOD_NOT_ALLOWED:    90005,
} as const;

// Network-layer synthetic code (not from server, generated client-side on offline)
export const NETWORK_OFFLINE = 91000;

const TABLE: Record<number, ErrorEntry> = {
  // ---------- 1xxxx Auth ----------
  10001: {
    name: 'TOKEN_EXPIRED',
    zh: '登录已过期,请重新登录', en: 'Session expired, please log in again',
    pl: 'Sesja wygasła, zaloguj się ponownie', ro: 'Sesiune expirată, te rog reconectează-te',
    bear: 'bear_sit', tvAction: 'silent_reactivate',
  },
  10002: {
    name: 'VERIFY_CODE_INVALID',
    zh: '验证码错误', en: 'Verification code invalid',
    pl: 'Nieprawidłowy kod weryfikacyjny', ro: 'Cod de verificare invalid',
    bear: 'bear_confused', tvAction: 'show_on_h5_only',
  },
  10006: {
    name: 'TOKEN_TYPE_MISMATCH',
    zh: '无效的凭据类型', en: 'Invalid credential type',
    pl: 'Nieprawidłowy typ poświadczenia', ro: 'Tip de credential invalid',
    bear: 'bear_confused', tvAction: 'silent_reactivate',
  },
  10010: {
    name: 'TOKEN_REVOKED',
    zh: '登录已失效,请重新激活', en: 'Session revoked, please re-activate',
    pl: 'Sesja unieważniona', ro: 'Sesiune revocată',
    bear: 'bear_sit', tvAction: 'silent_reactivate',
  },

  // ---------- 2xxxx Device ----------
  20001: {
    name: 'DEVICE_NOT_ACTIVATED',
    zh: '设备还没激活哦,请用激活码激活~',
    en: 'Device not activated, please use activation code',
    pl: 'Urządzenie nieaktywowane', ro: 'Dispozitiv neactivat',
    bear: 'bear_qr_peek', tvAction: 'goto_activation',
  },
  20002: {
    name: 'ACTIVATION_CODE_INVALID',
    zh: '激活码好像不对哦,再检查一下?',
    en: 'Activation code invalid, please check',
    pl: 'Nieprawidłowy kod aktywacyjny', ro: 'Cod de activare invalid',
    bear: 'bear_confused', tvAction: 'show_retry',
  },
  20003: {
    name: 'DEVICE_BOUND_TO_OTHER',
    zh: '这台设备已经绑定了其他账号',
    en: 'Device already bound to another account',
    pl: 'Urządzenie już powiązane z innym kontem', ro: 'Dispozitiv deja asociat',
    bear: 'bear_confused', tvAction: 'show_on_h5_only',
  },
  20004: {
    name: 'ACTIVATION_CODE_USED',
    zh: '这个激活码已经被用过啦',
    en: 'This activation code has been used',
    pl: 'Kod aktywacyjny został już użyty', ro: 'Cod de activare deja folosit',
    bear: 'bear_confused', tvAction: 'show_retry',
  },
  20006: {
    name: 'DEVICE_DISABLED',
    zh: '设备已被禁用,请联系客服',
    en: 'Device disabled, contact support',
    pl: 'Urządzenie wyłączone, skontaktuj się z pomocą',
    ro: 'Dispozitiv dezactivat, contactează suportul',
    bear: 'bear_error_oops', tvAction: 'show_support_contact',
  },

  // ---------- 3xxxx Story ----------
  30001: {
    name: 'STORY_GEN_FAILED',
    zh: '小熊的画笔不小心断了,再来一次好吗?',
    en: "Story generation hiccuped, let's try again",
    pl: 'Coś poszło nie tak, spróbujmy ponownie',
    ro: 'Generarea a eșuat, să încercăm din nou',
    bear: 'bear_error_oops', tvAction: 'show_retry',
  },
  30002: {
    name: 'IMAGE_GEN_ALL_FAILED',
    zh: '小熊的画笔不小心断了,再来一次好吗?',
    en: 'Image generation unavailable, please retry',
    pl: 'Generowanie obrazów niedostępne',
    ro: 'Generare imagini indisponibilă',
    bear: 'bear_error_oops', tvAction: 'show_retry',
  },
  30003: {
    name: 'TTS_FAILED',
    zh: '', en: '', pl: '', ro: '', // Silent degrade to text mode
    bear: null, tvAction: 'silent_degrade_to_text',
  },
  30004: {
    name: 'QUOTA_EXHAUSTED',
    zh: '你的故事书画满啦~ 告诉爸爸妈妈解锁更多故事吧!',
    en: 'Story quota used up, ask parents to unlock more',
    pl: 'Limit historii wyczerpany',
    ro: 'Limita de povești atinsă',
    bear: 'bear_think', tvAction: 'show_upgrade_prompt',
  },
  30005: {
    name: 'DAILY_LIMIT_REACHED',
    zh: '今天的故事都讲完啦,明天再来吧~',
    en: 'Daily limit reached, try again tomorrow',
    pl: 'Dzienny limit osiągnięty',
    ro: 'Limita zilnică atinsă',
    bear: 'bear_sleep', tvAction: 'show_tomorrow',
  },
  30006: {
    name: 'CONTENT_SAFETY_BLOCKED',
    zh: '熊熊不太明白这个故事哦,换个话题吧~',
    en: "Let's try a different story",
    pl: 'Spróbujmy innego tematu',
    ro: 'Să încercăm alt subiect',
    bear: 'bear_confused', tvAction: 'rewind_dialogue',
  },
  30011: {
    name: 'ASR_FAILED',
    zh: '没听清楚,再说一次好吗?',
    en: 'Could not hear you, please try again',
    pl: 'Nie słyszałem, spróbuj ponownie',
    ro: 'Nu am auzit, încearcă din nou',
    bear: 'bear_confused', tvAction: 'redo_speak',
  },
  30012: {
    name: 'DIALOGUE_ROUND_OVERFLOW',
    zh: '熊熊先把这些画成故事,下次再继续哦~',
    en: "Let's turn this into a story now, more next time!",
    pl: '[TODO_pl] Zróbmy z tego historię teraz',
    ro: '[TODO_ro] Hai să facem o poveste acum',
    bear: 'bear_think', tvAction: 'show_retry',
  },

  // ---------- 5xxxx Server ----------
  50001: {
    name: 'INTERNAL_ERROR',
    zh: '熊熊在休息哦,等一会再试~',
    en: 'Bear is taking a break, try again soon',
    pl: 'Misiu odpoczywa, spróbuj za chwilę',
    ro: 'Ursulețul se odihnește, încearcă mai târziu',
    bear: 'bear_sleep', tvAction: 'show_retry_countdown',
  },
  50002: {
    name: 'UPSTREAM_UNAVAILABLE',
    zh: '熊熊在休息哦,等一会再试~',
    en: 'Service temporarily unavailable',
    pl: 'Usługa chwilowo niedostępna',
    ro: 'Serviciu temporar indisponibil',
    bear: 'bear_sleep', tvAction: 'show_retry_countdown',
  },

  // ---------- 9xxxx Client ----------
  90003: {
    name: 'RATE_LIMITED',
    zh: '慢一点哦,熊熊跟不上啦',
    en: 'Too fast, please slow down',
    pl: 'Za szybko, zwolnij',
    ro: 'Prea rapid, mai încet',
    bear: 'bear_think', tvAction: 'show_retry_countdown',
  },
};

const NETWORK_OFFLINE_INFO: ErrorEntry = {
  name: 'NETWORK_OFFLINE',
  zh: '网络不通了,检查一下 WiFi?',
  en: 'Network offline, check WiFi',
  pl: 'Brak połączenia',
  ro: 'Fără conexiune',
  bear: 'bear_no_network',
  tvAction: 'goto_offline',
};

/**
 * Look up error info. Falls back to a generic friendly entry for unknown codes.
 * NEVER expose the numeric code or English message to children.
 */
export function getErrorInfo(code: number, locale: Locale = 'en'): ErrorInfo {
  if (code === NETWORK_OFFLINE) {
    return {
      code,
      name: NETWORK_OFFLINE_INFO.name,
      message: NETWORK_OFFLINE_INFO[locale] || NETWORK_OFFLINE_INFO.en,
      bear: NETWORK_OFFLINE_INFO.bear,
      tvAction: NETWORK_OFFLINE_INFO.tvAction,
    };
  }

  const entry = TABLE[code];
  if (!entry) {
    return {
      code,
      name: 'UNKNOWN',
      message: locale === 'en'
        ? 'Something went wrong, please try again'
        : '出了点小问题,再试一次吧~',
      bear: 'bear_error_oops',
      tvAction: 'show_retry',
    };
  }

  return {
    code,
    name: entry.name,
    message: entry[locale] || entry.en,
    bear: entry.bear,
    tvAction: entry.tvAction,
  };
}

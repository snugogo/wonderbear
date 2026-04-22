// ============================================================================
// Business error codes — 5-digit numeric codes per API_CONTRACT §二
//
// Code groups:
//   1xxxx — auth / authorization
//   2xxxx — device / activation
//   3xxxx — story / content
//   4xxxx — payment / subscription
//   5xxxx — server / upstream
//   9xxxx — client request errors
//
// Each entry has 4 localized messages (zh / en / pl / ro). pl/ro are
// initially copies of en — translation pass happens in batch 4 alongside
// content safety messages.
//
// Usage:
//   import { ErrorCodes, getMessage } from '../utils/errorCodes.js';
//   throw new BizError(ErrorCodes.TOKEN_EXPIRED);
//   const msgZh = getMessage(10001, 'zh');
// ============================================================================

const codes = {
  // ---------- 1xxxx auth ----------
  TOKEN_EXPIRED: {
    code: 10001,
    zh: '登录已过期,请重新登录',
    en: 'Session expired, please log in again',
    pl: 'Sesja wygasła, zaloguj się ponownie',
    ro: 'Sesiunea a expirat, vă rugăm să vă autentificați din nou',
  },
  VERIFY_CODE_INVALID: {
    code: 10002,
    zh: '验证码错误',
    en: 'Verification code invalid',
    pl: 'Kod weryfikacyjny nieprawidłowy',
    ro: 'Cod de verificare invalid',
  },
  EMAIL_INVALID: {
    code: 10003,
    zh: '邮箱格式不正确',
    en: 'Invalid email format',
    pl: 'Nieprawidłowy format e-maila',
    ro: 'Format de e-mail invalid',
  },
  VERIFY_CODE_EXPIRED: {
    code: 10004,
    zh: '验证码已过期,请重新发送',
    en: 'Verification code expired',
    pl: 'Kod weryfikacyjny wygasł',
    ro: 'Codul de verificare a expirat',
  },
  EMAIL_ALREADY_REGISTERED: {
    code: 10005,
    zh: '邮箱已注册,请直接登录',
    en: 'Email already registered, please log in',
    pl: 'E-mail już zarejestrowany, zaloguj się',
    ro: 'E-mail deja înregistrat, vă rugăm să vă autentificați',
  },
  TOKEN_TYPE_MISMATCH: {
    code: 10006,
    zh: '无效的凭据类型',
    en: 'Invalid credential type',
    pl: 'Nieprawidłowy typ poświadczeń',
    ro: 'Tip de credențiale invalid',
  },
  PASSWORD_WRONG: {
    code: 10007,
    zh: '邮箱或密码错误',
    en: 'Wrong email or password',
    pl: 'Nieprawidłowy e-mail lub hasło',
    ro: 'E-mail sau parolă incorectă',
  },
  ACCOUNT_LOCKED: {
    code: 10008,
    zh: '登录失败次数过多,请 15 分钟后重试或用验证码登录',
    en: 'Too many failed attempts, try again in 15 minutes or use code login',
    pl: 'Zbyt wiele nieudanych prób, spróbuj ponownie za 15 minut',
    ro: 'Prea multe încercări nereușite, încercați din nou în 15 minute',
  },
  PASSWORD_TOO_WEAK: {
    code: 10009,
    zh: '密码至少 8 位,包含字母和数字',
    en: 'Password must be at least 8 chars with letter and number',
    pl: 'Hasło musi mieć co najmniej 8 znaków z literą i cyfrą',
    ro: 'Parola trebuie să aibă cel puțin 8 caractere cu literă și cifră',
  },
  TOKEN_REVOKED: {
    code: 10010,
    zh: '登录已失效,请重新登录',
    en: 'Session revoked, please log in again',
    pl: 'Sesja unieważniona, zaloguj się ponownie',
    ro: 'Sesiune revocată, vă rugăm să vă autentificați din nou',
  },

  // ---------- 2xxxx device ----------
  DEVICE_NOT_ACTIVATED: {
    code: 20001,
    zh: '设备未激活,请用激活码激活',
    en: 'Device not activated',
    pl: 'Urządzenie nie jest aktywowane',
    ro: 'Dispozitivul nu este activat',
  },
  ACTIVATION_CODE_INVALID: {
    code: 20002,
    zh: '激活码无效',
    en: 'Activation code invalid',
    pl: 'Nieprawidłowy kod aktywacyjny',
    ro: 'Cod de activare invalid',
  },
  DEVICE_BOUND_TO_OTHER: {
    code: 20003,
    zh: '该设备已绑定其他账户',
    en: 'Device already bound to another account',
    pl: 'Urządzenie powiązane z innym kontem',
    ro: 'Dispozitiv deja legat de alt cont',
  },
  ACTIVATION_CODE_USED: {
    code: 20004,
    zh: '激活码已被使用',
    en: 'Activation code already used',
    pl: 'Kod aktywacyjny już użyty',
    ro: 'Cod de activare deja folosit',
  },
  DEVICE_NOT_FOUND: {
    code: 20005,
    zh: '设备不存在',
    en: 'Device not found',
    pl: 'Urządzenie nie znalezione',
    ro: 'Dispozitivul nu a fost găsit',
  },
  DEVICE_DISABLED: {
    code: 20006,
    zh: '设备已被禁用,请联系客服',
    en: 'Device disabled, contact support',
    pl: 'Urządzenie wyłączone, skontaktuj się z pomocą',
    ro: 'Dispozitiv dezactivat, contactați asistența',
  },
  DEVICE_ID_FORMAT_INVALID: {
    code: 20007,
    zh: '设备 ID 格式错误',
    en: 'Invalid deviceId format',
    pl: 'Nieprawidłowy format deviceId',
    ro: 'Format deviceId invalid',
  },
  MAX_DEVICES_REACHED: {
    code: 20008,
    zh: '账户最多绑定 4 台设备',
    en: 'Account device limit reached (max 4)',
    pl: 'Osiągnięto limit urządzeń (max 4)',
    ro: 'Limită de dispozitive atinsă (max 4)',
  },

  // ---------- 3xxxx story ----------
  STORY_GEN_FAILED: {
    code: 30001,
    zh: '故事生成失败,请重试',
    en: 'Story generation failed, please retry',
    pl: 'Generowanie historii nie powiodło się',
    ro: 'Generarea poveștii a eșuat',
  },
  IMAGE_GEN_ALL_FAILED: {
    code: 30002,
    zh: '插图生成失败,请稍后再试',
    en: 'Image generation unavailable',
    pl: 'Generowanie obrazów niedostępne',
    ro: 'Generarea imaginilor nu este disponibilă',
  },
  TTS_FAILED: {
    code: 30003,
    zh: '语音合成失败',
    en: 'TTS synthesis failed',
    pl: 'Synteza mowy nie powiodła się',
    ro: 'Sinteza vocală a eșuat',
  },
  QUOTA_EXHAUSTED: {
    code: 30004,
    zh: '故事额度用完了,订阅解锁无限故事',
    en: 'Free quota exhausted, subscribe for unlimited',
    pl: 'Wyczerpany darmowy limit, subskrybuj dla nielimitowanych',
    ro: 'Limita gratuită epuizată, abonați-vă pentru nelimitat',
  },
  DAILY_LIMIT_REACHED: {
    code: 30005,
    zh: '今天的生成次数用完了,明天再试吧',
    en: 'Daily limit reached, try again tomorrow',
    pl: 'Osiągnięto dzienny limit, spróbuj jutro',
    ro: 'Limită zilnică atinsă, încercați mâine',
  },
  CONTENT_SAFETY_BLOCKED: {
    code: 30006,
    zh: '熊熊不太明白这个故事哦,换个话题吧',
    en: "Let's try a different story",
    pl: 'Spróbujmy innej historii',
    ro: 'Să încercăm o poveste diferită',
  },
  STORY_NOT_FOUND: {
    code: 30007,
    zh: '故事不存在',
    en: 'Story not found',
    pl: 'Historia nie znaleziona',
    ro: 'Poveste negăsită',
  },
  STORY_NOT_READY: {
    code: 30008,
    zh: '故事还在生成中',
    en: 'Story still generating',
    pl: 'Historia wciąż się generuje',
    ro: 'Povestea încă se generează',
  },
  CHILD_NOT_FOUND: {
    code: 30009,
    zh: '孩子不存在',
    en: 'Child not found',
    pl: 'Dziecko nie znalezione',
    ro: 'Copil negăsit',
  },
  MAX_CHILDREN_REACHED: {
    code: 30010,
    zh: '最多添加 4 个孩子',
    en: 'Max 4 children allowed',
    pl: 'Maksymalnie 4 dzieci',
    ro: 'Maxim 4 copii permiși',
  },
  ASR_FAILED: {
    code: 30011,
    zh: '没听清楚,再说一次好吗?',
    en: 'Could not understand, please try again',
    pl: 'Nie zrozumiałem, spróbuj ponownie',
    ro: 'Nu am înțeles, încercați din nou',
  },
  DIALOGUE_ROUND_OVERFLOW: {
    code: 30012,
    zh: '对话轮次已满',
    en: 'Dialogue round limit reached',
    pl: 'Osiągnięto limit rund dialogu',
    ro: 'Limită de runde de dialog atinsă',
  },

  // ---------- 4xxxx payment ----------
  STRIPE_PAYMENT_FAILED: {
    code: 40001,
    zh: '支付失败,请检查卡信息',
    en: 'Payment failed, check card details',
    pl: 'Płatność nie powiodła się, sprawdź dane karty',
    ro: 'Plată eșuată, verificați detaliile cardului',
  },
  PAYPAL_PAYMENT_FAILED: {
    code: 40002,
    zh: 'PayPal 支付失败',
    en: 'PayPal payment failed',
    pl: 'Płatność PayPal nie powiodła się',
    ro: 'Plată PayPal eșuată',
  },
  SUBSCRIPTION_ALREADY_ACTIVE: {
    code: 40003,
    zh: '已有有效订阅',
    en: 'Active subscription exists',
    pl: 'Aktywna subskrypcja istnieje',
    ro: 'Există abonament activ',
  },
  SUBSCRIPTION_NOT_FOUND: {
    code: 40004,
    zh: '订阅不存在',
    en: 'Subscription not found',
    pl: 'Subskrypcja nie znaleziona',
    ro: 'Abonament negăsit',
  },
  PDF_QUOTA_EXHAUSTED: {
    code: 40005,
    zh: '本月 PDF 导出次数用完了',
    en: 'Monthly PDF export quota used',
    pl: 'Miesięczny limit eksportu PDF wyczerpany',
    ro: 'Cotă lunară de export PDF epuizată',
  },
  PDF_LOCKED_FOR_FREE: {
    code: 40006,
    zh: '订阅后可导出 PDF 绘本',
    en: 'Subscribe to export PDF albums',
    pl: 'Subskrybuj, aby eksportować albumy PDF',
    ro: 'Abonați-vă pentru a exporta albume PDF',
  },
  WEBHOOK_SIGNATURE_INVALID: {
    code: 40007,
    // Internal-only error, not shown to users — single language
    zh: '',
    en: 'Invalid webhook signature',
    pl: '',
    ro: '',
  },

  // ---------- 5xxxx server ----------
  INTERNAL_ERROR: {
    code: 50001,
    zh: '服务暂时不可用,请稍后重试',
    en: 'Service temporarily unavailable',
    pl: 'Usługa tymczasowo niedostępna',
    ro: 'Serviciu temporar indisponibil',
  },
  UPSTREAM_UNAVAILABLE: {
    code: 50002,
    zh: '服务暂时不可用,请稍后重试',
    en: 'Upstream service unavailable',
    pl: 'Usługa nadrzędna niedostępna',
    ro: 'Serviciu de bază indisponibil',
  },
  DB_UNAVAILABLE: {
    code: 50003,
    zh: '服务暂时不可用',
    en: 'Database unavailable',
    pl: 'Baza danych niedostępna',
    ro: 'Baza de date indisponibilă',
  },
  REDIS_UNAVAILABLE: {
    code: 50004,
    zh: '服务暂时不可用',
    en: 'Redis unavailable',
    pl: 'Redis niedostępny',
    ro: 'Redis indisponibil',
  },
  EMAIL_SEND_FAILED: {
    code: 50005,
    zh: '邮件发送失败,请稍后重试',
    en: 'Email send failed',
    pl: 'Wysyłanie e-maila nie powiodło się',
    ro: 'Trimiterea e-mailului a eșuat',
  },

  // ---------- 9xxxx client ----------
  // Per §1.2: 9xxxx errors return only `message` in English (no per-locale).
  // We still populate all 4 fields for consistency, but routes typically
  // pass `localeOverride: 'en'` when raising 9xxxx errors.
  PARAM_MISSING: {
    code: 90001,
    zh: '参数缺失',
    en: 'Missing parameter',
    pl: 'Brak parametru',
    ro: 'Parametru lipsă',
  },
  PARAM_INVALID: {
    code: 90002,
    zh: '参数格式错误',
    en: 'Invalid parameter',
    pl: 'Nieprawidłowy parametr',
    ro: 'Parametru invalid',
  },
  RATE_LIMITED: {
    code: 90003,
    zh: '请求太频繁了,请稍后再试',
    en: 'Rate limit exceeded',
    pl: 'Przekroczono limit żądań',
    ro: 'Limită de cereri depășită',
  },
  IDEMPOTENCY_CONFLICT: {
    code: 90004,
    zh: '操作冲突,请重试',
    en: 'Idempotency conflict',
    pl: 'Konflikt idempotencji',
    ro: 'Conflict de idempotență',
  },
  METHOD_NOT_ALLOWED: {
    code: 90005,
    zh: '请求方法不允许',
    en: 'Method not allowed',
    pl: 'Metoda niedozwolona',
    ro: 'Metodă nepermisă',
  },
};

// Numeric → entry lookup, built once
const byCode = {};
for (const [name, entry] of Object.entries(codes)) {
  byCode[entry.code] = { ...entry, name };
}

/**
 * Get the localized message for a code.
 * Falls back to English if the locale doesn't have a translation.
 * Falls back to a generic "Unknown error" if the code itself is unknown.
 */
export function getMessage(code, locale = 'en') {
  const entry = byCode[code];
  if (!entry) return 'Unknown error';
  return entry[locale] || entry.en || 'Error';
}

/**
 * Build the multi-language message bundle for an error response.
 * Per §1.2 the response includes message (in requested locale),
 * messageEn, messagePl, messageRo.
 */
export function getMessageBundle(code, locale = 'en') {
  const entry = byCode[code];
  if (!entry) {
    return {
      message: 'Unknown error',
      messageEn: 'Unknown error',
      messagePl: 'Unknown error',
      messageRo: 'Unknown error',
    };
  }
  return {
    message: entry[locale] || entry.en,
    messageEn: entry.en,
    messagePl: entry.pl || entry.en,
    messageRo: entry.ro || entry.en,
  };
}

/** Get the constant name (for logs) given a numeric code. */
export function getName(code) {
  return byCode[code]?.name ?? `UNKNOWN_${code}`;
}

/** Map of constant name → numeric code, for ergonomic throwing. */
export const ErrorCodes = Object.fromEntries(
  Object.entries(codes).map(([name, entry]) => [name, entry.code]),
);

export default ErrorCodes;

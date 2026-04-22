import type { Locale } from '@/types';

/**
 * API 基础路径
 *
 * ⚠️ 对齐 API_CONTRACT v1.0 §1.1:
 *   Dev: http://localhost:3000(不含 /api)
 *   Prod: https://api.wonderbear.app(不含 /api)
 *   所有接口路径自带 /api 前缀,例如 POST /api/auth/send-code
 *
 * 开发模式:走 Vite proxy(空字符串让 axios 用相对路径 /api/xxx,代理到 localhost:3000)
 * 生产模式:拼完整域名
 */
export const API_BASE = import.meta.env.DEV
  ? ''
  : import.meta.env.VITE_API_BASE_URL || 'https://api.wonderbear.app';

/** 是否启用 mock 数据 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

/**
 * 资源基址(素材对接文档 §一)
 * dev:本地 /assets
 * prod:CDN
 */
export const ASSETS_BASE = import.meta.env.PROD
  ? 'https://assets.wonderbear.app/static'
  : '/assets';

/** 支持的语言列表 */
export const SUPPORTED_LOCALES: { value: Locale; label: string; flag: string }[] = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'pl', label: 'Polski', flag: '🇵🇱' },
  { value: 'ro', label: 'Română', flag: '🇷🇴' },
  { value: 'zh', label: '中文', flag: '🇨🇳' },
];

/** 默认语言 */
export const DEFAULT_LOCALE: Locale = (import.meta.env.VITE_DEFAULT_LOCALE as Locale) || 'en';

/** localStorage keys */
export const STORAGE_KEYS = {
  TOKEN: 'wb_parent_token',
  PARENT: 'wb_parent',
  LOCALE: 'wb_locale',
  REMEMBER_ME: 'wb_remember',
  LAST_EMAIL: 'wb_last_email',
  DEVICE_CTX: 'wb_device_ctx',
} as const;

/** 验证码(API_CONTRACT §4.1) */
export const CODE_COOLDOWN = 60; // 下次可重发秒数
export const CODE_EXPIRES = 300; // 验证码有效期 5 分钟
export const CODE_LENGTH = 6;

/** 邮箱正则 */
export const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * 密码规则(API_CONTRACT §10009):
 * - ≥ 8 位
 * - 必须含字母和数字
 */
export const PASSWORD_MIN_LEN = 8;
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/** 孩子业务常量(API_CONTRACT §30010 + §6.4 maxAllowed) */
export const CHILD_MAX = 4;
export const CHILD_AGE_MIN = 3;
export const CHILD_AGE_MAX = 8;
export const CHILD_NAME_MAX = 20;

/** 设备业务常量(API_CONTRACT §20008) */
export const DEVICE_MAX_PER_PARENT = 4;

/**
 * 订阅套餐价格(用分/cents 存,对齐 §1.7 字段约定)
 * 展示时 / 100 得欧元值
 */
export const PLAN_PRICES = {
  monthly: { amountCents: 499, currency: 'EUR', symbol: '€' },
  yearly: { amountCents: 3999, currency: 'EUR', symbol: '€' },
} as const;

/** PDF 轮询(API_CONTRACT §14.1) */
export const PDF_POLL_INTERVAL_MS = 3000;
export const PDF_POLL_TIMEOUT_MS = 60_000;

/** 订阅状态轮询(支付回调后等 webhook,最长 3 分钟) */
export const SUBSCRIPTION_POLL_INTERVAL_MS = 3000;
export const SUBSCRIPTION_POLL_TIMEOUT_MS = 180_000;

/** 故事生成状态轮询(TV 端用,H5 也可能预览时用) */
export const STORY_POLL_INTERVAL_MS = 2000;

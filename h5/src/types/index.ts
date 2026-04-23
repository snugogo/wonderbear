/**
 * 类型定义 · 严格对齐 API_CONTRACT v1.0 §十三 类型别名总表
 *
 * 原则:后端定义了的 type,H5 不另起炉灶。
 */

// ==========================================
// 基础
// ==========================================

export type Locale = 'zh' | 'en' | 'pl' | 'ro';
export type CodePurpose = 'register' | 'login';

// ==========================================
// API 响应(§1.2)
// ==========================================

/** 错误响应附带的动作(§1.2 Action) */
export interface ErrorAction {
  label: string;
  labelEn: string;
  labelPl?: string;
  labelRo?: string;
  url: string;
  kind?: 'primary' | 'secondary' | 'danger';
}

/** 统一响应格式 */
export interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  message?: string;
  messageEn?: string;
  messagePl?: string;
  messageRo?: string;
  requestId: string;
  details?: Record<string, unknown>;
  actions?: ErrorAction[];
}

/** cursor 分页响应(§1.8) */
export interface PaginatedData<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

// ==========================================
// 状态机(§十三)
// ==========================================

export type DeviceStatus =
  | 'registered'
  | 'activated_unbound'
  | 'bound'
  | 'unbound_transferable'
  | 'disabled';

export type SubscriptionPlan = 'free' | 'monthly' | 'yearly';
export type SubscriptionStatus = 'free' | 'active' | 'canceled' | 'expired' | 'past_due';

export type ActivationCodeStatus = 'issued' | 'activated' | 'transferred' | 'revoked';

export type StoryStatus = 'queued' | 'generating' | 'completed' | 'failed';

export type GenerationStage = 'queue' | 'llm' | 'image' | 'tts' | 'assembly' | 'done';

// ==========================================
// 业务实体(§十三)
// ==========================================

/** 订阅摘要(login / parent/me 带回) */
export interface SubscriptionSummary {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  expiresAt: string | null;
  pdfExportsLeft: number;
}

/** 家长(完整版,/api/parent/me) */
export interface Parent {
  id: string;
  email: string;
  locale: Locale;
  activated: boolean;
  playBgm: boolean;
  createdAt: string;
  subscription: SubscriptionSummary | null;
  devicesCount: number;
  childrenCount: number;
}

/** 孩子 */
export interface Child {
  id: string;
  parentId: string;
  name: string;
  age: number;
  gender: 'male' | 'female' | 'prefer_not_say' | null;
  avatar: string;
  primaryLang: Locale;
  secondLang: Locale | 'none';
  birthday: string | null;
  coins: number;
  voiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 设备摘要(/api/device/list) */
export interface DeviceSummary {
  id: string;
  deviceId: string;
  status: DeviceStatus;
  boundAt: string;
  lastSeenAt: string | null;
  storiesLeft: number;
  model: string;
  firmwareVer: string;
  online: boolean;
}

/** 设备(注册 / 绑定返回) */
export interface Device {
  id: string;
  deviceId: string;
  status: DeviceStatus;
  boundAt: string;
  storiesLeft: number;
}

/** 订阅完整状态(/api/subscription/status,平铺,不包 { subscription }) */
export interface SubscriptionStatusData {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  provider: 'stripe' | 'paypal' | null;
  expiresAt: string | null;
  pdfExportsLeft: number;
  pdfExportsResetAt: string | null;
  stripeCustomerId?: string | null;
  paypalSubId?: string | null;
  cancelAtPeriodEnd: boolean;
}

/** 故事列表项 */
export interface StorySummary {
  id: string;
  title: string;
  coverUrl: string;
  createdAt: string;
  playCount: number;
  favorited: boolean;
  primaryLang: Locale;
  downloaded?: boolean;
}

/**
 * 对话摘要(结构化 object)
 *
 * 对齐权威:
 *   - TV tv-html/src/services/api.ts 的 `DialogueSummary`(0c7f8bc)
 *   - server-v7/docs/spec/API_ACTUAL_FORMAT.md §批次 4 §7.6
 *
 * 字段含义:主角 / 场景 / 冲突(故事三要素)。
 * UI 要展示"一句话摘要"时,由 view 层按需把三字段拼成字符串。
 */
export interface DialogueSummary {
  mainCharacter: string;
  scene: string;
  conflict: string;
}

/** 故事完整对象(对齐 API_ACTUAL_FORMAT 批次 4 §7.6 + TV 0c7f8bc) */
export interface Story {
  id: string;
  childId: string;
  title: string;
  titleLearning?: string | null;
  coverUrl: string;
  coverUrlHd?: string;
  pages: StoryPage[];
  /**
   * `summary` 是结构化的 DialogueSummary 对象,**不是**预拼好的字符串。
   * 需要一句话展示的 view 要自己组装,参考 §7.6。
   */
  dialogue: {
    summary: DialogueSummary;
    rounds: Array<{ q: string; a: string }>;
  };
  /**
   * `metadata` 只有 `primaryLang / learningLang / provider` 稳定必填;
   * `duration` / `createdAt` 在 mock 路径下不发,故为可选。
   * `provider` 含 `'mock'`(dev 未配 LLM / 生图 / TTS key 时)。
   */
  metadata: {
    primaryLang: Locale;
    learningLang: Locale | 'none';
    provider: 'openai' | 'gemini' | 'fal' | 'mixed' | 'mock';
    duration?: number;
    createdAt?: string;
  };
  status: 'completed';
  isPublic: boolean;
  favorited: boolean;
  playCount: number;
  downloaded?: boolean;
  /** 顶层 `createdAt`(§7.6)。H5 所有时间展示以此为准,不读 metadata.createdAt。 */
  createdAt: string;
  /** 状态到 `completed` 时置时间戳,仍在生成则为 null。 */
  completedAt?: string | null;
}

export interface StoryPage {
  pageNum: number;
  imageUrl: string;
  imageUrlHd: string;
  text: string;
  textLearning?: string | null;
  ttsUrl?: string | null;
  ttsUrlLearning?: string | null;
  durationMs?: number | null;
}

/** PDF 任务状态(§10.2) */
export interface PdfTaskStatus {
  taskId: string;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  progress: number;
  downloadUrl?: string | null;
  expiresAt?: string | null;
  error?: { code: number; message: string } | null;
}

// ==========================================
// 请求 / 响应(认证)
// ==========================================

export interface SendCodeResp {
  expiresIn: number;
  nextRetryAfter: number;
}

/**
 * 注册响应(§4.2 / 批次 2 实际)
 * 批次 2 的 /api/auth/register 只建 Parent,device 始终为 null,
 * H5 拿到 parentToken 后必须再调 /api/device/bind(批次 3)完成真正绑定 + 发放 6 本额度。
 * 参考:server-v7/docs/spec/API_ACTUAL_FORMAT.md 4.2
 */
export interface RegisterResp {
  parentToken: string;
  parent: {
    id: string;
    email: string;
    locale: Locale;
    createdAt: string;
    activated: boolean;
  };
  device: Device | null;
  tokenExpiresAt: string;
}

/**
 * 登录响应(§4.3 + 4.4 / 批次 2 实际)
 * 参考:server-v7/docs/spec/API_ACTUAL_FORMAT.md 4.3 / 4.4
 */
export interface LoginResp {
  parentToken: string;
  parent: {
    id: string;
    email: string;
    locale: Locale;
    activated: boolean;
    subscription: SubscriptionSummary | null;
  };
  tokenExpiresAt: string;
}

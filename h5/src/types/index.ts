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

/** 故事完整对象 */
export interface Story {
  id: string;
  childId: string;
  title: string;
  titleLearning?: string | null;
  coverUrl: string;
  coverUrlHd?: string;
  pages: StoryPage[];
  dialogue: {
    summary: string;
    rounds: Array<{ q: string; a: string }>;
  };
  metadata: {
    primaryLang: Locale;
    learningLang: Locale | 'none';
    duration: number;
    provider: 'openai' | 'gemini' | 'fal' | 'mixed';
    createdAt: string;
  };
  status: 'completed';
  isPublic: boolean;
  favorited: boolean;
  playCount: number;
  downloaded?: boolean;
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

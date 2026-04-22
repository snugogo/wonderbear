import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { showToast } from 'vant';
import { API_BASE, USE_MOCK, STORAGE_KEYS } from '@/config';
import type { ApiResponse, ErrorAction, Locale } from '@/types';
import { storage } from '@/utils/storage';
import { mockHandle } from './mock';
import { i18n } from '@/i18n';

/**
 * 业务异常(code !== 0)
 *
 * 按 API_CONTRACT §1.2:
 * - 保留 localizedMessage(当前 locale 挑好的文案)
 * - 保留原始 actions(含多语言 label),view 层可按 locale 挑对应 label
 */
export class BusinessError extends Error {
  code: number;
  requestId?: string;
  details?: Record<string, unknown>;
  actions?: ErrorAction[];
  localizedMessage: string;

  constructor(
    code: number,
    localizedMessage: string,
    requestId?: string,
    details?: Record<string, unknown>,
    actions?: ErrorAction[]
  ) {
    super(localizedMessage);
    this.code = code;
    this.localizedMessage = localizedMessage;
    this.requestId = requestId;
    this.details = details;
    this.actions = actions;
  }
}

/** 按当前 locale 挑 message(§1.2 三种情况) */
function pickMessage(body: ApiResponse, locale: Locale): string {
  if (locale === 'en' && body.messageEn) return body.messageEn;
  if (locale === 'pl' && body.messagePl) return body.messagePl;
  if (locale === 'ro' && body.messageRo) return body.messageRo;
  return body.message || body.messageEn || '';
}

/** 按当前 locale 挑 action label */
export function pickActionLabel(action: ErrorAction, locale: Locale): string {
  if (locale === 'en') return action.labelEn;
  if (locale === 'pl' && action.labelPl) return action.labelPl;
  if (locale === 'ro' && action.labelRo) return action.labelRo;
  return action.label;
}

const instance: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ---------- 请求拦截器 ----------
instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = storage.get<string>(STORAGE_KEYS.TOKEN);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  const locale = i18n.global.locale.value;
  if (locale && config.headers) {
    config.headers['Accept-Language'] = String(locale);
  }
  return config;
});

// ---------- 401 刷新重试(单飞) ----------
let refreshingPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (!refreshingPromise) {
    refreshingPromise = (async () => {
      try {
        const resp = await axios.post<ApiResponse<{ parentToken: string; expiresAt: string }>>(
          `${API_BASE}/api/auth/refresh`,
          null,
          {
            headers: {
              Authorization: `Bearer ${storage.get<string>(STORAGE_KEYS.TOKEN) || ''}`,
            },
            timeout: 10_000,
          }
        );
        const body = resp.data;
        if (body.code === 0 && body.data?.parentToken) {
          storage.set(STORAGE_KEYS.TOKEN, body.data.parentToken);
          return body.data.parentToken;
        }
      } catch {
        /* ignore */
      }
      return null;
    })().finally(() => {
      // 清空必须在 promise 真正 resolve 之后,避免后续请求沿用旧 promise
      refreshingPromise = null;
    });
  }
  return refreshingPromise;
}

// ---------- 响应拦截器 ----------
instance.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse;
    if (!body || typeof body.code !== 'number') return response;
    if (body.code === 0) return response;

    const locale = i18n.global.locale.value as Locale;
    throw new BusinessError(
      body.code,
      pickMessage(body, locale) || 'Business error',
      body.requestId,
      body.details,
      body.actions
    );
  },
  async (error) => {
    if (error instanceof BusinessError) throw error;

    const t = i18n.global.t;
    const status = error.response?.status;
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (status === 401 && original && !original._retried) {
      original._retried = true;
      const newToken = await tryRefresh();
      if (newToken) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return instance.request(original);
      }
      storage.remove(STORAGE_KEYS.TOKEN);
      storage.remove(STORAGE_KEYS.PARENT);
    }

    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      showToast(t('common.networkError'));
    } else if (!error.response) {
      showToast(t('common.networkError'));
    } else {
      showToast(t('common.serverError'));
    }
    throw error;
  }
);

// ---------- 核心 request(带 mock 分流) ----------
async function request<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  if (USE_MOCK) {
    const method = (config.method || 'GET').toUpperCase();
    const url = config.url || '';
    const payload = (config.data || config.params || {}) as Record<string, unknown>;
    const mocked = await mockHandle(method, url, payload);
    if (mocked) {
      if (mocked.code === 0) return mocked.data as T;
      const locale = i18n.global.locale.value as Locale;
      throw new BusinessError(
        mocked.code,
        pickMessage(mocked, locale) || 'Mock business error',
        mocked.requestId,
        mocked.details,
        mocked.actions
      );
    }
    // mock 开启但未命中 → 开发期直接抛明确错误,避免静默走真请求导致的网络报错误导
    // eslint-disable-next-line no-console
    console.error(`[Mock] 未命中 ${method} ${url} —— 请在 src/api/mock.ts 补 route,或关闭 VITE_USE_MOCK`);
    throw new BusinessError(
      99999,
      `Mock route not found: ${method} ${url}`,
      'req_mock_miss'
    );
  }

  const res = await instance.request<ApiResponse<T>>(config);
  const body = res.data;
  return body.data as T;
}

export const http = {
  get<T = unknown>(url: string, params?: Record<string, unknown>, config?: AxiosRequestConfig) {
    return request<T>({ ...config, method: 'GET', url, params });
  },
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return request<T>({ ...config, method: 'POST', url, data });
  },
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return request<T>({ ...config, method: 'PATCH', url, data });
  },
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return request<T>({ ...config, method: 'PUT', url, data });
  },
  delete<T = unknown>(url: string, config?: AxiosRequestConfig) {
    return request<T>({ ...config, method: 'DELETE', url });
  },
};

export default http;

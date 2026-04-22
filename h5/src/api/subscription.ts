import { http } from './http';
import type { Locale, SubscriptionStatusData } from '@/types';

/**
 * 订阅模块(API_CONTRACT v1.0 §九)
 *
 * Stripe:用 Checkout 托管页(H5_HANDOFF 强制,香港 entity 收欧盟用户 3DS 兜底)
 * PayPal:approvalUrl 直接 window.location 跳转
 * Portal:让用户自助管理已有订阅
 */
export const subscriptionApi = {
  /** 9.1 查询订阅状态(平铺对象,不包 { subscription })*/
  status() {
    return http.get<SubscriptionStatusData>('/api/subscription/status');
  },

  /** 9.2 发起 Stripe Checkout */
  stripeCreate(params: {
    plan: 'monthly' | 'yearly';
    successUrl: string;
    cancelUrl: string;
    locale: Locale;
  }) {
    return http.post<{ sessionId: string; url: string }>(
      '/api/subscription/stripe/create',
      params
    );
  },

  /** 9.3 发起 PayPal 订阅 */
  paypalCreate(params: { plan: 'monthly' | 'yearly'; returnUrl: string; cancelUrl: string }) {
    return http.post<{ approvalUrl: string; subscriptionId: string }>(
      '/api/subscription/paypal/create',
      params
    );
  },

  /** 9.4 取消订阅(期末生效,权益保留到 expiresAt) */
  cancel(params?: { reason?: string; immediately?: boolean }) {
    return http.post<{
      status: 'canceled';
      expiresAt: string;
      cancelAtPeriodEnd: true;
    }>('/api/subscription/cancel', params || {});
  },

  /** 9.7 生成 Stripe Customer Portal 链接(自助管理订阅) */
  portalSession(params: { returnUrl: string }) {
    return http.post<{ url: string; expiresAt: string }>(
      '/api/stripe/portal-session',
      params
    );
  },
};

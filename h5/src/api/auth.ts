import { http } from './http';
import type { CodePurpose, Locale, LoginResp, RegisterResp, SendCodeResp } from '@/types';

/**
 * 认证模块(API_CONTRACT v1.0 §四)
 * 路径前缀 /api,对齐 §1.1
 */
export const authApi = {
  /** 4.1 发送邮箱验证码 */
  sendCode(params: { email: string; purpose: CodePurpose; locale: Locale }) {
    return http.post<SendCodeResp>('/api/auth/send-code', params);
  },

  /**
   * 4.2 注册家长账户
   * 批次 2 约束:只建 Parent,device 始终为 null(后续 H5 主动调 /api/device/bind)。
   * deviceId / activationCode 仍建议传,服务端做类型校验。
   */
  register(params: {
    email: string;
    code: string;
    password?: string | null;
    deviceId: string;
    activationCode: string;
    locale: Locale;
  }) {
    return http.post<RegisterResp>('/api/auth/register', params);
  },

  /** 4.3 登录(验证码)*/
  loginByCode(params: { email: string; code: string }) {
    return http.post<LoginResp>('/api/auth/login-code', params);
  },

  /** 4.4 登录(密码)*/
  loginByPassword(params: { email: string; password: string }) {
    return http.post<LoginResp>('/api/auth/login-password', params);
  },

  /** 4.5 刷新 Token */
  refresh() {
    return http.post<{ parentToken: string; expiresAt: string }>('/api/auth/refresh');
  },

  /** 4.6 登出 */
  logout() {
    return http.post<null>('/api/auth/logout');
  },
};

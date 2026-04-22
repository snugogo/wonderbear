import { http } from './http';
import type { Child, DeviceSummary, Locale, Parent } from '@/types';

/**
 * 家长档案模块(API_CONTRACT v1.0 §六 bis)
 *
 * /api/parent/me 是登录后首页的一站式接口,一次拿齐 parent + devices + children,
 * 比分别调 /device/list + /child/list 少一次 RTT
 */
export const parentApi = {
  /** 6bis.1 获取当前家长的完整信息 */
  me() {
    return http.get<{
      parent: Parent;
      devices: DeviceSummary[];
      children: Child[];
    }>('/api/parent/me');
  },

  /** 6bis.2 修改家长设置(仅传要改的字段) */
  update(
    patch: Partial<{
      locale: Locale;
      playBgm: boolean;
      password: string;
      currentPassword: string;
    }>
  ) {
    return http.patch<{ parent: Parent }>('/api/parent/me', patch);
  },
};

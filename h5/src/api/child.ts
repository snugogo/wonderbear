import { http } from './http';
import type { Child, Locale } from '@/types';

/**
 * 孩子档案模块(API_CONTRACT v1.0 §六)
 */
export const childApi = {
  /** 6.1 创建孩子 */
  create(params: {
    name: string;
    age: number;
    gender?: 'male' | 'female' | 'prefer_not_say' | null;
    avatar: string;
    primaryLang: Locale;
    secondLang?: Locale | 'none';
    birthday?: string | null;
  }) {
    return http.post<{ child: Child }>('/api/child', params);
  },

  /** 6.2 更新孩子 */
  update(
    id: string,
    patch: Partial<{
      name: string;
      age: number;
      gender: 'male' | 'female' | 'prefer_not_say' | null;
      avatar: string;
      primaryLang: Locale;
      secondLang: Locale | 'none';
      birthday: string | null;
    }>
  ) {
    return http.patch<{ child: Child }>(`/api/child/${id}`, patch);
  },

  /** 6.3 删除孩子(软删除) */
  remove(id: string) {
    return http.delete<{ deleted: true }>(`/api/child/${id}`);
  },

  /** 6.4 列出所有孩子 */
  list() {
    return http.get<{ items: Child[]; total: number; maxAllowed: 4 }>('/api/child/list');
  },

  /** 6.5 单个孩子详情 */
  get(id: string) {
    return http.get<{ child: Child; storiesCount: number; lastStoryAt: string | null }>(
      `/api/child/${id}`
    );
  },
};

import { http } from './http';
import type { Story, StorySummary } from '@/types';

/**
 * 故事模块 - H5 相关(API_CONTRACT v1.0 §七)
 * H5 只负责浏览 / 预览 / 收藏 / 删除,生成链路在 TV 端
 */
export const storyApi = {
  /** 7.6 获取完整故事(用于 12 页预览) */
  get(id: string) {
    return http.get<{ story: Story }>(`/api/story/${id}`);
  },

  /** 7.7 列出孩子的故事(cursor 分页) */
  list(params: {
    childId?: string;
    cursor?: string;
    limit?: number;
    sort?: 'newest' | 'most_played' | 'favorited';
    onlyFavorited?: boolean;
  }) {
    return http.get<{ items: StorySummary[]; nextCursor: string | null; total: number }>(
      '/api/story/list',
      params as Record<string, unknown>
    );
  },

  /** 7.8 收藏 / 取消收藏 */
  favorite(id: string, favorited: boolean) {
    return http.post<{ storyId: string; favorited: boolean }>(`/api/story/${id}/favorite`, {
      favorited,
    });
  },

  /** 7.9 删除 */
  remove(id: string) {
    return http.delete<{ deleted: true }>(`/api/story/${id}`);
  },
};

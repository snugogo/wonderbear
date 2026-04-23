import { http } from './http';
import type {
  StoryDeleteResp,
  StoryDetailResp,
  StoryFavoriteResp,
  StoryListQuery,
  StoryListResp,
} from '@/types';

/**
 * 故事模块 - H5 只读侧(API_CONTRACT v1.0 §七 / API_ACTUAL_FORMAT §批次 4)
 *
 * H5 只负责浏览 / 预览 / 收藏 / 删除;
 * 生成链路(dialogue/start、dialogue/turn、story/generate、story/:id/status、play-stat)
 * 全部在 TV 端,H5 **不**暴露。
 *
 * 响应 / 请求 shape 对齐:
 *   - server-v7/docs/spec/API_ACTUAL_FORMAT.md §7.6 / §7.7 / §7.8 / §7.9
 *   - tv-html/src/services/api.ts(commit 0c7f8bc)— 跨端命名一致
 */
export const storyApi = {
  /** §7.6 获取完整故事(12 页预览) */
  get(id: string) {
    return http.get<StoryDetailResp>(`/api/story/${id}`);
  },

  /**
   * §7.7 列出故事(cursor 分页)
   *
   * 用法:
   *   - 首屏:`list()` 或 `list({ sort: 'newest' })` 取前 20 条
   *   - 下一页:把上一次响应的 `nextCursor` 传进来
   *   - 收藏筛选:`list({ onlyFavorited: true })`
   */
  list(query?: StoryListQuery) {
    return http.get<StoryListResp>(
      '/api/story/list',
      query as Record<string, unknown> | undefined
    );
  },

  /** §7.8 收藏 / 取消收藏(`favorited: true/false`) */
  favorite(id: string, favorited: boolean) {
    return http.post<StoryFavoriteResp>(`/api/story/${id}/favorite`, { favorited });
  },

  /** §7.9 删除故事(不可撤销) */
  remove(id: string) {
    return http.delete<StoryDeleteResp>(`/api/story/${id}`);
  },
};

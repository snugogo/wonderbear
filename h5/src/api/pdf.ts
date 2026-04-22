import { http } from './http';
import type { PdfTaskStatus } from '@/types';

/**
 * PDF 绘本导出(API_CONTRACT v1.0 §十)
 *
 * 流程:generate → 每 3s 轮询 status → completed 后用 downloadUrl 直接下载
 */
export const pdfApi = {
  /** 10.1 发起 PDF 任务 */
  generate(params: {
    storyIds: string[];
    includeCover?: boolean;
    language: 'primary' | 'learning' | 'both';
  }) {
    return http.post<{
      taskId: string;
      status: 'queued';
      estimatedDurationSec: number;
    }>('/api/pdf/generate', { includeCover: true, ...params });
  },

  /** 10.2 查询任务状态(轮询) */
  status(taskId: string) {
    return http.get<PdfTaskStatus>(`/api/pdf/${taskId}/status`);
  },

  /** 10.3 直接下载入口(服务端会 302 到 CDN 签名 URL) */
  downloadUrl(taskId: string): string {
    // 不通过 axios 走:签名 URL 里要用 Cookie/Token 鉴权,直接返回拼好的 URL,
    // view 层用 <a :href> download 或 window.open
    return `/api/pdf/${taskId}/download`;
  },
};

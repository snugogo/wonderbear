import { showDialog, showToast } from 'vant';
import { BusinessError } from '@/api/http';
import { i18n } from '@/i18n';

/**
 * 按 H5_HANDOFF §UI 要点:
 * - 带 actions 的错误 → Dialog(给用户按钮跳转)
 * - 其他 → Toast
 * - 文案优先用后端本地化好的 localizedMessage,否则退回 errors.{code}
 */

function resolveMessage(e: unknown): string {
  const t = i18n.global.t;
  if (e instanceof BusinessError) {
    if (e.localizedMessage) return e.localizedMessage;
    const key = `errors.${e.code}`;
    if (i18n.global.te(key)) return t(key);
    return t('common.failed');
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

export function useApiError() {
  /** 只取文案,由 view 决定怎么用 */
  function format(e: unknown): string {
    return resolveMessage(e);
  }

  /**
   * 展示错误(按 actions 自动选 Toast / Dialog)
   * @returns Dialog 确认时返回被选中的 action,Toast 时返回 null
   */
  async function show(e: unknown): Promise<import('@/types').ErrorAction | null> {
    const msg = resolveMessage(e);

    if (e instanceof BusinessError && e.actions && e.actions.length > 0) {
      // 只取第一个 action 做主按钮(文档示例都是单动作)
      const action = e.actions[0];
      try {
        await showDialog({
          title: i18n.global.t('common.failed'),
          message: msg,
          confirmButtonText: action.label,
          showCancelButton: true,
        });
        return action;
      } catch {
        return null;
      }
    }

    showToast(msg);
    return null;
  }

  return { format, show };
}

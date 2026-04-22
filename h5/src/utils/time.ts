import { i18n } from '@/i18n';

/**
 * 相对时间格式化(轻量,不引 dayjs.relativeTime,够用就行)
 * 输入 ISO 字符串,输出本地化文案
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = i18n.global.t;
  const past = new Date(iso).getTime();
  if (!Number.isFinite(past)) return '';
  const diffSec = Math.max(0, (Date.now() - past) / 1000);

  if (diffSec < 60) return t('common2.justNow');
  if (diffSec < 3600) return t('common2.minutesAgo', { n: Math.floor(diffSec / 60) });
  if (diffSec < 86400) return t('common2.hoursAgo', { n: Math.floor(diffSec / 3600) });
  if (diffSec < 86400 * 2) return t('common2.yesterday');
  return t('common2.daysAgo', { n: Math.floor(diffSec / 86400) });
}

/** 简单日期格式化 YYYY-MM-DD */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

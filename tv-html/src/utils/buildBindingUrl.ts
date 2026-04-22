/**
 * Build TV → H5 binding URL.
 * MUST match TO_TV_hash_route.md (v2) exactly:
 *   https://h5.wonderbear.app/#/register?device=<deviceId>&code=<activationCode>
 *
 * - hash mode (`/#/register`) — H5 uses createWebHashHistory
 * - URL params are short names `device` and `code` (NOT deviceId/activationCode)
 * - base from oem.h5BaseUrl, fallback to https://h5.wonderbear.app
 */

import type { OemConfig } from '@/services/api';

const DEFAULT_H5_BASE = 'https://h5.wonderbear.app';

export function buildBindingUrl(
  deviceId: string,
  activationCode: string,
  oem: OemConfig | null,
): string {
  const base = (oem?.h5BaseUrl || DEFAULT_H5_BASE).replace(/\/$/, '');
  const params = new URLSearchParams({
    device: deviceId,
    code: activationCode,
  });
  // Hash sentinel is mandatory — H5 uses createWebHashHistory.
  return `${base}/#/register?${params.toString()}`;
}

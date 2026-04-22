/**
 * CDN asset URL helper.
 *
 * Source CDN (jsDelivr-fronted GitHub):
 *   https://cdn.jsdelivr.net/gh/snugogo/wonderbear@main/assets
 *
 * Asset layout (96 webp files, organized by group):
 *   /assets/avatar/avatar_*.webp     (17)
 *   /assets/bear/bear_*.webp         (32)
 *   /assets/bg/bg_*.webp             (9)
 *   /assets/deco/deco_*.webp         (9)
 *   /assets/h5/h5_*.webp             (10)  — H5 only, TV should not load
 *   /assets/icon/app_icon_master.webp (1)
 *   /assets/story/story_generic_*.webp (3) — generation-failed fallbacks
 *   /assets/ui/ui_*.webp             (15)
 *
 * Usage:
 *   <img :src="asset('bear/bear_paint.webp')">
 *   <img :src="asset('ui/ui_mic.webp')">
 *
 * To switch to OEM custom CDN later, only this file changes.
 */

const DEFAULT_CDN_BASE = 'https://cdn.jsdelivr.net/gh/snugogo/wonderbear@main/assets';

let activeBase = DEFAULT_CDN_BASE;

/**
 * Build a full URL for a CDN asset.
 * @param relativePath e.g. 'bear/bear_paint.webp'
 */
export function asset(relativePath: string): string {
  // Strip leading slash if caller passed '/bear/foo.webp'
  const clean = relativePath.replace(/^\/+/, '');
  return `${activeBase}/${clean}`;
}

/**
 * Override the CDN base URL — used when OEM provides a self-hosted mirror,
 * or when DeviceInfo.assetsBaseUrl is non-empty (set by Shell at boot).
 * Pass null/empty to reset to default.
 */
export function setAssetBase(url: string | null | undefined): void {
  if (!url || url.trim() === '') {
    activeBase = DEFAULT_CDN_BASE;
    return;
  }
  // Trim trailing slash for consistent join
  activeBase = url.replace(/\/+$/, '');
}

export function getAssetBase(): string {
  return activeBase;
}

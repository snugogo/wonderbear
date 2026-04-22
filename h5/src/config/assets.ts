import { ASSETS_BASE } from './index';

/**
 * WonderBear 视觉素材清单
 *
 * 对齐 WonderBear_素材对接文档_前端版 v7
 * 开发期图还没生成,view 层只引用 key,图片到位后只需把文件放到
 * public/assets/<folder>/<stem>.webp 即可显示(dev),上线时切 CDN 自动生效
 *
 * 用法:
 *   import { asset } from '@/config/assets';
 *   <img :src="asset('bear.idle')" />
 */

type AssetFolder =
  | 'bear'
  | 'bg'
  | 'story'
  | 'ui'
  | 'deco'
  | 'avatar'
  | 'h5'
  | 'icon'
  | 'marketing';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = {
  // ---- 小熊角色(家长 H5 主要用到其中几张) ----
  bear: {
    folder: 'bear' as AssetFolder,
    ext: 'webp',
    items: {
      idle: 'bear_idle',
      welcome: 'bear_welcome',
      wave: 'bear_wave',
      read: 'bear_read',
      paint: 'bear_paint',
      cheer: 'bear_cheer',
      sleep: 'bear_sleep',
      happy: 'bear_happy',
      confused: 'bear_confused',
      errorOops: 'bear_error_oops',
      noNetwork: 'bear_no_network',
      emptyBox: 'bear_empty_box',
      qrPeek: 'bear_qr_peek',
      poland: 'bear_poland',
      romania: 'bear_romania',
    },
  },

  // ---- 背景(H5 一般不用,但保留索引) ----
  bg: {
    folder: 'bg' as AssetFolder,
    ext: 'webp',
    items: {
      room: 'bg_room',
      bedtime: 'bg_bedtime',
      meadow: 'bg_meadow',
      welcome: 'bg_welcome',
      welcomeFull: 'bg_welcome_fullscreen',
    },
  },

  // ---- 头像(20 种:12 小熊变体 + 5 动物,文档上写 17 张,取 17 张) ----
  avatar: {
    folder: 'avatar' as AssetFolder,
    ext: 'webp',
    items: {
      bearClassic: 'avatar_bear_classic',
      bearPink: 'avatar_bear_pink',
      bearBlue: 'avatar_bear_blue',
      bearMint: 'avatar_bear_mint',
      bearDoctor: 'avatar_bear_doctor',
      bearPilot: 'avatar_bear_pilot',
      bearChef: 'avatar_bear_chef',
      bearPainter: 'avatar_bear_painter',
      bearStar: 'avatar_bear_star',
      bearCrown: 'avatar_bear_crown',
      bearScarf: 'avatar_bear_scarf',
      bearGlasses: 'avatar_bear_glasses',
      cat: 'avatar_cat',
      dog: 'avatar_dog',
      rabbit: 'avatar_rabbit',
      fox: 'avatar_fox',
      owl: 'avatar_owl',
    },
  },

  // ---- H5 专属插画 ----
  h5: {
    folder: 'h5' as AssetFolder,
    ext: 'webp',
    items: {
      onboardWelcome: 'h5_onboard_welcome',
      emptyChildren: 'h5_empty_children',
      emptyStories: 'h5_empty_stories',
      scanQrGuide: 'h5_scan_qr_guide',
      successSubscribed: 'h5_success_subscribed',
      paymentStripe: 'h5_payment_stripe',
      paymentPaypal: 'h5_payment_paypal',
      pdfReady: 'h5_pdf_ready',
      shareLink: 'h5_share_link',
      errorNetwork: 'h5_error_network',
    },
  },
} as const;

type Registry = typeof registry;
type NamespaceOf<N extends keyof Registry> = keyof Registry[N]['items'];
type AssetKey = {
  [N in keyof Registry]: `${N & string}.${NamespaceOf<N> & string}`;
}[keyof Registry];

/**
 * 按 key(形如 `h5.emptyChildren`)返回完整 URL
 * 未匹配时返回空字符串(view 层可降级处理,比如显示 emoji 占位)
 */
export function asset(key: AssetKey | string): string {
  const [ns, name] = String(key).split('.') as [keyof Registry, string];
  const bucket = registry[ns];
  if (!bucket) return '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stem = (bucket.items as any)[name];
  if (!stem) return '';
  return `${ASSETS_BASE}/${bucket.folder}/${stem}.${bucket.ext}`;
}

/** 按名字(stem)拼头像 URL,数据库返回的是 stem,方便孩子档案直接用 */
export function avatarUrl(stem: string | undefined | null): string {
  if (!stem) return asset('avatar.bearClassic');
  return `${ASSETS_BASE}/avatar/${stem}.webp`;
}

/** 20 个预设头像列表(顺序 = UI 选择器展示顺序) */
export const PRESET_AVATARS: { key: string; stem: string; label: string }[] = [
  { key: 'bearClassic', stem: 'avatar_bear_classic', label: 'Classic' },
  { key: 'bearPink', stem: 'avatar_bear_pink', label: 'Pink Bow' },
  { key: 'bearBlue', stem: 'avatar_bear_blue', label: 'Blue Tie' },
  { key: 'bearMint', stem: 'avatar_bear_mint', label: 'Mint Hat' },
  { key: 'bearDoctor', stem: 'avatar_bear_doctor', label: 'Doctor' },
  { key: 'bearPilot', stem: 'avatar_bear_pilot', label: 'Pilot' },
  { key: 'bearChef', stem: 'avatar_bear_chef', label: 'Chef' },
  { key: 'bearPainter', stem: 'avatar_bear_painter', label: 'Painter' },
  { key: 'bearStar', stem: 'avatar_bear_star', label: 'Star' },
  { key: 'bearCrown', stem: 'avatar_bear_crown', label: 'Crown' },
  { key: 'bearScarf', stem: 'avatar_bear_scarf', label: 'Scarf' },
  { key: 'bearGlasses', stem: 'avatar_bear_glasses', label: 'Glasses' },
  { key: 'cat', stem: 'avatar_cat', label: 'Cat' },
  { key: 'dog', stem: 'avatar_dog', label: 'Dog' },
  { key: 'rabbit', stem: 'avatar_rabbit', label: 'Rabbit' },
  { key: 'fox', stem: 'avatar_fox', label: 'Fox' },
  { key: 'owl', stem: 'avatar_owl', label: 'Owl' },
];

/** 默认头像 stem */
export const DEFAULT_AVATAR_STEM = 'avatar_bear_classic';

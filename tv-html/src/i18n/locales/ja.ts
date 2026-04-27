/*
 * Japanese locale.
 * 2026-04-25: provided so the founder can preview multi-locale typography
 * on the FavoritesScreen. Untranslated keys fall back to English.
 */
import en from './en';

const overrides = {
  favorites: {
    title: 'お気に入り',
    count: 'お気に入り {used} 冊',
    empty: 'まだお気に入りがありません — 好きな物語のハートをタップしてください',
    actions: {
      playFull: '全話を見る',
      sequel: '続編を作る',
      download: 'ダウンロード',
      downloaded: '保存済み',
      delete: '削除',
      removed: 'お気に入りから削除しました',
      downloading: 'ダウンロード中…',
      alreadyDownloaded: 'この端末に保存済み',
      playHint: 'デモ表示のみ',
    },
  },
  library: {
    title: 'ものがたり',
    empty: 'まだ物語がありません — もう少し待ってね!',
    capacity: '{used} 冊',
  },
  profile: { title: 'マイルーム' },
  home: {
    title: 'ようこそ',
    subtitle: 'クマと一緒に新しいお話を発見しよう',
  },
  activation: {
    title: 'WonderBear へようこそ',
    subtitle: '新しい絵本を\nWonderBear で',
  },
  create: {
    title: 'おはなし作り',
    subtitle: '+ を押して魔法を始めるか、作品を選んでね',
    newStory: '魔法を始める',
    playFull: '全話を見る',
    sequel: '続編を作る',
  },
  common: { loading: '読み込み中…' },
};

function merge<T extends Record<string, unknown>>(base: T, over: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(over)) {
    const ov = over[k];
    const bv = (base as Record<string, unknown>)[k];
    if (ov && typeof ov === 'object' && !Array.isArray(ov)
        && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[k] = merge(bv as Record<string, unknown>, ov as Record<string, unknown>);
    } else {
      out[k] = ov;
    }
  }
  return out as T;
}

export default merge(en as unknown as Record<string, unknown>, overrides);

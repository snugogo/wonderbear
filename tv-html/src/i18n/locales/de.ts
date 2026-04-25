/*
 * German locale.
 * 2026-04-25: preview-grade. Untranslated keys fall back to English.
 */
import en from './en';

const overrides = {
  favorites: {
    title: 'Meine Favoriten',
    count: '{used} Favoriten',
    empty: 'Noch keine Favoriten — tippe auf das Herz einer Lieblingsgeschichte',
    actions: {
      playFull: 'Ganz abspielen',
      sequel: 'Fortsetzung',
      download: 'Herunterladen',
      downloaded: 'Gespeichert',
      delete: 'Löschen',
      removed: 'Aus Favoriten entfernt',
      downloading: 'Wird heruntergeladen…',
      alreadyDownloaded: 'Bereits auf diesem Gerät',
      playHint: 'Nur Demo — Geschichte nicht geladen',
    },
  },
  library: {
    title: 'Geschichten',
    empty: 'Geschichten leer — schau bald wieder vorbei!',
    capacity: '{used} Geschichten',
  },
  profile: { title: 'Mein Zimmer' },
  home: {
    title: 'Willkommen',
    subtitle: 'Entdecke neue Geschichten mit dem Bären',
  },
  activation: {
    title: 'Willkommen bei WonderBear',
    subtitle: 'Entdecke neue Bilderbücher\nmit WonderBear',
  },
  common: { loading: 'Wird geladen…' },
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

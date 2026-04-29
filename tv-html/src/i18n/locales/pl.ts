/*
 * Polish locale.
 * 2026-04-25: upgraded from prefix-stub to real preview translation
 * for the FavoritesScreen + key navigation strings. Untranslated keys
 * fall back to English via vue-i18n fallbackLocale.
 */
import en from './en';

const overrides = {
  favorites: {
    title: 'Moje ulubione',
    count: '{used} ulubionych',
    empty: 'Brak ulubionych — kliknij serce na historii, którą kochasz',
    actions: {
      playFull: 'Odtwórz całość',
      sequel: 'Stwórz kontynuację',
      download: 'Pobierz',
      downloaded: 'Zapisane',
      delete: 'Usuń',
      removed: 'Usunięto z ulubionych',
      downloading: 'Pobieranie…',
      alreadyDownloaded: 'Już na tym urządzeniu',
      playHint: 'Tylko demo — historia nie wczytana',
    },
  },
  library: {
    title: 'Historie',
    empty: 'Brak historii — wróć wkrótce!',
    capacity: '{used} historii',
  },
  profile: { title: 'Moja chatka' },
  home: {
    title: 'Witaj',
    subtitle: 'Odkrywaj nowe historie z misiem',
  },
  activation: {
    title: 'Witaj w WonderBear',
    subtitle: 'Odkryj nowe książeczki\nz WonderBear',
  },
  create: {
    title: 'Twórz historie',
    subtitle: 'Naciśnij +, by zacząć magię, lub wybierz historię',
    newStory: 'Zacznij magię',
    playFull: 'Odtwórz całość',
    sequel: 'Stwórz kontynuację',
  },
  dialogue: {
    youSaid: 'Powiedziałeś:',
  },
  storyPreview: {
    title: 'Twoja historia nabiera kształtu',
    subtitle: 'Zobacz, jak Miś ją złożył',
    confirm: 'Zacznij rysować historię',
    confirmHint: 'Naciśnij OK, by potwierdzić',
    fallbackParagraph: 'Miś układa Twoją historię w coś przytulnego.',
  },
  common: { loading: 'Ładowanie…' },
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

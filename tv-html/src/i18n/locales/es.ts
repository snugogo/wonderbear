/*
 * Spanish locale.
 * 2026-04-25: preview-grade. Untranslated keys fall back to English.
 */
import en from './en';

const overrides = {
  favorites: {
    title: 'Mis Favoritos',
    count: '{used} favoritos',
    empty: 'Aún no hay favoritos — toca el corazón de una historia que te guste',
    actions: {
      playFull: 'Ver completo',
      sequel: 'Crear secuela',
      download: 'Descargar',
      downloaded: 'Guardado',
      delete: 'Eliminar',
      removed: 'Eliminado de favoritos',
      downloading: 'Descargando…',
      alreadyDownloaded: 'Ya está en este dispositivo',
      playHint: 'Solo demo — historia no cargada',
    },
  },
  library: {
    title: 'Historias',
    empty: 'No hay historias — ¡vuelve pronto!',
    capacity: '{used} historias',
  },
  profile: { title: 'Mi cabaña' },
  home: {
    title: 'Bienvenido',
    subtitle: 'Descubre nuevos cuentos con el oso',
  },
  activation: {
    title: 'Bienvenido a WonderBear',
    subtitle: 'Descubre nuevos cuentos\ncon WonderBear',
  },
  common: { loading: 'Cargando…' },
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

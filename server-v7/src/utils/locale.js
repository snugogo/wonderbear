// ============================================================================
// Locale resolver — figure out which language to use for error messages.
//
// Resolution order (per API_CONTRACT §1.2):
//   1. request.body.locale (if present and valid)
//   2. Accept-Language header (first matching tag)
//   3. 'en' (default)
//
// Supported locales: zh / en / pl / ro
// ============================================================================

const SUPPORTED = new Set(['zh', 'en', 'pl', 'ro']);

/**
 * Resolve the active locale for a Fastify request.
 * @param {import('fastify').FastifyRequest} request
 * @returns {'zh' | 'en' | 'pl' | 'ro'}
 */
export function resolveLocale(request) {
  // 1. Body field (POST/PATCH requests with `locale` in JSON body)
  const bodyLocale = request?.body?.locale;
  if (typeof bodyLocale === 'string' && SUPPORTED.has(bodyLocale)) {
    return bodyLocale;
  }

  // 2. Accept-Language header. Pick the first tag whose primary subtag
  //    matches a supported locale. We don't do quality-value sorting —
  //    browsers send q in priority order and we want predictability.
  const accept = request?.headers?.['accept-language'];
  if (typeof accept === 'string' && accept.length > 0) {
    const tags = accept.split(',').map((t) => t.trim().toLowerCase());
    for (const tag of tags) {
      // Strip quality value: "en-US;q=0.9" → "en-us"
      const lang = tag.split(';')[0].trim();
      // Primary subtag: "en-us" → "en"
      const primary = lang.split('-')[0];
      if (SUPPORTED.has(primary)) return primary;
    }
  }

  return 'en';
}

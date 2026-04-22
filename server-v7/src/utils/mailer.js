// ============================================================================
// Mailer — Resend wrapper with DEV-MODE fallback.
//
// Behavior:
//   - If RESEND_API_KEY is configured → send via Resend API.
//   - If NOT configured → DEV MODE: render template, log it prominently,
//     return { sent: 'dev-console', messageId: 'dev_<nanoid>' }.
//
// Dev mode is NOT a silent mock — it guarantees:
//   1. Template is actually rendered (catches bad placeholders at dev time).
//   2. Logger receives a WARN-level structured event so operators see it.
//   3. A banner is ALSO emitted via console.log in case the pino logger is
//      piped to a file the founder hasn't tail'd.
//
// Real-send path is wired but not exercised by smoke tests (those run with
// no RESEND_API_KEY). Integration test lives in scripts/verify-e2e.sh
// (deferred to batch 3).
//
// Template engine = simple `{{key}}` replacement. No ejs/handlebars to keep
// the surface tiny and the rendered HTML predictable.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resend } from 'resend';
import { nanoid } from 'nanoid';
import env from '../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, '..', 'templates');

// Email subject lines by locale — not inside HTML template so we don't parse HTML for <title>.
const SUBJECT_BY_LOCALE = {
  zh: { register: '{brand} 注册验证码', login: '{brand} 登录验证码' },
  en: { register: 'Your {brand} verification code', login: 'Your {brand} login code' },
  pl: { register: 'Kod weryfikacyjny {brand}', login: 'Kod logowania {brand}' },
  ro: { register: 'Cod de verificare {brand}', login: 'Cod de autentificare {brand}' },
};

// purposeWord lookup feeds the `{{purposeWord}}` placeholder in every template.
const PURPOSE_WORD = {
  zh: { register: '注册', login: '登录' },
  en: { register: 'register your account', login: 'log in to your account' },
  pl: { register: 'zarejestrować się', login: 'zalogować się' },
  ro: { register: 'te înregistrezi', login: 'te conectezi' },
};

const EXPIRES_MIN = 5;

// Tiny in-process cache so we only read each template once.
const templateCache = new Map();

async function loadTemplate(locale) {
  if (templateCache.has(locale)) return templateCache.get(locale);
  const path = join(TEMPLATE_DIR, `verify-code.${locale}.html`);
  const html = await readFile(path, 'utf8');
  templateCache.set(locale, html);
  return html;
}

// Simple {{key}} replacer. Values MUST already be HTML-safe — code is digits,
// brand is controlled by env, year is a number. No user-supplied strings reach
// the template in batch 2.
function render(html, vars) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{{${k}}}`,
  );
}

function buildSubject(locale, purpose, brand) {
  const tpl = SUBJECT_BY_LOCALE[locale]?.[purpose] ?? SUBJECT_BY_LOCALE.en[purpose];
  return tpl.replace('{brand}', brand);
}

/**
 * Send a verification code email. Primary entrypoint used by /api/auth/send-code.
 *
 * @param {object} params
 * @param {string} params.to          recipient email (already normalized)
 * @param {string} params.code        6-digit code
 * @param {'zh'|'en'|'pl'|'ro'} params.locale
 * @param {'register'|'login'} params.purpose
 * @param {object} [params.logger]    Fastify/pino logger. Defaults to console.
 * @returns {Promise<{sent:'resend'|'dev-console', messageId:string}>}
 * @throws Error if Resend API fails (caller wraps in BizError EMAIL_SEND_FAILED)
 */
export async function sendVerifyEmail({ to, code, locale, purpose, logger }) {
  const log = logger ?? console;
  const loc = ['zh', 'en', 'pl', 'ro'].includes(locale) ? locale : 'en';
  const prp = ['register', 'login'].includes(purpose) ? purpose : 'register';

  const brand = env.MAIL_FROM_NAME || 'WonderBear';
  const purposeWord = PURPOSE_WORD[loc][prp];
  const year = new Date().getUTCFullYear();

  const templateHtml = await loadTemplate(loc);
  const html = render(templateHtml, { brand, code, expiresMin: EXPIRES_MIN, purposeWord, year });
  const subject = buildSubject(loc, prp, brand);

  // ---- DEV MODE ---------------------------------------------------------
  if (!env.RESEND_API_KEY) {
    const messageId = `dev_${nanoid(10)}`;

    // Structured WARN on the pino logger so operators with JSON log shippers see it.
    if (typeof log.warn === 'function') {
      log.warn(
        {
          mailer: 'dev-mode',
          to,
          code,
          locale: loc,
          purpose: prp,
          subject,
          messageId,
        },
        `[DEV MAIL] 📧 To: ${to} | Code: ${code} | Locale: ${loc} | Purpose: ${prp}`,
      );
    }

    // Louder console banner — impossible to miss in a tailed terminal even
    // if the logger got redirected somewhere weird.
    /* eslint-disable no-console */
    console.log('\n========================================');
    console.log('📧 DEV MAIL (Resend key NOT configured)');
    console.log(`To:      ${to}`);
    console.log(`Code:    ${code}`);
    console.log(`Locale:  ${loc}  |  Purpose: ${prp}`);
    console.log(`Subject: ${subject}`);
    console.log('========================================\n');
    /* eslint-enable no-console */

    return { sent: 'dev-console', messageId };
  }

  // ---- REAL SEND via Resend --------------------------------------------
  const resend = new Resend(env.RESEND_API_KEY);
  const from = `${brand} <${env.MAIL_FROM}>`;
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });
  if (error) {
    const e = new Error(`resend error: ${error.message || JSON.stringify(error)}`);
    e.cause = error;
    throw e;
  }
  return { sent: 'resend', messageId: data?.id ?? 'resend_unknown' };
}

// Exposed for tests: clear the template cache between cases.
export function _clearTemplateCache() {
  templateCache.clear();
}

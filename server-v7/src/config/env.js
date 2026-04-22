// ============================================================================
// Centralized env config — loaded once, imported everywhere.
//
// Strategy:
//   - [infra] is validated at startup; missing keys → process.exit(1)
//   - All other groups are validated LAZILY via validateEnvGroup(name) when
//     the feature first needs them. Lets the server boot + serve /health
//     even if AI/payment/email keys aren't configured yet.
// ============================================================================

import 'dotenv/config';

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),

  // infra
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_jwt_secret_change_me_in_prod_at_least_32_bytes_long',

  // mail
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MAIL_FROM: process.env.MAIL_FROM || 'noreply@wonderbear.app',
  MAIL_FROM_NAME: process.env.MAIL_FROM_NAME || 'WonderBear',

  // ai
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  FAL_KEY: process.env.FAL_KEY,

  // tts
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  VOICE_ID_EN: process.env.VOICE_ID_EN,
  VOICE_ID_PL: process.env.VOICE_ID_PL,
  VOICE_ID_RO: process.env.VOICE_ID_RO,
  VOICE_ID_ES: process.env.VOICE_ID_ES,
  VOICE_ID_FR: process.env.VOICE_ID_FR,
  VOICE_ID_ZH: process.env.VOICE_ID_ZH,

  // speech
  GOOGLE_SPEECH_KEY: process.env.GOOGLE_SPEECH_KEY,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,

  // stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_ID_MONTHLY: process.env.STRIPE_PRICE_ID_MONTHLY,
  STRIPE_PRICE_ID_YEARLY: process.env.STRIPE_PRICE_ID_YEARLY,

  // paypal
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
  PAYPAL_MODE: process.env.PAYPAL_MODE || 'sandbox',
  PAYPAL_PLAN_ID_MONTHLY: process.env.PAYPAL_PLAN_ID_MONTHLY,
  PAYPAL_PLAN_ID_YEARLY: process.env.PAYPAL_PLAN_ID_YEARLY,

  // storage
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY: process.env.R2_ACCESS_KEY,
  R2_SECRET_KEY: process.env.R2_SECRET_KEY,
  R2_BUCKET: process.env.R2_BUCKET || 'wonderbear-assets',
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  STORAGE_TYPE: process.env.STORAGE_TYPE || 'local',
  LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH || './storage',

  // misc
  IMAGE_STYLE_SUFFIX: process.env.IMAGE_STYLE_SUFFIX || '',
  IMAGE_PAGE1_COMPOSITION: process.env.IMAGE_PAGE1_COMPOSITION || '',
};

// --------------------------------------------------------------------------
// Infra-level validation — fail fast at startup
// --------------------------------------------------------------------------
function validateEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
    console.error('   Copy .env.example to .env and fill in values.');
    process.exit(1);
  }

  // Protect against shipping the default dev secret to prod
  if (
    env.NODE_ENV !== 'development' &&
    env.JWT_SECRET === 'dev_jwt_secret_change_me_in_prod_at_least_32_bytes_long'
  ) {
    console.error('❌ JWT_SECRET must be overridden in non-development environments');
    console.error('   Generate one: openssl rand -hex 32');
    process.exit(1);
  }

  if (env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 chars for security');
    process.exit(1);
  }
}

validateEnv();

// --------------------------------------------------------------------------
// Grouped env keys — for lazy validation by feature
// --------------------------------------------------------------------------
export const ENV_GROUPS = {
  infra: ['DATABASE_URL', 'JWT_SECRET'], // documented here for check-keys.sh; already validated above
  mail: ['RESEND_API_KEY', 'MAIL_FROM'],
  ai: ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'FAL_KEY'],
  tts: ['ELEVENLABS_API_KEY', 'VOICE_ID_EN'],
  speech: ['GOOGLE_SPEECH_KEY'],
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID_MONTHLY', 'STRIPE_PRICE_ID_YEARLY'],
  paypal: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID'],
  storage: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_PUBLIC_URL'],
};

/**
 * Throws if any env var in the named group is missing.
 * Call this inside a route/service that depends on the group so failure is
 * loud and early with a clear message (rather than a cryptic 401 from the
 * upstream API a few calls deep).
 *
 * @param {'infra'|'mail'|'ai'|'tts'|'speech'|'stripe'|'paypal'|'storage'} groupName
 */
export function validateEnvGroup(groupName) {
  const keys = ENV_GROUPS[groupName];
  if (!keys) throw new Error(`Unknown env group: ${groupName}`);
  const missing = keys.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing env vars for "${groupName}" feature: ${missing.join(', ')}. ` +
        `Add them to .env before using this feature.`,
    );
  }
}

/**
 * Non-throwing check — returns { configured: boolean, missing: string[] }.
 * Used by /api/health to report per-group status without crashing.
 */
export function checkEnvGroup(groupName) {
  const keys = ENV_GROUPS[groupName];
  if (!keys) return { configured: false, missing: ['<unknown group>'] };
  const missing = keys.filter((k) => !env[k]);
  return { configured: missing.length === 0, missing };
}

export default env;

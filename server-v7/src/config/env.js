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
  GOOGLE_SPEECH_PROJECT_ID: process.env.GOOGLE_SPEECH_PROJECT_ID,

  // asr / tts dual-provider routing — workorder 2026-04-29-asr-tts-dual-provider
  ASR_PRIMARY: process.env.ASR_PRIMARY || 'google',
  ASR_FALLBACK_CHAIN: process.env.ASR_FALLBACK_CHAIN || 'dashscope',
  ASR_TIMEOUT_MS: parseInt(process.env.ASR_TIMEOUT_MS || '8000', 10),
  ASR_LANGUAGE_DEFAULT: process.env.ASR_LANGUAGE_DEFAULT || 'zh',
  TTS_PRIMARY: process.env.TTS_PRIMARY || 'dashscope',
  TTS_FALLBACK_CHAIN: process.env.TTS_FALLBACK_CHAIN || 'elevenlabs',
  TTS_TIMEOUT_MS: parseInt(process.env.TTS_TIMEOUT_MS || '15000', 10),

  // dashscope (Aliyun model studio)
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
  DASHSCOPE_TTS_VOICE_ZH: process.env.DASHSCOPE_TTS_VOICE_ZH || 'longhuhu_v3',
  DASHSCOPE_TTS_VOICE_EN: process.env.DASHSCOPE_TTS_VOICE_EN || 'longhuhu_v3',
  DASHSCOPE_TTS_VOICE_VOCAB: process.env.DASHSCOPE_TTS_VOICE_VOCAB || 'longxiaoxia_v2',
  DASHSCOPE_ASR_MODEL: process.env.DASHSCOPE_ASR_MODEL || 'paraformer-v2',
  DASHSCOPE_TTS_MODEL: process.env.DASHSCOPE_TTS_MODEL || 'cosyvoice-v2',

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

  // storage — Cloudflare R2 (S3-compat). New names from work-order; old
  // R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET kept as fallback so existing
  // .env files don't break.
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY,
  R2_BUCKET_NAME:
    process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || 'wonderbear-assets',
  R2_ENDPOINT: process.env.R2_ENDPOINT,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  // Aliyun OSS — used by DashScope ASR (WO-1 §3.3).
  OSS_REGION: process.env.OSS_REGION,
  OSS_BUCKET: process.env.OSS_BUCKET,
  OSS_ENDPOINT_ACCELERATE: process.env.OSS_ENDPOINT_ACCELERATE || 'oss-accelerate.aliyuncs.com',
  OSS_ENDPOINT_STANDARD: process.env.OSS_ENDPOINT_STANDARD || 'oss-cn-hangzhou.aliyuncs.com',
  OSS_ACCESS_KEY_ID: process.env.OSS_ACCESS_KEY_ID,
  OSS_ACCESS_KEY_SECRET: process.env.OSS_ACCESS_KEY_SECRET,
  STORAGE_TYPE: process.env.STORAGE_TYPE || 'local',
  LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH || './storage',

  // debug
  DEBUG_GALLERY_PASSWORD: process.env.DEBUG_GALLERY_PASSWORD,

  // misc
  IMAGE_STYLE_SUFFIX: process.env.IMAGE_STYLE_SUFFIX || '',
  IMAGE_PAGE1_COMPOSITION: process.env.IMAGE_PAGE1_COMPOSITION || '',

  // prompt version routing — workorder 2026-04-30-v2lite-w2-prompt-version-routing
  // 'v1' = Track B legacy path (default, prod current behavior)
  // 'v2-lite' / 'v2-full' = orchestrator path (W3 will switch via env)
  PROMPT_VERSION: (() => {
    const v = process.env.PROMPT_VERSION || 'v1';
    const allowed = ['v1', 'v2-lite', 'v2-full'];
    if (!allowed.includes(v)) {
      console.warn(
        `[env] Unknown PROMPT_VERSION="${v}", falling back to "v1". ` +
          `Allowed: ${allowed.join(', ')}`,
      );
      return 'v1';
    }
    return v;
  })(),
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
  speech: ['GOOGLE_APPLICATION_CREDENTIALS'],
  dashscope: ['DASHSCOPE_API_KEY'],
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID_MONTHLY', 'STRIPE_PRICE_ID_YEARLY'],
  paypal: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID'],
  storage: [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_ENDPOINT',
    'R2_PUBLIC_URL',
  ],
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

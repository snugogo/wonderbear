// ============================================================================
// /api/health — health check with deep upstream probing.
//
// Response shape per API_CONTRACT §3.1:
//   { code: 0, data: { status, version, services, serverTime }, requestId }
//
// Per-service state: 'ok' | 'error' | 'skipped' (no key configured)
//
// Overall status logic:
//   - db or redis = 'error'  → overall 'degraded' + HTTP 503 (LB ejects)
//   - upstream AI/payment/mail = 'error' → overall 'degraded' + HTTP 200
//     (we don't want LB to eject us just because OpenAI is having a bad day)
//   - all 'ok' or 'skipped'  → 'ok' + HTTP 200
//
// Upstream probes are cached for 60s to avoid hammering providers on every
// health check (LBs poll every few seconds). DB/Redis pings are not cached.
//
// BATCH 1 NOTE: this route now relies on responseEnvelope to wrap the
// returned data into the v7 success envelope. We just return bare data
// and set HTTP 503 if infra is degraded. requestId is auto-injected.
// ============================================================================

import env, { checkEnvGroup } from '../config/env.js';

const UPSTREAM_CACHE_TTL_MS = 60 * 1000;
const PROBE_TIMEOUT_MS = 1500;
let upstreamCache = null; // { at: number, services: {...} }

const SERVER_VERSION = '0.1.0';

async function timedFetch(url, opts = {}, timeoutMs = PROBE_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---- Individual upstream probers — each returns 'ok'|'error'|'skipped'

async function probeOpenAI() {
  if (!env.OPENAI_API_KEY) return 'skipped';
  try {
    const r = await timedFetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    });
    return r.ok ? 'ok' : 'error';
  } catch { return 'error'; }
}

async function probeGemini() {
  if (!env.GEMINI_API_KEY) return 'skipped';
  try {
    const r = await timedFetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`,
    );
    return r.ok ? 'ok' : 'error';
  } catch { return 'error'; }
}

async function probeFal() {
  if (!env.FAL_KEY) return 'skipped';
  try {
    const r = await timedFetch('https://fal.run/health', {
      headers: { Authorization: `Key ${env.FAL_KEY}` },
    });
    if (r.status === 401 || r.status === 403) return 'error';
    return 'ok';
  } catch { return 'error'; }
}

async function probeElevenLabs() {
  if (!env.ELEVENLABS_API_KEY) return 'skipped';
  try {
    const r = await timedFetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    });
    return r.ok ? 'ok' : 'error';
  } catch { return 'error'; }
}

async function probeResend() {
  if (!env.RESEND_API_KEY) return 'skipped';
  try {
    const r = await timedFetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    });
    return r.ok ? 'ok' : 'error';
  } catch { return 'error'; }
}

async function probeStripe() {
  if (!env.STRIPE_SECRET_KEY) return 'skipped';
  try {
    const r = await timedFetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    return r.ok ? 'ok' : 'error';
  } catch { return 'error'; }
}

async function probePaypal() {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return 'skipped';
  try {
    const host =
      env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
    const basic = Buffer.from(
      `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`,
    ).toString('base64');
    const r = await timedFetch(`${host}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    return r.ok ? 'ok' : 'error';
  } catch { return 'error'; }
}

async function probeGoogleSpeech() {
  // We don't actually call the Speech API (would bill); just verify env
  // is configured. Real validation happens on first ASR request in batch 4.
  const { configured } = checkEnvGroup('speech');
  return configured ? 'ok' : 'skipped';
}

async function probeUpstreams() {
  const now = Date.now();
  if (upstreamCache && now - upstreamCache.at < UPSTREAM_CACHE_TTL_MS) {
    return upstreamCache.services;
  }

  const [openai, gemini, fal, elevenlabs, resend, stripe, paypal, speech] =
    await Promise.all([
      probeOpenAI(), probeGemini(), probeFal(), probeElevenLabs(),
      probeResend(), probeStripe(), probePaypal(), probeGoogleSpeech(),
    ]);

  const services = { openai, gemini, fal, elevenlabs, resend, stripe, paypal, speech };
  upstreamCache = { at: now, services };
  return services;
}

async function pingDb(prisma) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch { return 'error'; }
}

async function pingRedis(redis) {
  try {
    const r = await redis.ping();
    return r === 'PONG' ? 'ok' : 'error';
  } catch { return 'error'; }
}

// ---- Route -----------------------------------------------------------------

export default async function healthRoutes(fastify) {
  fastify.get('/api/health', async (request, reply) => {
    const [db, redis, upstreams] = await Promise.all([
      pingDb(fastify.prisma),
      pingRedis(fastify.redis),
      probeUpstreams(),
    ]);

    const services = { db, redis, ...upstreams };
    const infraDegraded = db === 'error' || redis === 'error';
    const upstreamDegraded = Object.values(upstreams).some((v) => v === 'error');
    const status = infraDegraded || upstreamDegraded ? 'degraded' : 'ok';

    if (infraDegraded) {
      reply.code(503);
    }

    // Bare object — responseEnvelope hook wraps in {code:0, data:..., requestId}
    return {
      status,
      version: SERVER_VERSION,
      services,
      serverTime: new Date().toISOString(),
    };
  });
}

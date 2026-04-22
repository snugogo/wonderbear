// ============================================================================
// Batch 1 smoke test — verifies the response envelope + error code + locale
// + requestId + BizError pipeline end-to-end via Fastify .inject().
//
// Run: node test/smoke/run.mjs
//   (DATABASE_URL + JWT_SECRET must be set; values can be fake)
// ============================================================================

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://fake:fake@localhost:5432/fake';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'smoke_test_jwt_secret_at_least_32_bytes_long_abc123';
process.env.NODE_ENV = 'development';

import Fastify from 'fastify';
import { ErrorCodes } from '../../src/utils/errorCodes.js';
import { BizError, ok, isEnvelope } from '../../src/utils/response.js';
import { getMessage, getMessageBundle, getName } from '../../src/utils/errorCodes.js';
import { resolveLocale } from '../../src/utils/locale.js';
import requestIdPlugin from '../../src/plugins/requestId.js';
import responseEnvelopePlugin from '../../src/plugins/responseEnvelope.js';
import errorHandlerPlugin from '../../src/plugins/errorHandler.js';
import healthRoutes from '../../src/routes/health.js';

// Batch 2 imports
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  BCRYPT_ROUNDS,
} from '../../src/utils/password.js';
import {
  TOKEN_TYPES,
  TOKEN_TTL_SECONDS,
  signParentToken,
  signDeviceToken,
  signSellerToken,
  verifyTokenOfType,
  hashTokenForBlacklist,
} from '../../src/utils/jwt.js';
import {
  generateCode,
  storeCode,
  verifyCode,
  checkSendAllowed,
  markSent,
  peekCode,
  resetForEmail,
  CODE_TTL_SECONDS,
  SEND_COOLDOWN_SECONDS,
  MAX_ATTEMPTS,
} from '../../src/utils/verifyCode.js';
import { sendVerifyEmail, _clearTemplateCache } from '../../src/utils/mailer.js';
import authPlugin from '../../src/plugins/auth.js';
import authRoutes from '../../src/routes/auth.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else      { console.log(`  ❌ ${msg}`); failed++; }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ---------------------------------------------------------------------------
// Build a minimal app with batch 1 plugins, a couple of test routes, and
// mocked prisma/redis. Reused across cases.
// ---------------------------------------------------------------------------
async function buildTestApp() {
  const app = Fastify({ logger: false });

  // Mock infra
  app.decorate('prisma', { $queryRaw: async () => [{ ok: 1 }] });
  app.decorate('redis', { ping: async () => 'PONG' });

  // Batch 1 plumbing — order matters
  await app.register(requestIdPlugin);
  await app.register(responseEnvelopePlugin);
  await app.register(errorHandlerPlugin);

  // Test routes that exercise each path
  await app.register(async (api) => {
    api.get('/api/test/bare-object', async () => ({ hello: 'world' }));
    api.get('/api/test/bare-array', async () => [1, 2, 3]);
    api.get('/api/test/null', async () => null);
    api.get('/api/test/ok-helper', async () => ok({ via: 'helper' }));
    api.get('/api/test/biz-error', async () => {
      throw new BizError(ErrorCodes.QUOTA_EXHAUSTED, {
        details: { storiesLeft: 0 },
        actions: [{ label: '升级', labelEn: 'Upgrade', url: '/sub' }],
      });
    });
    api.get('/api/test/biz-error-locale', async () => {
      throw new BizError(ErrorCodes.EMAIL_INVALID);
    });
    api.get('/api/test/crash', async () => {
      throw new Error('boom unexpected');
    });
    api.get('/api/test/already-envelope', async () => ({
      code: 0,
      data: { manual: true },
      requestId: 'req_old_value',
    }));
    api.post('/api/test/echo-locale', async (request) => ({
      locale: request.locale,
    }));
  });

  await app.register(healthRoutes);
  return app;
}

async function main() {
  console.log('Batch 1 smoke test\n==================');

  // -----------------------------------------------------------------
  section('errorCodes module');
  // -----------------------------------------------------------------
  assert(ErrorCodes.TOKEN_EXPIRED === 10001, 'ErrorCodes.TOKEN_EXPIRED === 10001');
  assert(ErrorCodes.QUOTA_EXHAUSTED === 30004, 'ErrorCodes.QUOTA_EXHAUSTED === 30004');
  assert(ErrorCodes.PARAM_MISSING === 90001, 'ErrorCodes.PARAM_MISSING === 90001');
  assert(getName(10001) === 'TOKEN_EXPIRED', 'getName(10001) === TOKEN_EXPIRED');
  assert(getName(99999) === 'UNKNOWN_99999', 'getName(unknown) → UNKNOWN_x');
  assert(getMessage(10001, 'zh') === '登录已过期,请重新登录', 'zh message');
  assert(getMessage(10001, 'en') === 'Session expired, please log in again', 'en message');
  assert(getMessage(10001, 'pl').length > 0, 'pl message non-empty');
  assert(getMessage(10001, 'ro').length > 0, 'ro message non-empty');
  assert(getMessage(99999) === 'Unknown error', 'unknown code → Unknown error');

  const bundle = getMessageBundle(30004, 'zh');
  assert(bundle.message === '故事额度用完了,订阅解锁无限故事', 'bundle.message in zh');
  assert(bundle.messageEn.startsWith('Free quota'), 'bundle.messageEn');
  assert(bundle.messagePl.length > 0, 'bundle.messagePl');
  assert(bundle.messageRo.length > 0, 'bundle.messageRo');

  // Verify all 36 codes present
  const expectedCodes = [
    10001,10002,10003,10004,10005,10006,10007,10008,10009,10010,
    20001,20002,20003,20004,20005,20006,20007,20008,
    30001,30002,30003,30004,30005,30006,30007,30008,30009,30010,30011,30012,
    40001,40002,40003,40004,40005,40006,40007,
    50001,50002,50003,50004,50005,
    90001,90002,90003,90004,90005,
  ];
  let allPresent = true;
  for (const c of expectedCodes) {
    if (!getName(c).startsWith('UNKNOWN')) continue;
    allPresent = false;
    console.log(`  ❌ missing code ${c}`);
  }
  assert(allPresent, `all ${expectedCodes.length} codes registered`);

  // -----------------------------------------------------------------
  section('locale resolver');
  // -----------------------------------------------------------------
  assert(resolveLocale({ body: { locale: 'zh' } }) === 'zh', 'body locale wins');
  assert(resolveLocale({ body: { locale: 'klingon' } }) === 'en', 'invalid body locale falls back');
  assert(resolveLocale({ headers: { 'accept-language': 'pl-PL,en;q=0.9' } }) === 'pl', 'pl from Accept-Language');
  assert(resolveLocale({ headers: { 'accept-language': 'en-US,en;q=0.9' } }) === 'en', 'en from Accept-Language');
  assert(resolveLocale({ headers: { 'accept-language': 'ro-RO' } }) === 'ro', 'ro from Accept-Language');
  assert(resolveLocale({}) === 'en', 'empty request → en');
  // body trumps header
  assert(
    resolveLocale({ body: { locale: 'zh' }, headers: { 'accept-language': 'pl' } }) === 'zh',
    'body wins over Accept-Language',
  );

  // -----------------------------------------------------------------
  section('isEnvelope');
  // -----------------------------------------------------------------
  assert(isEnvelope({ code: 0, data: {}, requestId: 'x' }), 'success envelope detected');
  assert(isEnvelope({ code: 10001, message: 'x', requestId: 'y' }), 'error envelope detected');
  assert(!isEnvelope({ foo: 1 }), 'plain object not envelope');
  assert(!isEnvelope(null), 'null not envelope');
  assert(!isEnvelope([]), 'array not envelope');

  // -----------------------------------------------------------------
  section('Fastify integration: request lifecycle');
  // -----------------------------------------------------------------
  const app = await buildTestApp();

  // Bare object → wrapped
  let res = await app.inject({ method: 'GET', url: '/api/test/bare-object' });
  let body = res.json();
  assert(res.statusCode === 200, 'bare-object: HTTP 200');
  assert(body.code === 0, 'bare-object: code=0');
  assert(body.data?.hello === 'world', 'bare-object: data preserved');
  assert(typeof body.requestId === 'string' && body.requestId.startsWith('req_'),
         'bare-object: requestId injected');
  assert(res.headers['x-request-id'] === body.requestId, 'bare-object: X-Request-Id matches');

  // Bare array
  res = await app.inject({ method: 'GET', url: '/api/test/bare-array' });
  body = res.json();
  assert(Array.isArray(body.data) && body.data.length === 3, 'bare-array: data is [1,2,3]');

  // null
  res = await app.inject({ method: 'GET', url: '/api/test/null' });
  body = res.json();
  assert(body.code === 0 && body.data === null, 'null route: code=0 data=null');

  // ok() helper
  res = await app.inject({ method: 'GET', url: '/api/test/ok-helper' });
  body = res.json();
  assert(body.code === 0 && body.data?.via === 'helper', 'ok() helper unwrapped correctly');
  assert(!('__envelope' in (body.data ?? {})), '__envelope marker stripped');

  // Already-formed envelope passes through (with requestId override if missing)
  res = await app.inject({ method: 'GET', url: '/api/test/already-envelope' });
  body = res.json();
  assert(body.code === 0 && body.data?.manual === true, 'pre-formed envelope passed through');
  // Their requestId stays since they provided one
  assert(body.requestId === 'req_old_value', 'pre-formed requestId preserved');

  // -----------------------------------------------------------------
  section('BizError → error envelope');
  // -----------------------------------------------------------------
  res = await app.inject({ method: 'GET', url: '/api/test/biz-error' });
  body = res.json();
  assert(res.statusCode === 200, 'BizError: HTTP 200 (business errors keep 200)');
  assert(body.code === 30004, `BizError: code=30004 (got ${body.code})`);
  assert(typeof body.message === 'string' && body.message.length > 0, 'BizError: message present');
  assert(body.messageEn?.startsWith('Free quota'), 'BizError: messageEn matches');
  assert(body.messagePl?.length > 0, 'BizError: messagePl non-empty');
  assert(body.messageRo?.length > 0, 'BizError: messageRo non-empty');
  assert(body.details?.storiesLeft === 0, 'BizError: details preserved');
  assert(Array.isArray(body.actions) && body.actions.length === 1, 'BizError: actions preserved');
  assert(typeof body.requestId === 'string' && body.requestId.startsWith('req_'),
         'BizError: requestId injected');

  // -----------------------------------------------------------------
  section('Locale resolution at runtime');
  // -----------------------------------------------------------------
  // Accept-Language: pl → message should be Polish
  res = await app.inject({
    method: 'GET',
    url: '/api/test/biz-error-locale',
    headers: { 'accept-language': 'pl-PL' },
  });
  body = res.json();
  assert(body.code === 10003, 'locale test: code=10003');
  assert(body.message === 'Nieprawidłowy format e-maila', `pl message resolved (got "${body.message}")`);
  assert(body.messageEn === 'Invalid email format', 'messageEn always English');

  // Accept-Language: zh → Chinese
  res = await app.inject({
    method: 'GET',
    url: '/api/test/biz-error-locale',
    headers: { 'accept-language': 'zh-CN,zh;q=0.9' },
  });
  body = res.json();
  assert(body.message === '邮箱格式不正确', 'zh message resolved');

  // Body locale wins over header
  res = await app.inject({
    method: 'POST',
    url: '/api/test/echo-locale',
    headers: { 'accept-language': 'pl' },
    payload: { locale: 'ro' },
  });
  body = res.json();
  assert(body.data?.locale === 'ro', `body.locale=ro wins over header pl (got ${body.data?.locale})`);

  // -----------------------------------------------------------------
  section('Unexpected exception → 50001');
  // -----------------------------------------------------------------
  res = await app.inject({ method: 'GET', url: '/api/test/crash' });
  body = res.json();
  assert(res.statusCode === 200, 'crash: HTTP 200 per §1.2');
  assert(body.code === 50001, `crash: code=50001 (got ${body.code})`);
  assert(typeof body.message === 'string', 'crash: message present');
  // Dev mode leaks devMessage for debugging
  assert(body.details?.devMessage === 'boom unexpected',
         'crash: dev mode leaks original error message in details');

  // -----------------------------------------------------------------
  section('Not found handler');
  // -----------------------------------------------------------------
  res = await app.inject({ method: 'GET', url: '/api/nope/does-not-exist' });
  body = res.json();
  assert(res.statusCode === 404, '404: HTTP 404');
  assert(body.code === 90002, `404: code=90002 (got ${body.code})`);
  assert(body.details?.path === '/api/nope/does-not-exist', '404: path in details');
  assert(body.details?.method === 'GET', '404: method in details');

  // -----------------------------------------------------------------
  section('X-Request-Id header propagation');
  // -----------------------------------------------------------------
  res = await app.inject({
    method: 'GET',
    url: '/api/test/bare-object',
    headers: { 'x-request-id': 'req_client_provided_xyz' },
  });
  body = res.json();
  assert(body.requestId === 'req_client_provided_xyz',
         'client-supplied X-Request-Id preserved');
  assert(res.headers['x-request-id'] === 'req_client_provided_xyz',
         'X-Request-Id header echoed');

  // -----------------------------------------------------------------
  section('Health route still passes batch 0 contract');
  // -----------------------------------------------------------------
  res = await app.inject({ method: 'GET', url: '/api/health' });
  body = res.json();
  assert(res.statusCode === 200, 'health: HTTP 200');
  assert(body.code === 0, 'health: code=0');
  assert(body.data?.status === 'ok', 'health: status=ok');
  assert(body.data?.services?.db === 'ok', 'health: db=ok');
  assert(body.data?.services?.redis === 'ok', 'health: redis=ok');
  assert(typeof body.requestId === 'string' && body.requestId.startsWith('req_'),
         'health: requestId from envelope plugin');

  await app.close();

  // -----------------------------------------------------------------
  section('Health route HTTP 503 when DB down');
  // -----------------------------------------------------------------
  const app2 = Fastify({ logger: false });
  app2.decorate('prisma', { $queryRaw: async () => { throw new Error('db gone'); } });
  app2.decorate('redis', { ping: async () => 'PONG' });
  await app2.register(requestIdPlugin);
  await app2.register(responseEnvelopePlugin);
  await app2.register(errorHandlerPlugin);
  await app2.register(healthRoutes);

  res = await app2.inject({ method: 'GET', url: '/api/health' });
  body = res.json();
  assert(res.statusCode === 503, 'DB down: HTTP 503');
  assert(body.data?.status === 'degraded', 'DB down: status=degraded');
  assert(body.data?.services?.db === 'error', 'DB down: db=error');
  assert(body.code === 0, 'DB down: envelope code=0 (status conveys badness)');

  await app2.close();

  // =================================================================
  //                       BATCH 2 ASSERTIONS
  // =================================================================
  await runBatch2Tests();

  // =================================================================
  //                       BATCH 3 ASSERTIONS
  // =================================================================
  const { runBatch3Tests } = await import('./batch3.mjs');
  await runBatch3Tests({ assert, section });

  // -----------------------------------------------------------------
  console.log(`\n==================`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('✅ All batch 1 + batch 2 + batch 3 smoke assertions green\n');
}

// ===================================================================
// BATCH 2: auth module
// ===================================================================

// In-memory Redis stub that supports the subset of ioredis commands used
// by verifyCode.js + auth.js. Keeps TTLs precise (ms granularity) so tests
// can assert cooldown / expiry logic.
function makeFakeRedis() {
  const store = new Map(); // key -> { value, expiresAt (ms epoch) | null }
  const now = () => Date.now();
  const cleanup = (k) => {
    const e = store.get(k);
    if (e && e.expiresAt != null && e.expiresAt <= now()) store.delete(k);
  };
  return {
    async get(k) {
      cleanup(k);
      return store.get(k)?.value ?? null;
    },
    async set(k, v) {
      store.set(k, { value: String(v), expiresAt: null });
      return 'OK';
    },
    async setex(k, ttl, v) {
      store.set(k, { value: String(v), expiresAt: now() + ttl * 1000 });
      return 'OK';
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n++;
      return n;
    },
    async expire(k, ttl) {
      const e = store.get(k);
      if (!e) return 0;
      e.expiresAt = now() + ttl * 1000;
      return 1;
    },
    async ttl(k) {
      cleanup(k);
      const e = store.get(k);
      if (!e) return -2;
      if (e.expiresAt == null) return -1;
      return Math.max(0, Math.ceil((e.expiresAt - now()) / 1000));
    },
    async incr(k) {
      cleanup(k);
      const e = store.get(k);
      const next = (e ? parseInt(e.value, 10) : 0) + 1;
      store.set(k, { value: String(next), expiresAt: e?.expiresAt ?? null });
      return next;
    },
    async ping() { return 'PONG'; },
    // utility for tests
    _dump() { return Array.from(store.entries()); },
    _setTime(ms) { /* noop, we use real time */ },
  };
}

// In-memory Prisma.parent stub — just enough API surface for the auth routes.
function makeFakePrisma() {
  const parents = new Map(); // id -> parent record
  const byEmail = new Map();
  let counter = 0;
  const nextId = () => `cm_fake_${++counter}`;

  return {
    parent: {
      async findUnique({ where, include }) {
        let p = null;
        if (where?.id) p = parents.get(where.id) ?? null;
        else if (where?.email) {
          const id = byEmail.get(where.email);
          p = id ? parents.get(id) : null;
        }
        if (!p) return null;
        // Build shallow include
        const out = { ...p };
        if (include?.devices) out.devices = p.devices ?? [];
        if (include?.subscription) out.subscription = p.subscription ?? null;
        return out;
      },
      async create({ data }) {
        const id = nextId();
        const p = {
          id,
          email: data.email,
          passwordHash: data.passwordHash ?? null,
          locale: data.locale,
          playBgm: true,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: data.lastLoginAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          devices: [],
          subscription: null,
        };
        parents.set(id, p);
        byEmail.set(p.email, id);
        return p;
      },
      async update({ where, data }) {
        const p = parents.get(where.id);
        if (!p) throw new Error('not found');
        Object.assign(p, data, { updatedAt: new Date() });
        return { ...p };
      },
    },
    // Prisma health ping
    async $queryRaw() { return [{ ok: 1 }]; },
  };
}

async function buildAuthApp() {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makeFakePrisma());
  app.decorate('redis', makeFakeRedis());

  await app.register(requestIdPlugin);
  await app.register(responseEnvelopePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);
  await app.register(authRoutes);

  return app;
}

async function runBatch2Tests() {
  // -----------------------------------------------------------------
  section('batch 2: password utils');
  // -----------------------------------------------------------------
  assert(BCRYPT_ROUNDS === 12, `bcrypt rounds = 12 (got ${BCRYPT_ROUNDS})`);
  const hash = await hashPassword('abcd1234');
  assert(typeof hash === 'string' && hash.startsWith('$2'), 'hashPassword returns bcrypt hash');
  assert(await verifyPassword('abcd1234', hash), 'verifyPassword: correct password');
  assert(!(await verifyPassword('wrongpass1', hash)), 'verifyPassword: wrong password');
  assert(!(await verifyPassword('abcd1234', null)), 'verifyPassword: null hash → false');
  assert(!(await verifyPassword('', hash)), 'verifyPassword: empty plain → false');

  assert(validatePasswordStrength('abcd1234').valid === true, 'strength: 8 chars + letter + digit');
  assert(validatePasswordStrength('abc123').valid === false, 'strength: < 8 chars fails');
  assert(validatePasswordStrength('abcdefghij').valid === false, 'strength: missing digit fails');
  assert(validatePasswordStrength('12345678').valid === false, 'strength: missing letter fails');
  assert(validatePasswordStrength('').valid === false, 'strength: empty fails');

  // -----------------------------------------------------------------
  section('batch 2: jwt utils');
  // -----------------------------------------------------------------
  assert(TOKEN_TYPES.PARENT === 'parent', 'TOKEN_TYPES.PARENT');
  assert(TOKEN_TTL_SECONDS.parent === 7 * 86400, 'parent TTL = 7d');
  assert(TOKEN_TTL_SECONDS.device === 30 * 86400, 'device TTL = 30d');
  assert(TOKEN_TTL_SECONDS.seller === 1 * 86400, 'seller TTL = 1d');
  assert(hashTokenForBlacklist('abc').length === 64, 'sha256 hex length = 64');
  assert(hashTokenForBlacklist('abc') === hashTokenForBlacklist('abc'), 'sha256 deterministic');
  assert(hashTokenForBlacklist('abc') !== hashTokenForBlacklist('abcd'), 'sha256 different inputs differ');

  // Live sign/verify round-trip via a Fastify instance
  const jwtApp = Fastify({ logger: false });
  jwtApp.decorate('prisma', makeFakePrisma());
  jwtApp.decorate('redis', makeFakeRedis());
  await jwtApp.register(requestIdPlugin);
  await jwtApp.register(responseEnvelopePlugin);
  await jwtApp.register(errorHandlerPlugin);
  await jwtApp.register(authPlugin);

  const { token: parentToken, expiresAt: parentExp } = await signParentToken(jwtApp, 'p_123');
  assert(typeof parentToken === 'string' && parentToken.split('.').length === 3, 'parent token looks like JWT');
  assert(typeof parentExp === 'string' && parentExp.endsWith('Z'), 'parent expiresAt is ISO');
  const payload = jwtApp.jwt.verify(parentToken);
  assert(payload.sub === 'p_123', 'parent token sub round-trips');
  assert(payload.type === 'parent', 'parent token type=parent');

  const { token: deviceToken } = await signDeviceToken(jwtApp, 'dev_xyz');
  assert(jwtApp.jwt.verify(deviceToken).type === 'device', 'device token type=device');

  const { token: sellerToken } = await signSellerToken(jwtApp, 'slr_42');
  assert(jwtApp.jwt.verify(sellerToken).type === 'seller', 'seller token type=seller');

  // verifyTokenOfType enforces type
  const p = await verifyTokenOfType(jwtApp, parentToken, 'parent');
  assert(p.sub === 'p_123', 'verifyTokenOfType: correct type passes');
  let typeMismatchCaught = false;
  try {
    await verifyTokenOfType(jwtApp, parentToken, 'device');
  } catch (e) {
    typeMismatchCaught = e.tokenTypeMismatch === true;
  }
  assert(typeMismatchCaught, 'verifyTokenOfType: wrong type throws tokenTypeMismatch');

  await jwtApp.close();

  // -----------------------------------------------------------------
  section('batch 2: verifyCode utils');
  // -----------------------------------------------------------------
  const vRedis = makeFakeRedis();
  const email = 'test@example.com';

  // generateCode produces 6 digits
  for (let i = 0; i < 20; i++) {
    const c = generateCode();
    if (!/^\d{6}$/.test(c)) {
      assert(false, `generateCode produced non-6-digit: ${c}`);
      break;
    }
  }
  assert(/^\d{6}$/.test(generateCode()), 'generateCode is 6 digits');

  // store + verify success
  await storeCode(vRedis, email, 'register', '123456');
  let peek = await peekCode(vRedis, email, 'register');
  assert(peek?.code === '123456' && peek.attemptsLeft === MAX_ATTEMPTS, 'storeCode writes code + 3 attempts');

  const r1 = await verifyCode(vRedis, email, 'register', '123456');
  assert(r1.ok === true, 'verifyCode: correct code succeeds');
  peek = await peekCode(vRedis, email, 'register');
  assert(peek === null, 'verifyCode: successful use consumes the code');

  // store + 3 wrong attempts → lockout
  await storeCode(vRedis, email, 'login', '999999');
  const w1 = await verifyCode(vRedis, email, 'login', '111111');
  assert(!w1.ok && w1.reason === 'mismatch' && w1.attemptsLeft === 2, 'wrong #1: attemptsLeft=2');
  const w2 = await verifyCode(vRedis, email, 'login', '222222');
  assert(!w2.ok && w2.attemptsLeft === 1, 'wrong #2: attemptsLeft=1');
  const w3 = await verifyCode(vRedis, email, 'login', '333333');
  assert(!w3.ok && w3.attemptsLeft === 0, 'wrong #3: attemptsLeft=0 (locked)');
  peek = await peekCode(vRedis, email, 'login');
  assert(peek === null, 'after 3 wrong attempts, key wiped');

  // expired path
  const r2 = await verifyCode(vRedis, email, 'login', 'xxxxxx');
  assert(!r2.ok && r2.reason === 'expired', 'verifyCode: no key → expired');

  // cooldown / hourly
  let gate = await checkSendAllowed(vRedis, email);
  assert(gate.allowed, 'send allowed initially');
  await markSent(vRedis, email);
  gate = await checkSendAllowed(vRedis, email);
  assert(!gate.allowed && gate.reason === 'cooldown', 'immediate resend blocked by cooldown');
  assert(gate.retryAfter > 0 && gate.retryAfter <= SEND_COOLDOWN_SECONDS, 'cooldown retryAfter within window');

  // Simulate 3 hourly sends (bypass cooldown by using different email)
  const email2 = 'hourly@example.com';
  await markSent(vRedis, email2);
  await markSent(vRedis, email2);
  await markSent(vRedis, email2);
  // Clear cooldown to isolate hourly check
  await vRedis.del('auth:verify:cooldown:hourly@example.com');
  gate = await checkSendAllowed(vRedis, email2);
  assert(!gate.allowed && gate.reason === 'hourly', '4th send in an hour blocked');

  // resetForEmail wipes state
  await resetForEmail(vRedis, email2);
  await vRedis.del('auth:verify:cooldown:hourly@example.com'); // re-clear just in case
  gate = await checkSendAllowed(vRedis, email2);
  assert(gate.allowed, 'resetForEmail restores allowance');

  // -----------------------------------------------------------------
  section('batch 2: mailer dev-mode');
  // -----------------------------------------------------------------
  _clearTemplateCache();

  // Ensure RESEND_API_KEY is absent so we hit dev mode
  const savedKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  // Capture logger calls
  const warnCalls = [];
  const fakeLogger = { warn: (obj, msg) => warnCalls.push({ obj, msg }) };

  // Capture console.log so we can assert the banner without spamming stdout
  const origConsoleLog = console.log;
  const consoleLines = [];
  console.log = (...args) => { consoleLines.push(args.join(' ')); };

  let mailResult;
  try {
    mailResult = await sendVerifyEmail({
      to: 'mom@example.com',
      code: '823461',
      locale: 'zh',
      purpose: 'register',
      logger: fakeLogger,
    });
  } finally {
    console.log = origConsoleLog;
    if (savedKey !== undefined) process.env.RESEND_API_KEY = savedKey;
  }

  assert(mailResult.sent === 'dev-console', 'dev mode returns sent=dev-console');
  assert(typeof mailResult.messageId === 'string' && mailResult.messageId.startsWith('dev_'),
         'dev messageId starts with dev_');
  assert(warnCalls.length === 1, 'logger.warn called exactly once');
  assert(warnCalls[0].obj?.mailer === 'dev-mode', 'logger obj tagged mailer=dev-mode');
  assert(warnCalls[0].obj?.to === 'mom@example.com', 'logger obj includes to');
  assert(warnCalls[0].obj?.code === '823461', 'logger obj includes code');
  assert(warnCalls[0].obj?.locale === 'zh', 'logger obj includes locale');
  assert(warnCalls[0].obj?.purpose === 'register', 'logger obj includes purpose');
  assert(warnCalls[0].msg.includes('DEV MAIL'), 'logger msg includes DEV MAIL marker');
  assert(warnCalls[0].msg.includes('823461'), 'logger msg includes code');

  const bannerBlob = consoleLines.join('\n');
  assert(bannerBlob.includes('DEV MAIL'), 'console banner includes DEV MAIL');
  assert(bannerBlob.includes('823461'), 'console banner includes code');
  assert(bannerBlob.includes('mom@example.com'), 'console banner includes recipient');

  // Render 4 locales to ensure templates load + substitute
  for (const loc of ['zh', 'en', 'pl', 'ro']) {
    const saveLog = console.log;
    console.log = () => {}; // silence banner
    let r;
    try {
      r = await sendVerifyEmail({
        to: `t@example.com`,
        code: '000001',
        locale: loc,
        purpose: 'login',
        logger: { warn: () => {} },
      });
    } finally {
      console.log = saveLog;
    }
    assert(r.sent === 'dev-console', `mailer render ok for locale=${loc}`);
  }

  // -----------------------------------------------------------------
  section('batch 2: auth plugin authenticator');
  // -----------------------------------------------------------------
  const authApp = await buildAuthApp();

  // Missing token
  let r = await authApp.inject({ method: 'POST', url: '/api/auth/refresh' });
  let b = r.json();
  assert(b.code === 10001, 'missing bearer → TOKEN_EXPIRED 10001');

  // Malformed header
  r = await authApp.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { authorization: 'Basic xxx' },
  });
  b = r.json();
  assert(b.code === 10001, 'non-Bearer → TOKEN_EXPIRED 10001');

  // Wrong-type token
  const { token: devTokenForAuth } = await signDeviceToken(authApp, 'dev_abc');
  r = await authApp.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { authorization: `Bearer ${devTokenForAuth}` },
  });
  b = r.json();
  assert(b.code === 10006, `device token on parent endpoint → 10006 (got ${b.code})`);

  // Create a parent directly then hand-craft a valid parent token
  const newParent = await authApp.prisma.parent.create({
    data: { email: 'alice@example.com', passwordHash: null, locale: 'en' },
  });
  const { token: aliceToken } = await signParentToken(authApp, newParent.id);

  // Valid token → refresh works
  r = await authApp.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { authorization: `Bearer ${aliceToken}` },
  });
  b = r.json();
  assert(b.code === 0, `refresh success (got ${b.code})`);
  assert(typeof b.data?.parentToken === 'string' && b.data.parentToken.split('.').length === 3,
         'refresh returns new parent token');
  assert(typeof b.data?.expiresAt === 'string', 'refresh returns expiresAt ISO');

  // Logout → blacklist → subsequent use → 10010
  r = await authApp.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers: { authorization: `Bearer ${aliceToken}` },
  });
  b = r.json();
  assert(b.code === 0 && b.data === null, 'logout returns {code:0, data:null}');

  r = await authApp.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { authorization: `Bearer ${aliceToken}` },
  });
  b = r.json();
  assert(b.code === 10010, `reuse after logout → TOKEN_REVOKED 10010 (got ${b.code})`);

  await authApp.close();

  // -----------------------------------------------------------------
  section('batch 2: /api/auth/send-code');
  // -----------------------------------------------------------------
  const sendApp = await buildAuthApp();

  // Invalid email
  r = await sendApp.inject({
    method: 'POST',
    url: '/api/auth/send-code',
    payload: { email: 'not-an-email', purpose: 'register', locale: 'en' },
  });
  b = r.json();
  assert(b.code === 10003, `bad email → EMAIL_INVALID 10003 (got ${b.code})`);

  // Invalid purpose
  r = await sendApp.inject({
    method: 'POST',
    url: '/api/auth/send-code',
    payload: { email: 'x@example.com', purpose: 'transfer', locale: 'en' },
  });
  b = r.json();
  assert(b.code === 90002, `bad purpose → PARAM_INVALID 90002 (got ${b.code})`);

  // Happy path (dev-mail)
  delete process.env.RESEND_API_KEY;
  const savedConsoleLog = console.log;
  console.log = () => {}; // silence dev banner
  try {
    r = await sendApp.inject({
      method: 'POST',
      url: '/api/auth/send-code',
      payload: { email: 'Mom@Example.COM', purpose: 'register', locale: 'zh' },
    });
  } finally {
    console.log = savedConsoleLog;
  }
  b = r.json();
  assert(b.code === 0, `send-code success (got ${b.code})`);
  assert(b.data?.expiresIn === CODE_TTL_SECONDS, 'expiresIn = 300');
  assert(b.data?.nextRetryAfter === SEND_COOLDOWN_SECONDS, 'nextRetryAfter = 60');

  // Code must exist in Redis under normalized (lowercased, trimmed) key
  const stored = await sendApp.redis.get('auth:verify:mom@example.com:register');
  assert(typeof stored === 'string' && /^\d{6}:3$/.test(stored), 'code stored with 3 attempts, lowercase email key');

  // Immediate re-send → cooldown 90003
  console.log = () => {};
  try {
    r = await sendApp.inject({
      method: 'POST',
      url: '/api/auth/send-code',
      payload: { email: 'mom@example.com', purpose: 'register', locale: 'zh' },
    });
  } finally {
    console.log = savedConsoleLog;
  }
  b = r.json();
  assert(b.code === 90003, `cooldown → RATE_LIMITED 90003 (got ${b.code})`);
  assert(b.details?.reason === 'cooldown', 'details.reason = cooldown');
  assert(typeof b.details?.nextRetryAfter === 'number' && b.details.nextRetryAfter > 0,
         'details.nextRetryAfter > 0');

  await sendApp.close();

  // -----------------------------------------------------------------
  section('batch 2: /api/auth/register');
  // -----------------------------------------------------------------
  const regApp = await buildAuthApp();

  // Pre-seed a verification code so the route can consume it.
  await storeCode(regApp.redis, 'bob@example.com', 'register', '654321');

  // Bad email
  r = await regApp.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'bad', code: '654321', locale: 'en' },
  });
  assert(r.json().code === 10003, 'register: bad email → 10003');

  // Wrong code
  r = await regApp.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'bob@example.com', code: '000000', locale: 'en' },
  });
  b = r.json();
  assert(b.code === 10002, `register: wrong code → 10002 (got ${b.code})`);
  assert(b.details?.attemptsLeft === 2, 'register: attemptsLeft shown');

  // Weak password
  r = await regApp.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email: 'bob@example.com', code: '654321',
      password: 'short', locale: 'en',
    },
  });
  b = r.json();
  assert(b.code === 10009, `register: weak password → 10009 (got ${b.code})`);

  // Re-seed code since previous attempt didn't consume it (bad code was the
  // failure path above, but weak-password path DID consume the code).
  await storeCode(regApp.redis, 'bob@example.com', 'register', '777777');

  // Happy path (no password) — batch 2: device field = null
  r = await regApp.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email: 'BOB@example.com', code: '777777',
      // deviceId / activationCode accepted but ignored in batch 2
      deviceId: 'tv_fake_abc', activationCode: 'AC1234',
      locale: 'en',
    },
  });
  b = r.json();
  assert(b.code === 0, `register success (got ${b.code}, msg=${b.message})`);
  assert(typeof b.data?.parentToken === 'string', 'register returns parentToken');
  assert(b.data?.parent?.email === 'bob@example.com', 'register normalizes email');
  assert(b.data?.parent?.activated === false, 'register: activated=false (batch 2 no device binding)');
  assert(b.data?.device === null, 'register: device=null (deferred to batch 3)');

  // Second register with same email → 10005
  await storeCode(regApp.redis, 'bob@example.com', 'register', '888888');
  r = await regApp.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email: 'bob@example.com', code: '888888', locale: 'en',
    },
  });
  b = r.json();
  assert(b.code === 10005, `register: duplicate email → 10005 (got ${b.code})`);

  await regApp.close();

  // -----------------------------------------------------------------
  section('batch 2: /api/auth/login-code');
  // -----------------------------------------------------------------
  const lcApp = await buildAuthApp();
  // Seed parent
  await lcApp.prisma.parent.create({
    data: { email: 'carol@example.com', passwordHash: null, locale: 'en' },
  });
  await storeCode(lcApp.redis, 'carol@example.com', 'login', '111222');

  // Expired / no code
  r = await lcApp.inject({
    method: 'POST',
    url: '/api/auth/login-code',
    payload: { email: 'nocode@example.com', code: '999999' },
  });
  b = r.json();
  assert(b.code === 10004, `login-code: no code → VERIFY_CODE_EXPIRED 10004 (got ${b.code})`);

  // Wrong code
  r = await lcApp.inject({
    method: 'POST',
    url: '/api/auth/login-code',
    payload: { email: 'carol@example.com', code: '000000' },
  });
  b = r.json();
  assert(b.code === 10002, 'login-code: wrong code → 10002');

  // Correct code + unknown parent = 10007 (anti-enumeration)
  await storeCode(lcApp.redis, 'ghost@example.com', 'login', '555666');
  r = await lcApp.inject({
    method: 'POST',
    url: '/api/auth/login-code',
    payload: { email: 'ghost@example.com', code: '555666' },
  });
  b = r.json();
  assert(b.code === 10007, `login-code: ghost email → PASSWORD_WRONG 10007 (got ${b.code})`);

  // Correct code + known parent → success
  await storeCode(lcApp.redis, 'carol@example.com', 'login', '111222');
  r = await lcApp.inject({
    method: 'POST',
    url: '/api/auth/login-code',
    payload: { email: 'carol@example.com', code: '111222' },
  });
  b = r.json();
  assert(b.code === 0, `login-code success (got ${b.code})`);
  assert(typeof b.data?.parentToken === 'string', 'login-code returns token');
  assert(b.data?.parent?.email === 'carol@example.com', 'login-code returns parent');
  assert(b.data?.parent?.subscription === null, 'no subscription yet → null');

  await lcApp.close();

  // -----------------------------------------------------------------
  section('batch 2: /api/auth/login-password');
  // -----------------------------------------------------------------
  const lpApp = await buildAuthApp();
  const davePw = 'DaveSecret99';
  const daveHash = await hashPassword(davePw);
  await lpApp.prisma.parent.create({
    data: { email: 'dave@example.com', passwordHash: daveHash, locale: 'en' },
  });
  await lpApp.prisma.parent.create({
    data: { email: 'eve@example.com', passwordHash: null, locale: 'en' }, // code-only account
  });

  // Unknown email → 10007
  r = await lpApp.inject({
    method: 'POST',
    url: '/api/auth/login-password',
    payload: { email: 'ghost@example.com', password: 'whatever' },
  });
  b = r.json();
  assert(b.code === 10007, `login-password: unknown → 10007 (got ${b.code})`);

  // Eve: password-less account → 10007 (anti-enumeration, NOT PASSWORD_NOT_SET)
  r = await lpApp.inject({
    method: 'POST',
    url: '/api/auth/login-password',
    payload: { email: 'eve@example.com', password: 'whatever' },
  });
  b = r.json();
  assert(b.code === 10007, `login-password: no-password account → 10007 (got ${b.code})`);

  // Dave: wrong password → 10007 + attemptsLeft
  r = await lpApp.inject({
    method: 'POST',
    url: '/api/auth/login-password',
    payload: { email: 'dave@example.com', password: 'WrongPassword1' },
  });
  b = r.json();
  assert(b.code === 10007, `login-password: wrong → 10007 (got ${b.code})`);
  assert(b.details?.attemptsLeft === 4, `attemptsLeft=4 (got ${b.details?.attemptsLeft})`);

  // 4 more wrongs → lock on the 5th
  for (let i = 0; i < 4; i++) {
    r = await lpApp.inject({
      method: 'POST',
      url: '/api/auth/login-password',
      payload: { email: 'dave@example.com', password: 'StillWrong1' },
    });
  }
  b = r.json();
  assert(b.code === 10008, `5th wrong → ACCOUNT_LOCKED 10008 (got ${b.code})`);
  assert(typeof b.details?.unlockAt === 'string', 'lockout returns unlockAt');

  // Even correct password now → still locked
  r = await lpApp.inject({
    method: 'POST',
    url: '/api/auth/login-password',
    payload: { email: 'dave@example.com', password: davePw },
  });
  b = r.json();
  assert(b.code === 10008, 'locked account rejects even correct password');

  // Manually clear lockout, login succeeds
  const daveRec = await lpApp.prisma.parent.findUnique({ where: { email: 'dave@example.com' } });
  await lpApp.prisma.parent.update({
    where: { id: daveRec.id },
    data: { lockedUntil: null, failedLoginCount: 0 },
  });
  r = await lpApp.inject({
    method: 'POST',
    url: '/api/auth/login-password',
    payload: { email: 'dave@example.com', password: davePw },
  });
  b = r.json();
  assert(b.code === 0, `unlock + correct pw → 0 (got ${b.code})`);
  assert(typeof b.data?.parentToken === 'string', 'login-password returns token');

  await lpApp.close();
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});

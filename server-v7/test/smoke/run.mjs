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

  // -----------------------------------------------------------------
  console.log(`\n==================`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('✅ All batch 1 smoke assertions green\n');
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});

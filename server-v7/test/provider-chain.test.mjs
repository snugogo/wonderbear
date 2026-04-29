// ============================================================================
// Unit tests for src/lib/provider-chain.js
//
// Workorder: 2026-04-29-asr-tts-dual-provider §5.1
//
// Coverage:
//   1. provider 1 success → returns immediately, attempts list = 1 entry
//   2. provider 1 timeout → falls back to provider 2 → returns p2 result
//   3. provider 1 5xx     → falls back to provider 2
//   4. provider 1 client-error (400) → DOES NOT fall back, rethrows
//   5. all providers fail → throws aggregate "all providers failed: ..."
//
// No network is touched; provider fns are inline JS stubs.
// ============================================================================

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://x:x@localhost:5432/x';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  'test_dummy_jwt_secret_at_least_32_bytes_long_abc123';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { callWithFallback, ProviderError } = await import(
  '../src/lib/provider-chain.js'
);

// Silent logger so test output stays clean.
const silent = { info() {}, warn() {} };

test('callWithFallback: provider 1 succeeds → returns p1 result', async () => {
  const providers = [
    { name: 'p1', fn: async () => 'P1_OK' },
    { name: 'p2', fn: async () => assert.fail('p2 should not be called') },
  ];
  const out = await callWithFallback(providers, {}, { kind: 'test', logger: silent });
  assert.equal(out.result, 'P1_OK');
  assert.equal(out.provider, 'p1');
  assert.equal(out.attempts.length, 1);
  assert.equal(out.attempts[0].ok, true);
});

test('callWithFallback: provider 1 timeout → fallback to p2', async () => {
  const providers = [
    {
      name: 'slow',
      timeout: 50,
      // Promise that never resolves; the AbortSignal causes a clean reject.
      fn: (_args, signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason || new Error('aborted')));
        }),
    },
    { name: 'fast', fn: async () => 'FAST_OK' },
  ];
  const out = await callWithFallback(providers, {}, {
    kind: 'test',
    logger: silent,
    defaultTimeoutMs: 1000,
  });
  assert.equal(out.result, 'FAST_OK');
  assert.equal(out.provider, 'fast');
  assert.equal(out.attempts.length, 2);
  assert.equal(out.attempts[0].ok, false);
  assert.equal(out.attempts[1].ok, true);
});

test('callWithFallback: provider 1 5xx → fallback to p2', async () => {
  const providers = [
    {
      name: 'broken',
      fn: async () => {
        throw new ProviderError('upstream 503', { status: 503, provider: 'broken' });
      },
    },
    { name: 'backup', fn: async () => 'BACKUP_OK' },
  ];
  const out = await callWithFallback(providers, {}, { kind: 'test', logger: silent });
  assert.equal(out.result, 'BACKUP_OK');
  assert.equal(out.provider, 'backup');
  assert.equal(out.attempts[0].status, 503);
});

test('callWithFallback: provider 1 401 → fallback (auth-failures should chain)', async () => {
  const providers = [
    {
      name: 'no-auth',
      fn: async () => {
        throw new ProviderError('bad key', { status: 401, provider: 'no-auth' });
      },
    },
    { name: 'good', fn: async () => 'GOOD_OK' },
  ];
  const out = await callWithFallback(providers, {}, { kind: 'test', logger: silent });
  assert.equal(out.result, 'GOOD_OK');
  assert.equal(out.attempts[0].status, 401);
});

test('callWithFallback: provider 1 400 client error → NO fallback, rethrows', async () => {
  let p2Called = false;
  const providers = [
    {
      name: 'badreq',
      fn: async () => {
        throw new ProviderError('invalid audio format', {
          status: 400,
          provider: 'badreq',
        });
      },
    },
    {
      name: 'unused',
      fn: async () => {
        p2Called = true;
        return 'UNUSED';
      },
    },
  ];
  await assert.rejects(
    callWithFallback(providers, {}, { kind: 'test', logger: silent }),
    (err) => err instanceof ProviderError && err.status === 400,
  );
  assert.equal(p2Called, false, 'p2 must not be called on 400');
});

test('callWithFallback: all providers fail → aggregate error with attempts history', async () => {
  const providers = [
    {
      name: 'p1',
      fn: async () => {
        throw new ProviderError('p1 boom', { status: 502, provider: 'p1' });
      },
    },
    {
      name: 'p2',
      fn: async () => {
        throw new ProviderError('p2 boom', { status: 502, provider: 'p2' });
      },
    },
  ];
  await assert.rejects(
    callWithFallback(providers, {}, { kind: 'test', logger: silent }),
    (err) => {
      assert.match(err.message, /all providers failed/);
      assert.ok(Array.isArray(err.attempts));
      assert.equal(err.attempts.length, 2);
      assert.equal(err.attempts[0].provider, 'p1');
      assert.equal(err.attempts[1].provider, 'p2');
      return true;
    },
  );
});

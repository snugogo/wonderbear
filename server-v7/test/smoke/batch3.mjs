// ============================================================================
// Batch 3 smoke tests — device / child / parent modules per API_CONTRACT §五 / §六 / §六bis
//
// Reuses the Fastify plumbing from run.mjs but brings its own richer fake
// Prisma (Device / Child / ActivationCode / Subscription tables + $transaction)
// and fake Redis (adds lrange / rpush / lrem list commands for the device
// command queue).
//
// Exports runBatch3Tests({ assert, section }) — run.mjs wires in the global
// passed/failed counters by passing its own assert/section.
// ============================================================================

import Fastify from 'fastify';
import { ErrorCodes } from '../../src/utils/errorCodes.js';
import requestIdPlugin from '../../src/plugins/requestId.js';
import responseEnvelopePlugin from '../../src/plugins/responseEnvelope.js';
import errorHandlerPlugin from '../../src/plugins/errorHandler.js';
import authPlugin from '../../src/plugins/auth.js';
import deviceRoutes from '../../src/routes/device.js';
import childRoutes from '../../src/routes/child.js';
import parentRoutes from '../../src/routes/parent.js';
import { signParentToken, signDeviceToken } from '../../src/utils/jwt.js';
import { storeCode } from '../../src/utils/verifyCode.js';
import { hashPassword } from '../../src/utils/password.js';

// ---------------------------------------------------------------------------
// Fake Redis — extends batch 2 surface with list ops for command queue.
// ---------------------------------------------------------------------------
function makeFakeRedisV3() {
  const strings = new Map(); // key -> { value, expiresAt }
  const lists = new Map();   // key -> { items: string[], expiresAt }
  const now = () => Date.now();

  function cleanupString(k) {
    const e = strings.get(k);
    if (e && e.expiresAt != null && e.expiresAt <= now()) strings.delete(k);
  }
  function cleanupList(k) {
    const e = lists.get(k);
    if (e && e.expiresAt != null && e.expiresAt <= now()) lists.delete(k);
  }

  return {
    async get(k) {
      cleanupString(k);
      return strings.get(k)?.value ?? null;
    },
    async set(k, v) {
      strings.set(k, { value: String(v), expiresAt: null });
      return 'OK';
    },
    async setex(k, ttl, v) {
      strings.set(k, { value: String(v), expiresAt: now() + ttl * 1000 });
      return 'OK';
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) {
        if (strings.delete(k)) n++;
        if (lists.delete(k)) n++;
      }
      return n;
    },
    async expire(k, ttl) {
      const se = strings.get(k);
      if (se) { se.expiresAt = now() + ttl * 1000; return 1; }
      const le = lists.get(k);
      if (le) { le.expiresAt = now() + ttl * 1000; return 1; }
      return 0;
    },
    async ttl(k) {
      cleanupString(k); cleanupList(k);
      const e = strings.get(k) ?? lists.get(k);
      if (!e) return -2;
      if (e.expiresAt == null) return -1;
      return Math.max(0, Math.ceil((e.expiresAt - now()) / 1000));
    },
    async incr(k) {
      cleanupString(k);
      const e = strings.get(k);
      const next = (e ? parseInt(e.value, 10) : 0) + 1;
      strings.set(k, { value: String(next), expiresAt: e?.expiresAt ?? null });
      return next;
    },
    // List ops for device:commands:*
    async rpush(k, ...values) {
      cleanupList(k);
      const e = lists.get(k) ?? { items: [], expiresAt: null };
      for (const v of values) e.items.push(String(v));
      lists.set(k, e);
      return e.items.length;
    },
    async lrange(k, start, stop) {
      cleanupList(k);
      const e = lists.get(k);
      if (!e) return [];
      const len = e.items.length;
      let s = start < 0 ? Math.max(0, len + start) : Math.min(start, len);
      let e2 = stop < 0 ? len + stop : Math.min(stop, len - 1);
      if (e2 < s) return [];
      return e.items.slice(s, e2 + 1);
    },
    async lrem(k, count, value) {
      cleanupList(k);
      const e = lists.get(k);
      if (!e) return 0;
      const target = String(value);
      let removed = 0;
      if (count >= 0) {
        for (let i = 0; i < e.items.length && (count === 0 || removed < count); ) {
          if (e.items[i] === target) { e.items.splice(i, 1); removed++; }
          else i++;
        }
      } else {
        for (let i = e.items.length - 1; i >= 0 && removed < -count; i--) {
          if (e.items[i] === target) { e.items.splice(i, 1); removed++; }
        }
      }
      if (e.items.length === 0) lists.delete(k);
      return removed;
    },
    async ping() { return 'PONG'; },
  };
}

// ---------------------------------------------------------------------------
// Fake Prisma — supports Parent/Device/Child/ActivationCode/Subscription/Story
// plus a simple $transaction(fn) that passes `this` back as the tx.
// ---------------------------------------------------------------------------
function makeFakePrismaV3() {
  const parents = new Map();          // id -> parent
  const parentsByEmail = new Map();
  const devices = new Map();          // id -> device (cuid)
  const devicesByDeviceId = new Map();
  const children = new Map();
  const activationCodes = new Map();
  const activationCodesByCode = new Map();
  const subscriptions = new Map();
  const stories = new Map();
  let counter = 0;
  const cuid = (prefix = 'cm') => `${prefix}_${++counter}_${Math.random().toString(36).slice(2, 8)}`;

  function hydrateDevice(d, include) {
    const out = { ...d };
    if (!include) return out;
    if (include.oemConfig) out.oemConfig = null; // no OEM in tests
    if (include.parent) {
      out.parent = d.parentId ? parents.get(d.parentId) ?? null : null;
    }
    if (include.activeChild) {
      out.activeChild = d.activeChildId ? children.get(d.activeChildId) ?? null : null;
    }
    if (include.activationCodeRef) {
      out.activationCodeRef = d.activationCodeId ? activationCodes.get(d.activationCodeId) ?? null : null;
    }
    // Nested parent.children
    if (include.parent && typeof include.parent === 'object' && include.parent.include?.children) {
      const p = out.parent;
      if (p) p.children = Array.from(children.values()).filter(c => c.parentId === p.id);
    }
    return out;
  }

  function hydrateParent(p, include) {
    const out = { ...p };
    if (!include) return out;
    if (include.devices) {
      out.devices = Array.from(devices.values()).filter(d => d.parentId === p.id);
      if (typeof include.devices === 'object' && include.devices.orderBy?.boundAt === 'desc') {
        out.devices.sort((a, b) => (b.boundAt?.getTime() ?? 0) - (a.boundAt?.getTime() ?? 0));
      }
    }
    if (include.children) {
      out.children = Array.from(children.values()).filter(c => c.parentId === p.id);
      if (typeof include.children === 'object' && include.children.orderBy?.createdAt === 'asc') {
        out.children.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
    }
    if (include.subscription) {
      out.subscription = Array.from(subscriptions.values()).find(s => s.parentId === p.id) ?? null;
    }
    return out;
  }

  const api = {
    parent: {
      async findUnique({ where, include }) {
        let p = null;
        if (where?.id) p = parents.get(where.id) ?? null;
        else if (where?.email) {
          const id = parentsByEmail.get(where.email);
          p = id ? parents.get(id) : null;
        }
        return p ? hydrateParent(p, include) : null;
      },
      async create({ data }) {
        const id = cuid('par');
        const p = {
          id,
          email: data.email,
          passwordHash: data.passwordHash ?? null,
          locale: data.locale ?? 'en',
          playBgm: data.playBgm ?? true,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        parents.set(id, p);
        parentsByEmail.set(p.email, id);
        return p;
      },
      async update({ where, data, include }) {
        const p = parents.get(where.id);
        if (!p) throw new Error('parent not found');
        Object.assign(p, data, { updatedAt: new Date() });
        return hydrateParent(p, include);
      },
    },

    device: {
      async findUnique({ where, include }) {
        let d = null;
        if (where?.id) d = devices.get(where.id) ?? null;
        else if (where?.deviceId) {
          const id = devicesByDeviceId.get(where.deviceId);
          d = id ? devices.get(id) : null;
        }
        return d ? hydrateDevice(d, include) : null;
      },
      async findFirst({ where, include }) {
        for (const d of devices.values()) {
          if (where?.id && d.id !== where.id) continue;
          if (where?.deviceId && d.deviceId !== where.deviceId) continue;
          if (where?.parentId !== undefined && d.parentId !== where.parentId) continue;
          return hydrateDevice(d, include);
        }
        return null;
      },
      async findMany({ where, orderBy }) {
        let list = Array.from(devices.values());
        if (where?.parentId !== undefined) list = list.filter(d => d.parentId === where.parentId);
        if (orderBy?.boundAt === 'desc') {
          list.sort((a, b) => (b.boundAt?.getTime() ?? 0) - (a.boundAt?.getTime() ?? 0));
        }
        return list.map(d => ({ ...d }));
      },
      async count({ where }) {
        let n = 0;
        for (const d of devices.values()) {
          if (where?.parentId !== undefined && d.parentId !== where.parentId) continue;
          n++;
        }
        return n;
      },
      async create({ data, include }) {
        const id = cuid('dev');
        const d = {
          id,
          deviceId: data.deviceId,
          activationCode: data.activationCode ?? null,
          activationCodeId: data.activationCodeId ?? null,
          parentId: data.parentId ?? null,
          activeChildId: data.activeChildId ?? null,
          oemId: data.oemId ?? null,
          batchCode: data.batchCode ?? null,
          status: data.status ?? 'activated_unbound',
          storiesLeft: data.storiesLeft ?? 0,
          model: data.model ?? 'GP15',
          firmwareVer: data.firmwareVer ?? null,
          osVersion: data.osVersion ?? null,
          hwFingerprint: data.hwFingerprint ?? null,
          boundAt: data.boundAt ?? null,
          lastSeenAt: data.lastSeenAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        devices.set(id, d);
        devicesByDeviceId.set(d.deviceId, id);
        return hydrateDevice(d, include);
      },
      async update({ where, data, include }) {
        const d = devices.get(where.id);
        if (!d) throw new Error('device not found');
        Object.assign(d, data, { updatedAt: new Date() });
        return hydrateDevice(d, include);
      },
      async updateMany({ where, data }) {
        let n = 0;
        for (const d of devices.values()) {
          if (where?.activeChildId !== undefined && d.activeChildId !== where.activeChildId) continue;
          Object.assign(d, data, { updatedAt: new Date() });
          n++;
        }
        return { count: n };
      },
    },

    child: {
      async findUnique({ where }) {
        return children.get(where.id) ?? null;
      },
      async findMany({ where, orderBy }) {
        let list = Array.from(children.values());
        if (where?.parentId !== undefined) list = list.filter(c => c.parentId === where.parentId);
        if (orderBy?.createdAt === 'asc') {
          list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        return list.map(c => ({ ...c }));
      },
      async count({ where }) {
        let n = 0;
        for (const c of children.values()) {
          if (where?.parentId !== undefined && c.parentId !== where.parentId) continue;
          n++;
        }
        return n;
      },
      async create({ data }) {
        const id = cuid('chd');
        const c = {
          id,
          parentId: data.parentId,
          name: data.name,
          age: data.age,
          gender: data.gender ?? null,
          avatar: data.avatar ?? '🐻',
          primaryLang: data.primaryLang ?? 'en',
          secondLang: data.secondLang ?? 'none',
          birthday: data.birthday ?? null,
          coins: data.coins ?? 0,
          voiceId: data.voiceId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        children.set(id, c);
        return c;
      },
      async update({ where, data }) {
        const c = children.get(where.id);
        if (!c) throw new Error('child not found');
        Object.assign(c, data, { updatedAt: new Date() });
        return c;
      },
      async delete({ where }) {
        const c = children.get(where.id);
        if (!c) throw new Error('child not found');
        children.delete(where.id);
        return c;
      },
    },

    activationCode: {
      async findUnique({ where }) {
        if (where?.id) return activationCodes.get(where.id) ?? null;
        if (where?.code) {
          const id = activationCodesByCode.get(where.code);
          return id ? activationCodes.get(id) : null;
        }
        return null;
      },
      async update({ where, data }) {
        const c = activationCodes.get(where.id);
        if (!c) throw new Error('activation code not found');
        Object.assign(c, data, { updatedAt: new Date() });
        return c;
      },
    },

    subscription: {
      async findUnique({ where }) {
        if (where?.parentId) {
          return Array.from(subscriptions.values()).find(s => s.parentId === where.parentId) ?? null;
        }
        return null;
      },
    },

    story: {
      async count({ where }) {
        let n = 0;
        for (const s of stories.values()) {
          if (where?.childId && s.childId !== where.childId) continue;
          if (where?.status && s.status !== where.status) continue;
          n++;
        }
        return n;
      },
      async findFirst({ where, orderBy }) {
        let list = Array.from(stories.values());
        if (where?.childId) list = list.filter(s => s.childId === where.childId);
        if (where?.status) list = list.filter(s => s.status === where.status);
        if (orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return list[0] ?? null;
      },
    },

    async $transaction(fn) {
      // Simple sequential tx — no rollback in tests; we just pass `this` back.
      return fn(api);
    },

    async $queryRaw() { return [{ ok: 1 }]; },

    // Test helpers
    _seedActivationCode(partial) {
      const id = cuid('ac');
      const rec = {
        id,
        code: partial.code,
        batchId: partial.batchId ?? 'batch-test',
        sellerId: partial.sellerId ?? null,
        oemId: partial.oemId ?? null,
        status: partial.status ?? 'issued',
        usedByDeviceId: partial.usedByDeviceId ?? null,
        bonusMonths: partial.bonusMonths ?? 0,
        revokedReason: partial.revokedReason ?? null,
        activatedAt: partial.activatedAt ?? null,
        transferredAt: partial.transferredAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      activationCodes.set(id, rec);
      activationCodesByCode.set(rec.code, id);
      return rec;
    },
    _seedParent(email, opts = {}) {
      const id = cuid('par');
      const rec = {
        id,
        email,
        passwordHash: opts.passwordHash ?? null,
        locale: opts.locale ?? 'en',
        playBgm: opts.playBgm ?? true,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      parents.set(id, rec);
      parentsByEmail.set(email, id);
      return rec;
    },
  };
  return api;
}

// ---------------------------------------------------------------------------
// Build a Fastify app with device + child + parent routes wired in.
// ---------------------------------------------------------------------------
async function buildBatch3App() {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makeFakePrismaV3());
  app.decorate('redis', makeFakeRedisV3());

  await app.register(requestIdPlugin);
  await app.register(responseEnvelopePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);
  await app.register(deviceRoutes);
  await app.register(childRoutes);
  await app.register(parentRoutes);

  return app;
}

const VALID_DEVICE_ID = 'GP15-SN-A1B2C3D4';
const VALID_ACTIVATION_CODE = 'WB12345';

// ---------------------------------------------------------------------------
// Main entry — called from run.mjs
// ---------------------------------------------------------------------------
export async function runBatch3Tests({ assert, section }) {
  // =================================================================
  section('batch 3: POST /api/device/register');
  // =================================================================
  {
    const app = await buildBatch3App();
    app.prisma._seedActivationCode({ code: VALID_ACTIVATION_CODE });

    // Invalid deviceId format
    let r = await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: 'bad', activationCode: VALID_ACTIVATION_CODE },
    });
    let b = r.json();
    assert(b.code === 20007, `register: short deviceId → DEVICE_ID_FORMAT_INVALID 20007 (got ${b.code})`);

    // Invalid activation code format
    r = await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: VALID_DEVICE_ID, activationCode: '!!!' },
    });
    b = r.json();
    assert(b.code === 20002, `register: bad code format → ACTIVATION_CODE_INVALID 20002 (got ${b.code})`);

    // Unknown activation code
    r = await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: VALID_DEVICE_ID, activationCode: 'ZZ99999' },
    });
    b = r.json();
    assert(b.code === 20002, `register: unknown code → 20002 (got ${b.code})`);

    // Happy path — new device
    r = await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: {
        deviceId: VALID_DEVICE_ID,
        activationCode: VALID_ACTIVATION_CODE,
        model: 'GP15',
        firmwareVer: '1.0.0',
      },
    });
    b = r.json();
    assert(b.code === 0, `register: success (got ${b.code})`);
    assert(typeof b.data?.deviceToken === 'string' && b.data.deviceToken.split('.').length === 3,
           'register: returns valid deviceToken');
    assert(b.data?.device?.deviceId === VALID_DEVICE_ID, 'register: echo deviceId');
    assert(b.data?.device?.status === 'activated_unbound', 'register: status activated_unbound');
    assert(b.data?.device?.storiesLeft === 0, 'register: storiesLeft=0 (granted on bind)');
    assert(b.data?.oemConfig === null, 'register: no OEM → oemConfig=null');
    assert(typeof b.data?.tokenExpiresAt === 'string', 'register: tokenExpiresAt ISO');

    // Same deviceId + same code → existing device path (fresh token)
    r = await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });
    b = r.json();
    assert(b.code === 0, 'register: existing device re-register → success');
    assert(typeof b.data?.deviceToken === 'string', 'register: existing returns new token');

    // Different device using same code → ACTIVATION_CODE_USED
    r = await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: 'GP15-OTHER_7890123', activationCode: VALID_ACTIVATION_CODE },
    });
    b = r.json();
    assert(b.code === 20004, `register: other device with used code → 20004 (got ${b.code})`);

    // Revoked code
    app.prisma._seedActivationCode({ code: 'REV99', status: 'revoked' });
    r = await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: 'GP15-NEW-ABCDEF12', activationCode: 'REV99' },
    });
    b = r.json();
    assert(b.code === 20002, `register: revoked code → 20002 (got ${b.code})`);

    await app.close();
  }

  // =================================================================
  section('batch 3: GET /api/device/status');
  // =================================================================
  {
    const app = await buildBatch3App();
    app.prisma._seedActivationCode({ code: VALID_ACTIVATION_CODE });

    // Create device
    const reg = await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });
    const deviceToken = reg.json().data.deviceToken;

    // No auth
    let r = await app.inject({ method: 'GET', url: '/api/device/status' });
    let b = r.json();
    assert(b.code === 10001, `status: no token → 10001 (got ${b.code})`);

    // Wrong type (parent token)
    const par = app.prisma._seedParent('p1@example.com');
    const { token: parentToken } = await signParentToken(app, par.id);
    r = await app.inject({
      method: 'GET', url: '/api/device/status',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.code === 10006, `status: parent token on device endpoint → 10006 (got ${b.code})`);

    // Valid device token
    r = await app.inject({
      method: 'GET', url: '/api/device/status',
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    b = r.json();
    assert(b.code === 0, `status: success (got ${b.code})`);
    assert(b.data?.status === 'activated_unbound', 'status: activated_unbound');
    assert(b.data?.parent === null, 'status: no parent yet');
    assert(b.data?.activeChild === null, 'status: no activeChild yet');

    await app.close();
  }

  // =================================================================
  section('batch 3: POST /api/device/bind');
  // =================================================================
  {
    const app = await buildBatch3App();
    app.prisma._seedActivationCode({ code: VALID_ACTIVATION_CODE });

    // Register device first
    await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });

    // Create parent
    const par = app.prisma._seedParent('parent@example.com');
    const { token: parentToken } = await signParentToken(app, par.id);

    // No parent token
    let r = await app.inject({
      method: 'POST', url: '/api/device/bind',
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });
    let b = r.json();
    assert(b.code === 10001, `bind: no token → 10001 (got ${b.code})`);

    // Bad deviceId format
    r = await app.inject({
      method: 'POST', url: '/api/device/bind',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: 'x', activationCode: VALID_ACTIVATION_CODE },
    });
    b = r.json();
    assert(b.code === 20007, `bind: bad deviceId → 20007 (got ${b.code})`);

    // Unknown device
    r = await app.inject({
      method: 'POST', url: '/api/device/bind',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: 'GP15-UNKNOWN-XYZZZZZZ', activationCode: VALID_ACTIVATION_CODE },
    });
    b = r.json();
    assert(b.code === 20005, `bind: unknown device → 20005 (got ${b.code})`);

    // Wrong activation code
    r = await app.inject({
      method: 'POST', url: '/api/device/bind',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: VALID_DEVICE_ID, activationCode: 'WRONG99' },
    });
    b = r.json();
    assert(b.code === 20002, `bind: wrong code → 20002 (got ${b.code})`);

    // Happy path — first bind grants 6 stories
    r = await app.inject({
      method: 'POST', url: '/api/device/bind',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });
    b = r.json();
    assert(b.code === 0, `bind: first bind success (got ${b.code})`);
    assert(b.data?.device?.status === 'bound', 'bind: status=bound');
    assert(b.data?.device?.storiesLeft === 6, `bind: storiesLeft=6 on first bind (got ${b.data?.device?.storiesLeft})`);
    assert(typeof b.data?.device?.boundAt === 'string', 'bind: boundAt ISO set');
    assert(b.data?.activatedQuota === true, 'bind: activatedQuota=true for first bind');

    // Already bound to another parent (without forceOverride)
    const otherPar = app.prisma._seedParent('other@example.com');
    const { token: otherToken } = await signParentToken(app, otherPar.id);
    r = await app.inject({
      method: 'POST', url: '/api/device/bind',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });
    b = r.json();
    assert(b.code === 20003, `bind: already bound to other → 20003 (got ${b.code})`);

    // MAX_DEVICES_REACHED path
    // Seed 4 devices already bound to otherPar
    for (let i = 0; i < 4; i++) {
      const code = `CODE${i}00`;
      const devId = `GP15-BULK-${i}0000000`;
      app.prisma._seedActivationCode({ code });
      await app.inject({
        method: 'POST', url: '/api/device/register',
        payload: { deviceId: devId, activationCode: code },
      });
      await app.inject({
        method: 'POST', url: '/api/device/bind',
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { deviceId: devId, activationCode: code },
      });
    }
    // 5th bind attempt
    app.prisma._seedActivationCode({ code: 'EXTRA5' });
    await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: 'GP15-BULK-XTRA5555', activationCode: 'EXTRA5' },
    });
    r = await app.inject({
      method: 'POST', url: '/api/device/bind',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { deviceId: 'GP15-BULK-XTRA5555', activationCode: 'EXTRA5' },
    });
    b = r.json();
    assert(b.code === 20008, `bind: 5th device → MAX_DEVICES_REACHED 20008 (got ${b.code})`);

    await app.close();
  }

  // =================================================================
  section('batch 3: POST /api/device/unbind');
  // =================================================================
  {
    const app = await buildBatch3App();
    app.prisma._seedActivationCode({ code: VALID_ACTIVATION_CODE });

    await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });
    const par = app.prisma._seedParent('unbind@example.com');
    const { token: parentToken } = await signParentToken(app, par.id);

    await app.inject({
      method: 'POST', url: '/api/device/bind',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });

    // Missing confirmCode
    let r = await app.inject({
      method: 'POST', url: '/api/device/unbind',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: VALID_DEVICE_ID },
    });
    let b = r.json();
    assert(b.code === 90001, `unbind: missing confirmCode → 90001 (got ${b.code})`);

    // Wrong verification code
    r = await app.inject({
      method: 'POST', url: '/api/device/unbind',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: VALID_DEVICE_ID, confirmCode: '000000' },
    });
    b = r.json();
    assert(b.code === 10002, `unbind: wrong verify code → 10002 (got ${b.code})`);

    // Happy path: seed code then unbind
    await storeCode(app.redis, 'unbind@example.com', 'login', '654321');
    r = await app.inject({
      method: 'POST', url: '/api/device/unbind',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: VALID_DEVICE_ID, confirmCode: '654321' },
    });
    b = r.json();
    assert(b.code === 0, `unbind: success (got ${b.code})`);
    assert(b.data?.status === 'unbound_transferable', 'unbind: status=unbound_transferable');
    assert(b.data?.deviceId === VALID_DEVICE_ID, 'unbind: deviceId echoed');

    await app.close();
  }

  // =================================================================
  section('batch 3: POST /api/device/heartbeat + ack-command + reboot');
  // =================================================================
  {
    const app = await buildBatch3App();
    app.prisma._seedActivationCode({ code: VALID_ACTIVATION_CODE });

    const reg = await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });
    const deviceToken = reg.json().data.deviceToken;
    const par = app.prisma._seedParent('hb@example.com');
    const { token: parentToken } = await signParentToken(app, par.id);
    await app.inject({
      method: 'POST', url: '/api/device/bind',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });

    // heartbeat with no pending commands
    let r = await app.inject({
      method: 'POST', url: '/api/device/heartbeat',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { currentScreen: 'home', memoryUsageMb: 128 },
    });
    let b = r.json();
    assert(b.code === 0, `heartbeat: success (got ${b.code})`);
    assert(Array.isArray(b.data?.pendingCommands) && b.data.pendingCommands.length === 0,
           'heartbeat: empty command queue');
    assert(typeof b.data?.serverTime === 'string', 'heartbeat: serverTime ISO');

    // Issue reboot command via parent
    const devList = await app.inject({
      method: 'GET', url: '/api/device/list',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const deviceRowId = devList.json().data.items[0].id;

    r = await app.inject({
      method: 'POST', url: `/api/device/${deviceRowId}/reboot`,
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.code === 0, `reboot: success (got ${b.code})`);
    assert(typeof b.data?.commandId === 'string', 'reboot: returns commandId');
    assert(typeof b.data?.willExecuteWithin === 'number', 'reboot: willExecuteWithin seconds');
    const issuedCommandId = b.data.commandId;

    // Next heartbeat picks the command up
    r = await app.inject({
      method: 'POST', url: '/api/device/heartbeat',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: {},
    });
    b = r.json();
    assert(Array.isArray(b.data?.pendingCommands) && b.data.pendingCommands.length === 1,
           'heartbeat: picks up queued command');
    assert(b.data.pendingCommands[0].type === 'reboot', 'heartbeat: command type=reboot');
    assert(b.data.pendingCommands[0].id === issuedCommandId, 'heartbeat: commandId matches');

    // Ack command
    r = await app.inject({
      method: 'POST', url: `/api/device/ack-command/${issuedCommandId}`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { result: 'ok' },
    });
    b = r.json();
    assert(b.code === 0, `ack-command: success (got ${b.code})`);

    // After ack, queue is empty
    r = await app.inject({
      method: 'POST', url: '/api/device/heartbeat',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: {},
    });
    b = r.json();
    assert(b.data?.pendingCommands.length === 0, 'heartbeat: queue drained after ack');

    // Reboot a device NOT owned by this parent → 20005
    const other = app.prisma._seedParent('stranger@example.com');
    const { token: strangerToken } = await signParentToken(app, other.id);
    r = await app.inject({
      method: 'POST', url: `/api/device/${deviceRowId}/reboot`,
      headers: { authorization: `Bearer ${strangerToken}` },
    });
    b = r.json();
    assert(b.code === 20005, `reboot: stranger parent → 20005 (got ${b.code})`);

    await app.close();
  }

  // =================================================================
  section('batch 3: active-child (GET + POST with parent/device tokens)');
  // =================================================================
  {
    const app = await buildBatch3App();
    app.prisma._seedActivationCode({ code: VALID_ACTIVATION_CODE });

    const reg = await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });
    const deviceToken = reg.json().data.deviceToken;
    const par = app.prisma._seedParent('ac@example.com');
    const { token: parentToken } = await signParentToken(app, par.id);
    await app.inject({
      method: 'POST', url: '/api/device/bind',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });

    // Create a child
    let r = await app.inject({
      method: 'POST', url: '/api/child',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { name: 'Luna', age: 5, primaryLang: 'zh', secondLang: 'en' },
    });
    let b = r.json();
    assert(b.code === 0, `child/create: success (got ${b.code})`);
    assert(b.data?.child?.name === 'Luna', 'child/create: name Luna');
    assert(b.data?.child?.age === 5, 'child/create: age 5');
    const childId = b.data.child.id;

    // GET active-child (device token) — none yet
    r = await app.inject({
      method: 'GET', url: '/api/device/active-child',
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    b = r.json();
    assert(b.code === 0 && b.data?.activeChild === null, 'active-child GET: none yet');
    assert(Array.isArray(b.data?.allChildren) && b.data.allChildren.length === 1,
           'active-child GET: allChildren shows 1');

    // Set active-child via device token (no deviceId in body needed)
    r = await app.inject({
      method: 'POST', url: '/api/device/active-child',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { childId },
    });
    b = r.json();
    assert(b.code === 0, `active-child POST (device): success (got ${b.code})`);
    assert(b.data?.activeChild?.id === childId, 'active-child POST: child set');

    // Set active-child via parent token (requires deviceId)
    // Create a second child
    let r2 = await app.inject({
      method: 'POST', url: '/api/child',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { name: 'Sol', age: 7 },
    });
    const childId2 = r2.json().data.child.id;

    r = await app.inject({
      method: 'POST', url: '/api/device/active-child',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: VALID_DEVICE_ID, childId: childId2 },
    });
    b = r.json();
    assert(b.code === 0, `active-child POST (parent): success (got ${b.code})`);
    assert(b.data?.activeChild?.id === childId2, 'active-child POST (parent): sol selected');

    // Parent token WITHOUT deviceId → PARAM_MISSING
    r = await app.inject({
      method: 'POST', url: '/api/device/active-child',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { childId },
    });
    b = r.json();
    assert(b.code === 90001, `active-child (parent, no deviceId) → 90001 (got ${b.code})`);

    // Missing childId
    r = await app.inject({
      method: 'POST', url: '/api/device/active-child',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: {},
    });
    b = r.json();
    assert(b.code === 90001, `active-child: missing childId → 90001 (got ${b.code})`);

    await app.close();
  }

  // =================================================================
  section('batch 3: GET /api/device/list + refresh-token');
  // =================================================================
  {
    const app = await buildBatch3App();
    const par = app.prisma._seedParent('list@example.com');
    const { token: parentToken } = await signParentToken(app, par.id);

    // Empty list
    let r = await app.inject({
      method: 'GET', url: '/api/device/list',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    let b = r.json();
    assert(b.code === 0, 'device/list: empty success');
    assert(Array.isArray(b.data?.items) && b.data.items.length === 0, 'device/list: empty array');

    // Bind a device
    app.prisma._seedActivationCode({ code: VALID_ACTIVATION_CODE });
    const reg = await app.inject({
      method: 'POST', url: '/api/device/register',
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });
    const deviceToken = reg.json().data.deviceToken;
    await app.inject({
      method: 'POST', url: '/api/device/bind',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { deviceId: VALID_DEVICE_ID, activationCode: VALID_ACTIVATION_CODE },
    });

    r = await app.inject({
      method: 'GET', url: '/api/device/list',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.data?.items.length === 1, 'device/list: 1 after bind');
    assert(b.data.items[0].status === 'bound', 'device/list: status bound');
    assert(b.data.items[0].storiesLeft === 6, 'device/list: storiesLeft 6');
    assert(typeof b.data.items[0].online === 'boolean', 'device/list: online flag');

    // refresh-token
    r = await app.inject({
      method: 'POST', url: '/api/device/refresh-token',
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    b = r.json();
    assert(b.code === 0, 'refresh-token: success');
    assert(typeof b.data?.deviceToken === 'string' && b.data.deviceToken.split('.').length === 3,
           'refresh-token: new jwt');

    await app.close();
  }

  // =================================================================
  section('batch 3: POST/PATCH/DELETE /api/child');
  // =================================================================
  {
    const app = await buildBatch3App();
    const par = app.prisma._seedParent('kids@example.com');
    const { token: parentToken } = await signParentToken(app, par.id);

    // Missing name
    let r = await app.inject({
      method: 'POST', url: '/api/child',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { age: 5 },
    });
    let b = r.json();
    assert(b.code === 90001, `child create: missing name → 90001 (got ${b.code})`);

    // Age out of range
    r = await app.inject({
      method: 'POST', url: '/api/child',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { name: 'Too Young', age: 2 },
    });
    b = r.json();
    assert(b.code === 90002, `child create: age<3 → 90002 (got ${b.code})`);

    // Invalid primaryLang
    r = await app.inject({
      method: 'POST', url: '/api/child',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { name: 'LangKid', age: 5, primaryLang: 'xx' },
    });
    b = r.json();
    assert(b.code === 90002, `child create: bad primaryLang → 90002 (got ${b.code})`);

    // Happy path
    r = await app.inject({
      method: 'POST', url: '/api/child',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { name: '  Bella  ', age: 4, gender: 'female', primaryLang: 'en', secondLang: 'zh' },
    });
    b = r.json();
    assert(r.statusCode === 201, `child create: HTTP 201 (got ${r.statusCode})`);
    assert(b.code === 0, 'child create: success');
    assert(b.data?.child?.name === 'Bella', 'child create: name trimmed');
    assert(b.data?.child?.gender === 'female', 'child create: gender female');
    const bellaId = b.data.child.id;

    // 3 more (to reach max 4)
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST', url: '/api/child',
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { name: `Kid${i}`, age: 5 },
      });
    }
    // 5th → MAX_CHILDREN_REACHED
    r = await app.inject({
      method: 'POST', url: '/api/child',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { name: 'Five', age: 5 },
    });
    b = r.json();
    assert(b.code === 30010, `child create: max → 30010 (got ${b.code})`);

    // PATCH Bella
    r = await app.inject({
      method: 'PATCH', url: `/api/child/${bellaId}`,
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { age: 6, avatar: 'avatar_bear_crown' },
    });
    b = r.json();
    assert(b.code === 0, 'child patch: success');
    assert(b.data?.child?.age === 6, 'child patch: age updated');
    assert(b.data?.child?.avatar === 'avatar_bear_crown', 'child patch: avatar');

    // PATCH other parent's child → 30009
    const other = app.prisma._seedParent('other2@example.com');
    const { token: otherToken } = await signParentToken(app, other.id);
    r = await app.inject({
      method: 'PATCH', url: `/api/child/${bellaId}`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { age: 3 },
    });
    b = r.json();
    assert(b.code === 30009, `child patch: other parent → 30009 (got ${b.code})`);

    // GET /api/child/list
    r = await app.inject({
      method: 'GET', url: '/api/child/list',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.code === 0, 'child list: success');
    assert(b.data?.items.length === 4, 'child list: 4 items');
    assert(b.data?.total === 4, 'child list: total 4');
    assert(b.data?.maxAllowed === 4, 'child list: maxAllowed 4');

    // GET /api/child/:id (parent token path)
    r = await app.inject({
      method: 'GET', url: `/api/child/${bellaId}`,
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.code === 0, 'child get: success');
    assert(b.data?.child?.name === 'Bella', 'child get: name Bella');
    assert(b.data?.storiesCount === 0, 'child get: storiesCount 0');
    assert(b.data?.lastStoryAt === null, 'child get: no stories yet');

    // DELETE child
    r = await app.inject({
      method: 'DELETE', url: `/api/child/${bellaId}`,
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.code === 0, 'child delete: success');
    assert(b.data?.deleted === true, 'child delete: deleted=true');

    // After delete, list is 3
    r = await app.inject({
      method: 'GET', url: '/api/child/list',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.data?.items.length === 3, 'child list: 3 after delete');

    // DELETE non-existent → 30009
    r = await app.inject({
      method: 'DELETE', url: '/api/child/nonexistent',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.code === 30009, `child delete non-existent → 30009 (got ${b.code})`);

    await app.close();
  }

  // =================================================================
  section('batch 3: GET /api/parent/me + PATCH');
  // =================================================================
  {
    const app = await buildBatch3App();
    const pwHash = await hashPassword('InitialPw1');
    const par = app.prisma._seedParent('me@example.com', { passwordHash: pwHash, locale: 'zh' });
    const { token: parentToken } = await signParentToken(app, par.id);

    // GET me
    let r = await app.inject({
      method: 'GET', url: '/api/parent/me',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    let b = r.json();
    assert(b.code === 0, 'parent/me: success');
    assert(b.data?.parent?.email === 'me@example.com', 'parent/me: email');
    assert(b.data?.parent?.locale === 'zh', 'parent/me: locale zh');
    assert(b.data?.parent?.activated === false, 'parent/me: activated=false (no devices)');
    assert(b.data?.parent?.playBgm === true, 'parent/me: playBgm default true');
    assert(Array.isArray(b.data?.devices) && b.data.devices.length === 0, 'parent/me: empty devices');
    assert(Array.isArray(b.data?.children) && b.data.children.length === 0, 'parent/me: empty children');

    // PATCH locale
    r = await app.inject({
      method: 'PATCH', url: '/api/parent/me',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { locale: 'pl' },
    });
    b = r.json();
    assert(b.code === 0, 'parent/me patch: locale success');
    assert(b.data?.parent?.locale === 'pl', 'parent/me patch: locale=pl');

    // PATCH invalid locale
    r = await app.inject({
      method: 'PATCH', url: '/api/parent/me',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { locale: 'xx' },
    });
    b = r.json();
    assert(b.code === 90002, `parent/me patch: bad locale → 90002 (got ${b.code})`);

    // PATCH playBgm
    r = await app.inject({
      method: 'PATCH', url: '/api/parent/me',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { playBgm: false },
    });
    b = r.json();
    assert(b.code === 0, 'parent/me patch: playBgm success');
    assert(b.data?.parent?.playBgm === false, 'parent/me patch: playBgm=false');

    // PATCH playBgm wrong type
    r = await app.inject({
      method: 'PATCH', url: '/api/parent/me',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { playBgm: 'yes' },
    });
    b = r.json();
    assert(b.code === 90002, `parent/me patch: non-boolean playBgm → 90002 (got ${b.code})`);

    // PATCH password without currentPassword
    r = await app.inject({
      method: 'PATCH', url: '/api/parent/me',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { password: 'NewSecret99' },
    });
    b = r.json();
    assert(b.code === 90001, `parent/me patch: missing currentPassword → 90001 (got ${b.code})`);

    // PATCH password with wrong current
    r = await app.inject({
      method: 'PATCH', url: '/api/parent/me',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { currentPassword: 'WrongOldPw9', password: 'NewSecret99' },
    });
    b = r.json();
    assert(b.code === 10007, `parent/me patch: wrong currentPassword → 10007 (got ${b.code})`);

    // PATCH password too weak
    r = await app.inject({
      method: 'PATCH', url: '/api/parent/me',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { currentPassword: 'InitialPw1', password: 'abc' },
    });
    b = r.json();
    assert(b.code === 10009, `parent/me patch: weak password → 10009 (got ${b.code})`);

    // PATCH password success
    r = await app.inject({
      method: 'PATCH', url: '/api/parent/me',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { currentPassword: 'InitialPw1', password: 'NewStrongPw99' },
    });
    b = r.json();
    assert(b.code === 0, `parent/me patch: password success (got ${b.code})`);

    await app.close();
  }
}

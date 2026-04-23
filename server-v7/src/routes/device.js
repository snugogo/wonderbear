// ============================================================================
// /api/device/* — Device module per API_CONTRACT §五
//
//   POST /api/device/register       — TV first-time activation with code
//   GET  /api/device/status         — TV polls activation/binding status
//   POST /api/device/bind           — Parent H5 binds device
//   POST /api/device/unbind         — Parent H5 unbinds device (transfer)
//   POST /api/device/heartbeat      — TV heartbeat (every 5 min)
//   POST /api/device/ack-command/:id — TV acknowledges command execution
//   GET  /api/device/active-child   — Get active child for device
//   POST /api/device/active-child   — Set active child for device
//   POST /api/device/:id/reboot     — Parent remote reboot
//   GET  /api/device/list           — Parent's device list
//   POST /api/device/refresh-token  — Refresh device token
//
// Batch 3 scope:
//   - Device.storiesLeft is initialized to 6 on FIRST bind (activated_unbound → bound)
//   - Transferred devices (unbound_transferable → bound) do NOT get quota refill
//   - Max 4 devices per parent
// ============================================================================

import { ErrorCodes } from '../utils/errorCodes.js';
import { BizError } from '../utils/response.js';
import { signDeviceToken, TOKEN_TTL_SECONDS } from '../utils/jwt.js';
import { verifyCode } from '../utils/verifyCode.js';

// Device ID format: 8-128 chars, alphanumeric + underscore + hyphen
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
// Activation code: 6-12 alphanumeric
const ACTIVATION_CODE_RE = /^[A-Za-z0-9]{6,12}$/;

const MAX_DEVICES_PER_PARENT = 4;
const FREE_STORY_QUOTA = 6;

// Command queue TTL in Redis (5 minutes, matches heartbeat interval)
const COMMAND_TTL_SECONDS = 5 * 60;
const COMMAND_KEY_PREFIX = 'device:commands:';

function commandQueueKey(deviceId) {
  return `${COMMAND_KEY_PREFIX}${deviceId}`;
}

function validateDeviceId(deviceId) {
  if (typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    throw new BizError(ErrorCodes.DEVICE_ID_FORMAT_INVALID);
  }
}

function validateActivationCode(code) {
  if (typeof code !== 'string' || !ACTIVATION_CODE_RE.test(code)) {
    throw new BizError(ErrorCodes.ACTIVATION_CODE_INVALID);
  }
}

function deviceToResponse(device, includeOem = false) {
  const resp = {
    id: device.id,
    deviceId: device.deviceId,
    status: device.status,
    boundAt: device.boundAt?.toISOString() ?? null,
    storiesLeft: device.storiesLeft,
  };
  if (includeOem && device.oemConfig) {
    resp.oemConfig = oemConfigToResponse(device.oemConfig);
  }
  return resp;
}

function oemConfigToResponse(oem) {
  if (!oem) return null;
  return {
    oemId: oem.oemId,
    brandName: oem.brandName,
    logoUrl: oem.logoUrl,
    colors: oem.colors,
    menus: oem.menus,
    assetBundleUrl: oem.assetBundleUrl,
    assetBundleVersion: oem.assetBundleVersion,
    h5BaseUrl: oem.h5BaseUrl,
  };
}

function childToResponse(child) {
  if (!child) return null;
  return {
    id: child.id,
    parentId: child.parentId,
    name: child.name,
    age: child.age,
    gender: child.gender,
    avatar: child.avatar,
    primaryLang: child.primaryLang,
    secondLang: child.secondLang,
    birthday: child.birthday?.toISOString()?.split('T')[0] ?? null,
    coins: child.coins,
    voiceId: child.voiceId,
    createdAt: child.createdAt.toISOString(),
    updatedAt: child.updatedAt.toISOString(),
  };
}

function deviceSummaryToResponse(device) {
  const lastSeenAt = device.lastSeenAt;
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  return {
    id: device.id,
    deviceId: device.deviceId,
    status: device.status,
    boundAt: device.boundAt?.toISOString() ?? null,
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
    storiesLeft: device.storiesLeft,
    model: device.model,
    firmwareVer: device.firmwareVer,
    online: lastSeenAt ? lastSeenAt > tenMinutesAgo : false,
  };
}

export default async function deviceRoutes(fastify) {
  const { prisma, redis } = fastify;

  // ------------------------------------------------------------------
  // 5.1 POST /api/device/register
  // ------------------------------------------------------------------
  fastify.post('/api/device/register', async (request) => {
    const body = request.body ?? {};
    const { deviceId, activationCode, hwFingerprint, model, firmwareVer, osVersion, batchCode } = body;

    validateDeviceId(deviceId);
    validateActivationCode(activationCode);

    // Find activation code
    const codeRecord = await prisma.activationCode.findUnique({
      where: { code: activationCode },
    });

    if (!codeRecord) {
      throw new BizError(ErrorCodes.ACTIVATION_CODE_INVALID);
    }

    // Check if code is already used by ANOTHER device
    if (codeRecord.status === 'activated' && codeRecord.usedByDeviceId !== deviceId) {
      throw new BizError(ErrorCodes.ACTIVATION_CODE_USED);
    }

    if (codeRecord.status === 'revoked') {
      throw new BizError(ErrorCodes.ACTIVATION_CODE_INVALID, {
        details: { reason: 'revoked' },
      });
    }

    // Check if device already exists
    let device = await prisma.device.findUnique({
      where: { deviceId },
      include: { oemConfig: true },
    });

    if (device) {
      // Device already registered — check status
      if (device.status === 'disabled') {
        throw new BizError(ErrorCodes.DEVICE_DISABLED);
      }

      // Return fresh token for existing device (e.g., after factory reset)
      const { token, expiresAt } = await signDeviceToken(fastify, device.id);

      // Update device info if changed
      await prisma.device.update({
        where: { id: device.id },
        data: {
          firmwareVer: firmwareVer ?? device.firmwareVer,
          osVersion: osVersion ?? device.osVersion,
          hwFingerprint: hwFingerprint ?? device.hwFingerprint,
          lastSeenAt: new Date(),
        },
      });

      return {
        deviceToken: token,
        device: deviceToResponse(device),
        oemConfig: oemConfigToResponse(device.oemConfig),
        tokenExpiresAt: expiresAt,
      };
    }

    // New device registration
    const oemId = codeRecord.oemId ?? null;

    // Create device with transaction
    device = await prisma.$transaction(async (tx) => {
      // Create device
      const newDevice = await tx.device.create({
        data: {
          deviceId,
          activationCode,
          activationCodeId: codeRecord.id,
          oemId,
          batchCode: batchCode ?? codeRecord.batchId,
          status: 'activated_unbound',
          storiesLeft: 0, // Quota granted on first bind
          model: model ?? 'GP15',
          firmwareVer,
          osVersion,
          hwFingerprint,
          lastSeenAt: new Date(),
        },
        include: { oemConfig: true },
      });

      // Update activation code status
      await tx.activationCode.update({
        where: { id: codeRecord.id },
        data: {
          status: 'activated',
          usedByDeviceId: deviceId,
          activatedAt: new Date(),
        },
      });

      return newDevice;
    });

    const { token, expiresAt } = await signDeviceToken(fastify, device.id);

    return {
      deviceToken: token,
      device: deviceToResponse(device),
      oemConfig: oemConfigToResponse(device.oemConfig),
      tokenExpiresAt: expiresAt,
    };
  });

  // ------------------------------------------------------------------
  // 5.2 GET /api/device/status
  // ------------------------------------------------------------------
  fastify.get('/api/device/status',
    { onRequest: [fastify.authenticateDevice] },
    async (request) => {
      const { sub } = request.auth;

      const device = await prisma.device.findUnique({
        where: { id: sub },
        include: {
          parent: true,
          activeChild: true,
        },
      });

      if (!device) {
        throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);
      }

      return {
        status: device.status,
        parent: device.parent ? {
          id: device.parent.id,
          email: device.parent.email,
          locale: device.parent.locale,
        } : null,
        activeChild: childToResponse(device.activeChild),
      };
    },
  );

  // ------------------------------------------------------------------
  // 5.3 POST /api/device/bind
  //
  // deviceId is OPTIONAL (per H5 product decision 2026-04-23):
  //   - If body has deviceId: classic lookup by (deviceId, activationCode) pair.
  //     This keeps the QR-scan / RegisterView path working unchanged.
  //   - If body has only activationCode: look up ActivationCode uniquely by
  //     code, follow its `usedByDeviceId` back to the Device that consumed
  //     it. This powers the manual-entry dialog in DevicesView where the TV
  //     does not surface deviceId to the user.
  // ------------------------------------------------------------------
  fastify.post('/api/device/bind',
    { onRequest: [fastify.authenticateParent] },
    async (request) => {
      const { sub: parentId } = request.auth;
      const body = request.body ?? {};
      const { deviceId: deviceIdFromBody, activationCode, forceOverride } = body;

      validateActivationCode(activationCode);

      // Check parent's device count
      const deviceCount = await prisma.device.count({
        where: { parentId },
      });

      if (deviceCount >= MAX_DEVICES_PER_PARENT) {
        throw new BizError(ErrorCodes.MAX_DEVICES_REACHED);
      }

      // Resolve which device this activationCode corresponds to.
      // Path A (deviceId provided): classic, validate id format first.
      // Path B (deviceId omitted): reverse-lookup via ActivationCode.usedByDeviceId.
      let resolvedDeviceId;
      if (deviceIdFromBody) {
        validateDeviceId(deviceIdFromBody);
        resolvedDeviceId = deviceIdFromBody;
      } else {
        const codeRow = await prisma.activationCode.findUnique({
          where: { code: activationCode },
        });
        if (!codeRow || codeRow.status === 'revoked' || !codeRow.usedByDeviceId) {
          // Code never issued / revoked / TV hasn't registered yet
          throw new BizError(ErrorCodes.ACTIVATION_CODE_INVALID);
        }
        resolvedDeviceId = codeRow.usedByDeviceId;
      }

      // Find device
      const device = await prisma.device.findUnique({
        where: { deviceId: resolvedDeviceId },
        include: { oemConfig: true, activationCodeRef: true },
      });

      if (!device) {
        throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);
      }

      if (device.status === 'disabled') {
        throw new BizError(ErrorCodes.DEVICE_DISABLED);
      }

      // Verify activation code matches
      if (device.activationCode !== activationCode) {
        throw new BizError(ErrorCodes.ACTIVATION_CODE_INVALID);
      }

      // Check if already bound to another parent
      if (device.parentId && device.parentId !== parentId) {
        if (!forceOverride) {
          throw new BizError(ErrorCodes.DEVICE_BOUND_TO_OTHER);
        }
        // forceOverride=true: will rebind
      }

      // Determine if this is first activation (grants quota)
      const isFirstBind = device.status === 'activated_unbound';
      const newStoriesLeft = isFirstBind ? FREE_STORY_QUOTA : device.storiesLeft;

      // Bind device
      const updatedDevice = await prisma.device.update({
        where: { id: device.id },
        data: {
          parentId,
          status: 'bound',
          boundAt: new Date(),
          storiesLeft: newStoriesLeft,
        },
        include: { oemConfig: true },
      });

      return {
        device: {
          ...deviceToResponse(updatedDevice, true),
          oemConfig: oemConfigToResponse(updatedDevice.oemConfig),
        },
        activatedQuota: isFirstBind,
      };
    },
  );

  // ------------------------------------------------------------------
  // 5.4 POST /api/device/unbind
  // ------------------------------------------------------------------
  fastify.post('/api/device/unbind',
    { onRequest: [fastify.authenticateParent] },
    async (request) => {
      const { sub: parentId } = request.auth;
      const body = request.body ?? {};
      const { deviceId, confirmCode } = body;

      validateDeviceId(deviceId);

      if (!confirmCode) {
        throw new BizError(ErrorCodes.PARAM_MISSING, {
          details: { field: 'confirmCode' },
        });
      }

      // Find device owned by this parent
      const device = await prisma.device.findFirst({
        where: { deviceId, parentId },
      });

      if (!device) {
        throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);
      }

      // Verify confirm code (either password or email verification code)
      const parent = await prisma.parent.findUnique({ where: { id: parentId } });

      // Try as email verification code first
      const verifyResult = await verifyCode(redis, parent.email, 'login', confirmCode);
      
      if (!verifyResult.ok) {
        // Not a valid verification code — this flow requires pre-sending code
        throw new BizError(ErrorCodes.VERIFY_CODE_INVALID);
      }

      // Unbind device
      await prisma.$transaction(async (tx) => {
        await tx.device.update({
          where: { id: device.id },
          data: {
            parentId: null,
            activeChildId: null,
            status: 'unbound_transferable',
          },
        });

        // Update activation code status
        if (device.activationCodeId) {
          await tx.activationCode.update({
            where: { id: device.activationCodeId },
            data: {
              status: 'transferred',
              transferredAt: new Date(),
            },
          });
        }
      });

      return {
        deviceId,
        status: 'unbound_transferable',
      };
    },
  );

  // ------------------------------------------------------------------
  // 5.5 POST /api/device/heartbeat
  // ------------------------------------------------------------------
  fastify.post('/api/device/heartbeat',
    { onRequest: [fastify.authenticateDevice] },
    async (request) => {
      const { sub } = request.auth;
      const body = request.body ?? {};
      const { currentScreen, memoryUsageMb, firmwareVer, networkType } = body;

      // Update device lastSeenAt and firmware if changed
      const updateData = { lastSeenAt: new Date() };
      if (firmwareVer) updateData.firmwareVer = firmwareVer;

      await prisma.device.update({
        where: { id: sub },
        data: updateData,
      });

      // Get pending commands from Redis
      const commandKey = commandQueueKey(sub);
      const pendingCommandsRaw = await redis.lrange(commandKey, 0, -1);
      
      const pendingCommands = pendingCommandsRaw.map((raw) => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }).filter(Boolean);

      return {
        pendingCommands,
        serverTime: new Date().toISOString(),
      };
    },
  );

  // ------------------------------------------------------------------
  // 5.6 POST /api/device/ack-command/:id
  // ------------------------------------------------------------------
  fastify.post('/api/device/ack-command/:id',
    { onRequest: [fastify.authenticateDevice] },
    async (request) => {
      const { sub } = request.auth;
      const { id: commandId } = request.params;
      const body = request.body ?? {};
      const { result, error } = body;

      // Remove command from queue
      const commandKey = commandQueueKey(sub);
      const commands = await redis.lrange(commandKey, 0, -1);
      
      for (const raw of commands) {
        try {
          const cmd = JSON.parse(raw);
          if (cmd.id === commandId) {
            await redis.lrem(commandKey, 1, raw);
            break;
          }
        } catch {
          // Skip malformed entries
        }
      }

      // Log acknowledgement (could write to telemetry in production)
      request.log.info({ commandId, result, error }, 'command acknowledged');

      return null;
    },
  );

  // ------------------------------------------------------------------
  // 5.7 GET /api/device/active-child
  // ------------------------------------------------------------------
  fastify.get('/api/device/active-child',
    { onRequest: [fastify.authenticateDevice] },
    async (request) => {
      const { sub } = request.auth;

      const device = await prisma.device.findUnique({
        where: { id: sub },
        include: {
          activeChild: true,
          parent: {
            include: {
              children: true,
            },
          },
        },
      });

      if (!device) {
        throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);
      }

      return {
        activeChild: childToResponse(device.activeChild),
        allChildren: device.parent?.children.map(childToResponse) ?? [],
      };
    },
  );

  // ------------------------------------------------------------------
  // 5.8 POST /api/device/active-child
  // ------------------------------------------------------------------
  fastify.post('/api/device/active-child', async (request) => {
    const body = request.body ?? {};
    const { deviceId, childId } = body;

    if (!childId) {
      throw new BizError(ErrorCodes.PARAM_MISSING, {
        details: { field: 'childId' },
      });
    }

    let targetDeviceId;
    let parentId;

    // Determine auth type and get device
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) {
      throw new BizError(ErrorCodes.TOKEN_EXPIRED);
    }

    let payload;
    try {
      payload = request.server.jwt.verify(token);
    } catch {
      throw new BizError(ErrorCodes.TOKEN_EXPIRED);
    }

    if (payload.type === 'device') {
      // Device token — deviceId comes from token
      const device = await prisma.device.findUnique({
        where: { id: payload.sub },
      });
      if (!device) throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);
      targetDeviceId = device.id;
      parentId = device.parentId;
    } else if (payload.type === 'parent') {
      // Parent token — deviceId must be in body
      if (!deviceId) {
        throw new BizError(ErrorCodes.PARAM_MISSING, {
          details: { field: 'deviceId' },
        });
      }
      validateDeviceId(deviceId);
      const device = await prisma.device.findUnique({
        where: { deviceId },
      });
      if (!device || device.parentId !== payload.sub) {
        throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);
      }
      targetDeviceId = device.id;
      parentId = payload.sub;
    } else {
      throw new BizError(ErrorCodes.TOKEN_TYPE_MISMATCH);
    }

    // Verify child belongs to the parent
    const child = await prisma.child.findUnique({
      where: { id: childId },
    });

    if (!child || child.parentId !== parentId) {
      throw new BizError(ErrorCodes.CHILD_NOT_FOUND);
    }

    // Update active child
    const updatedDevice = await prisma.device.update({
      where: { id: targetDeviceId },
      data: { activeChildId: childId },
      include: { activeChild: true },
    });

    return {
      activeChild: childToResponse(updatedDevice.activeChild),
    };
  });

  // ------------------------------------------------------------------
  // 5.9 POST /api/device/:id/reboot
  // ------------------------------------------------------------------
  fastify.post('/api/device/:id/reboot',
    { onRequest: [fastify.authenticateParent] },
    async (request) => {
      const { sub: parentId } = request.auth;
      const { id } = request.params;

      // Find device by cuid id, owned by this parent
      const device = await prisma.device.findFirst({
        where: { id, parentId },
      });

      if (!device) {
        throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);
      }

      // Queue reboot command
      const command = {
        id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'reboot',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + COMMAND_TTL_SECONDS * 1000).toISOString(),
      };

      const commandKey = commandQueueKey(device.id);
      await redis.rpush(commandKey, JSON.stringify(command));
      await redis.expire(commandKey, COMMAND_TTL_SECONDS);

      return {
        commandId: command.id,
        queuedAt: command.issuedAt,
        willExecuteWithin: COMMAND_TTL_SECONDS,
      };
    },
  );

  // ------------------------------------------------------------------
  // 5.10 GET /api/device/list
  // ------------------------------------------------------------------
  fastify.get('/api/device/list',
    { onRequest: [fastify.authenticateParent] },
    async (request) => {
      const { sub: parentId } = request.auth;

      const devices = await prisma.device.findMany({
        where: { parentId },
        orderBy: { boundAt: 'desc' },
      });

      return {
        items: devices.map(deviceSummaryToResponse),
      };
    },
  );

  // ------------------------------------------------------------------
  // POST /api/device/refresh-token
  // ------------------------------------------------------------------
  fastify.post('/api/device/refresh-token',
    { onRequest: [fastify.authenticateDevice] },
    async (request) => {
      const { sub } = request.auth;

      const device = await prisma.device.findUnique({ where: { id: sub } });
      if (!device) {
        throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);
      }

      if (device.status === 'disabled') {
        throw new BizError(ErrorCodes.DEVICE_DISABLED);
      }

      const { token, expiresAt } = await signDeviceToken(fastify, device.id);

      return {
        deviceToken: token,
        expiresAt,
      };
    },
  );
}

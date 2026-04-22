// ============================================================================
// /api/parent/* — Parent profile per API_CONTRACT §六bis
//
//   GET   /api/parent/me   — Get current parent's full profile
//   PATCH /api/parent/me   — Update parent settings
//
// Batch 3 scope:
//   - Read parent profile with devices + children
//   - Update locale, playBgm, password
// ============================================================================

import { ErrorCodes } from '../utils/errorCodes.js';
import { BizError } from '../utils/response.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../utils/password.js';

const VALID_LOCALES = ['zh', 'en', 'pl', 'ro'];

function childToResponse(child) {
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

function subscriptionToSummary(sub) {
  if (!sub) return null;
  return {
    plan: sub.plan,
    status: sub.status,
    expiresAt: sub.expiresAt?.toISOString() ?? null,
    pdfExportsLeft: sub.pdfExportsLeft ?? 0,
  };
}

function parentToFullResponse(parent) {
  return {
    id: parent.id,
    email: parent.email,
    locale: parent.locale,
    activated: parent.devices?.length > 0,
    playBgm: parent.playBgm,
    createdAt: parent.createdAt.toISOString(),
    subscription: subscriptionToSummary(parent.subscription),
    devicesCount: parent.devices?.length ?? 0,
    childrenCount: parent.children?.length ?? 0,
  };
}

export default async function parentRoutes(fastify) {
  const { prisma } = fastify;

  // ------------------------------------------------------------------
  // 6bis.1 GET /api/parent/me
  // ------------------------------------------------------------------
  fastify.get('/api/parent/me',
    { onRequest: [fastify.authenticateParent] },
    async (request) => {
      const { sub: parentId } = request.auth;

      const parent = await prisma.parent.findUnique({
        where: { id: parentId },
        include: {
          subscription: true,
          devices: {
            orderBy: { boundAt: 'desc' },
          },
          children: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!parent) {
        throw new BizError(ErrorCodes.TOKEN_EXPIRED, { cause: 'parent deleted' });
      }

      return {
        parent: parentToFullResponse(parent),
        devices: parent.devices.map(deviceSummaryToResponse),
        children: parent.children.map(childToResponse),
      };
    },
  );

  // ------------------------------------------------------------------
  // 6bis.2 PATCH /api/parent/me
  // ------------------------------------------------------------------
  fastify.patch('/api/parent/me',
    { onRequest: [fastify.authenticateParent] },
    async (request) => {
      const { sub: parentId } = request.auth;
      const body = request.body ?? {};
      const { locale, playBgm, password, currentPassword } = body;

      const parent = await prisma.parent.findUnique({
        where: { id: parentId },
        include: { subscription: true, devices: true, children: true },
      });

      if (!parent) {
        throw new BizError(ErrorCodes.TOKEN_EXPIRED, { cause: 'parent deleted' });
      }

      const updateData = {};

      // Update locale
      if (locale !== undefined) {
        if (!VALID_LOCALES.includes(locale)) {
          throw new BizError(ErrorCodes.PARAM_INVALID, {
            details: { field: 'locale', allowed: VALID_LOCALES },
          });
        }
        updateData.locale = locale;
      }

      // Update BGM setting
      if (playBgm !== undefined) {
        if (typeof playBgm !== 'boolean') {
          throw new BizError(ErrorCodes.PARAM_INVALID, {
            details: { field: 'playBgm', expectedType: 'boolean' },
          });
        }
        updateData.playBgm = playBgm;
      }

      // Update password
      if (password !== undefined && password !== null && password !== '') {
        // Must provide current password to change
        if (!currentPassword) {
          throw new BizError(ErrorCodes.PARAM_MISSING, {
            details: { field: 'currentPassword' },
          });
        }

        // Verify current password
        if (parent.passwordHash) {
          const valid = await verifyPassword(currentPassword, parent.passwordHash);
          if (!valid) {
            throw new BizError(ErrorCodes.PASSWORD_WRONG);
          }
        }

        // Validate new password strength
        const strength = validatePasswordStrength(password);
        if (!strength.valid) {
          throw new BizError(ErrorCodes.PASSWORD_TOO_WEAK, {
            details: { reason: strength.reason },
          });
        }

        updateData.passwordHash = await hashPassword(password);
      }

      // Only update if there are changes
      let updatedParent = parent;
      if (Object.keys(updateData).length > 0) {
        updatedParent = await prisma.parent.update({
          where: { id: parentId },
          data: updateData,
          include: { subscription: true, devices: true, children: true },
        });
      }

      return {
        parent: parentToFullResponse(updatedParent),
      };
    },
  );
}

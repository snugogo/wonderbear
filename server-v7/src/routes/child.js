// ============================================================================
// /api/child/* — Child profile CRUD per API_CONTRACT §六
//
//   POST   /api/child         — Create child (max 4 per parent)
//   GET    /api/child/list    — List all children for parent
//   GET    /api/child/:id     — Get single child details
//   PATCH  /api/child/:id     — Update child
//   DELETE /api/child/:id     — Soft delete child
//
// Batch 3 scope:
//   - Max 4 children per parent
//   - Age range 3-8
//   - Soft delete keeps stories but unlinks child
// ============================================================================

import { ErrorCodes } from '../utils/errorCodes.js';
import { BizError } from '../utils/response.js';

const MAX_CHILDREN_PER_PARENT = 4;
const MIN_AGE = 3;
const MAX_AGE = 8;
const VALID_GENDERS = ['male', 'female', 'prefer_not_say'];
const VALID_LOCALES = ['zh', 'en', 'pl', 'ro'];

function validateAge(age) {
  if (typeof age !== 'number' || age < MIN_AGE || age > MAX_AGE) {
    throw new BizError(ErrorCodes.PARAM_INVALID, {
      details: { field: 'age', min: MIN_AGE, max: MAX_AGE },
    });
  }
}

function validateGender(gender) {
  if (gender !== null && gender !== undefined && !VALID_GENDERS.includes(gender)) {
    throw new BizError(ErrorCodes.PARAM_INVALID, {
      details: { field: 'gender', allowed: VALID_GENDERS },
    });
  }
}

function validateLocale(locale, field = 'locale') {
  if (!VALID_LOCALES.includes(locale)) {
    throw new BizError(ErrorCodes.PARAM_INVALID, {
      details: { field, allowed: VALID_LOCALES },
    });
  }
}

function validateSecondLang(lang) {
  if (lang !== 'none' && !VALID_LOCALES.includes(lang)) {
    throw new BizError(ErrorCodes.PARAM_INVALID, {
      details: { field: 'secondLang', allowed: [...VALID_LOCALES, 'none'] },
    });
  }
}

function validateName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new BizError(ErrorCodes.PARAM_MISSING, {
      details: { field: 'name' },
    });
  }
  if (name.length > 20) {
    throw new BizError(ErrorCodes.PARAM_INVALID, {
      details: { field: 'name', maxLength: 20 },
    });
  }
}

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

export default async function childRoutes(fastify) {
  const { prisma } = fastify;

  // Helper: verify child ownership (works with both parent and device tokens)
  async function verifyChildAccess(request, childId) {
    const { type, sub } = request.auth;

    const child = await prisma.child.findUnique({
      where: { id: childId },
    });

    if (!child) {
      throw new BizError(ErrorCodes.CHILD_NOT_FOUND);
    }

    if (type === 'parent') {
      if (child.parentId !== sub) {
        throw new BizError(ErrorCodes.CHILD_NOT_FOUND);
      }
    } else if (type === 'device') {
      // Device can only access the activeChild
      const device = await prisma.device.findUnique({
        where: { id: sub },
      });
      if (!device || device.activeChildId !== childId) {
        throw new BizError(ErrorCodes.CHILD_NOT_FOUND);
      }
    }

    return child;
  }

  // ------------------------------------------------------------------
  // 6.1 POST /api/child
  // ------------------------------------------------------------------
  fastify.post('/api/child',
    { onRequest: [fastify.authenticateParent] },
    async (request, reply) => {
      const { sub: parentId } = request.auth;
      const body = request.body ?? {};
      const { name, age, gender, avatar, primaryLang, secondLang, birthday } = body;

      // Validate required fields
      validateName(name);
      validateAge(age);

      // Validate optional fields
      if (gender !== undefined) validateGender(gender);
      if (primaryLang) validateLocale(primaryLang, 'primaryLang');
      if (secondLang) validateSecondLang(secondLang);

      // Check child count
      const childCount = await prisma.child.count({
        where: { parentId },
      });

      if (childCount >= MAX_CHILDREN_PER_PARENT) {
        throw new BizError(ErrorCodes.MAX_CHILDREN_REACHED);
      }

      // Parse birthday if provided
      let birthdayDate = null;
      if (birthday) {
        birthdayDate = new Date(birthday);
        if (isNaN(birthdayDate.getTime())) {
          throw new BizError(ErrorCodes.PARAM_INVALID, {
            details: { field: 'birthday', format: 'YYYY-MM-DD' },
          });
        }
      }

      const child = await prisma.child.create({
        data: {
          parentId,
          name: name.trim(),
          age,
          gender: gender ?? null,
          avatar: avatar ?? '🐻',
          primaryLang: primaryLang ?? 'en',
          secondLang: secondLang ?? 'none',
          birthday: birthdayDate,
        },
      });

      reply.code(201);
      return {
        child: childToResponse(child),
      };
    },
  );

  // ------------------------------------------------------------------
  // 6.2 PATCH /api/child/:id
  // ------------------------------------------------------------------
  fastify.patch('/api/child/:id',
    { onRequest: [fastify.authenticateParent] },
    async (request) => {
      const { sub: parentId } = request.auth;
      const { id } = request.params;
      const body = request.body ?? {};
      const { name, age, gender, avatar, primaryLang, secondLang, birthday, voiceId } = body;

      // Find child and verify ownership
      const existingChild = await prisma.child.findUnique({
        where: { id },
      });

      if (!existingChild || existingChild.parentId !== parentId) {
        throw new BizError(ErrorCodes.CHILD_NOT_FOUND);
      }

      // Build update data with validation
      const updateData = {};

      if (name !== undefined) {
        validateName(name);
        updateData.name = name.trim();
      }
      if (age !== undefined) {
        validateAge(age);
        updateData.age = age;
      }
      if (gender !== undefined) {
        validateGender(gender);
        updateData.gender = gender;
      }
      if (avatar !== undefined) {
        updateData.avatar = avatar;
      }
      if (primaryLang !== undefined) {
        validateLocale(primaryLang, 'primaryLang');
        updateData.primaryLang = primaryLang;
      }
      if (secondLang !== undefined) {
        validateSecondLang(secondLang);
        updateData.secondLang = secondLang;
      }
      if (birthday !== undefined) {
        if (birthday === null) {
          updateData.birthday = null;
        } else {
          const birthdayDate = new Date(birthday);
          if (isNaN(birthdayDate.getTime())) {
            throw new BizError(ErrorCodes.PARAM_INVALID, {
              details: { field: 'birthday', format: 'YYYY-MM-DD' },
            });
          }
          updateData.birthday = birthdayDate;
        }
      }
      if (voiceId !== undefined) {
        updateData.voiceId = voiceId;
      }

      const updatedChild = await prisma.child.update({
        where: { id },
        data: updateData,
      });

      return {
        child: childToResponse(updatedChild),
      };
    },
  );

  // ------------------------------------------------------------------
  // 6.3 DELETE /api/child/:id
  // ------------------------------------------------------------------
  fastify.delete('/api/child/:id',
    { onRequest: [fastify.authenticateParent] },
    async (request) => {
      const { sub: parentId } = request.auth;
      const { id } = request.params;

      // Find child and verify ownership
      const child = await prisma.child.findUnique({
        where: { id },
      });

      if (!child || child.parentId !== parentId) {
        throw new BizError(ErrorCodes.CHILD_NOT_FOUND);
      }

      // Soft delete: unlink from devices first, then delete
      await prisma.$transaction(async (tx) => {
        // Clear activeChildId on any devices pointing to this child
        await tx.device.updateMany({
          where: { activeChildId: id },
          data: { activeChildId: null },
        });

        // Delete the child (stories remain but childId FK is cascade-nulled via schema)
        await tx.child.delete({
          where: { id },
        });
      });

      return { deleted: true };
    },
  );

  // ------------------------------------------------------------------
  // 6.4 GET /api/child/list
  // ------------------------------------------------------------------
  fastify.get('/api/child/list',
    { onRequest: [fastify.authenticateParent] },
    async (request) => {
      const { sub: parentId } = request.auth;

      const children = await prisma.child.findMany({
        where: { parentId },
        orderBy: { createdAt: 'asc' },
      });

      return {
        items: children.map(childToResponse),
        total: children.length,
        maxAllowed: MAX_CHILDREN_PER_PARENT,
      };
    },
  );

  // ------------------------------------------------------------------
  // 6.5 GET /api/child/:id
  // ------------------------------------------------------------------
  fastify.get('/api/child/:id', async (request) => {
    const { id } = request.params;

    // Support both parent and device tokens
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

    // Check blacklist
    const blacklistKey = request.server.blacklistKeyFor?.(token);
    if (blacklistKey) {
      const hit = await fastify.redis.get(blacklistKey);
      if (hit) {
        throw new BizError(ErrorCodes.TOKEN_REVOKED);
      }
    }

    request.auth = {
      type: payload.type,
      sub: payload.sub,
      payload,
      token,
    };

    const child = await verifyChildAccess(request, id);

    // Get story count for this child
    const storiesCount = await prisma.story.count({
      where: { childId: id, status: 'completed' },
    });

    // Get last story date
    const lastStory = await prisma.story.findFirst({
      where: { childId: id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return {
      child: childToResponse(child),
      storiesCount,
      lastStoryAt: lastStory?.createdAt?.toISOString() ?? null,
    };
  });
}

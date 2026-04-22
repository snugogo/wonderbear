/**
 * 开发阶段 Mock 层(对齐 API_CONTRACT v1.0)
 *
 * 全量覆盖:
 *   /api/auth/*       认证
 *   /api/parent/me    家长全家当
 *   /api/child/*      孩子 CRUD(动态路径)
 *   /api/device/*     设备列表/重启/解绑
 *   /api/subscription /api/stripe/portal-session  订阅
 *   /api/story/*      故事列表/详情/收藏/删除
 *   /api/pdf/*        PDF 任务发起 + 轮询(模拟进度)
 *
 * 预置:demo@wonderbear.app / demo1234,登录后默认有 2 台 mock 设备 + 5 个 mock 故事
 */

import type {
  ApiResponse,
  Child,
  DeviceSummary,
  LoginResp,
  PdfTaskStatus,
  RegisterResp,
  SendCodeResp,
  Story,
  StorySummary,
  SubscriptionStatusData,
} from '@/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = () => `req_mock_${Math.random().toString(36).slice(2, 10)}`;
const genId = () => `cm_${Math.random().toString(36).slice(2, 12)}`;
const nowIso = () => new Date().toISOString();

// =============================================
// DB
// =============================================

interface MockUser {
  email: string;
  password?: string;
  hasPassword: boolean;
  lastCode?: string;
  codeExpiresAt?: number;
  locale: string;
  failedLogins: number;
  lockedUntil?: number;
}
const userDb = new Map<string, MockUser>();
userDb.set('demo@wonderbear.app', {
  email: 'demo@wonderbear.app',
  password: 'demo1234',
  hasPassword: true,
  locale: 'en',
  failedLogins: 0,
});

const childDb = new Map<string, Child>();

// 预置 2 台 mock 设备(让 /devices 页面有内容)
const deviceDb = new Map<string, DeviceSummary>();
[
  {
    id: 'cm_dev_001',
    deviceId: 'tv_gp15_demo_001',
    status: 'bound' as const,
    boundAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
    lastSeenAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    storiesLeft: 4,
    model: 'GP15',
    firmwareVer: '1.2.3',
    online: true,
  },
  {
    id: 'cm_dev_002',
    deviceId: 'tv_gp15_demo_002',
    status: 'bound' as const,
    boundAt: new Date(Date.now() - 7 * 86400_000).toISOString(),
    lastSeenAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    storiesLeft: 6,
    model: 'GP15',
    firmwareVer: '1.2.3',
    online: false,
  },
].forEach((d) => deviceDb.set(d.id, d));

// 订阅状态:可被 stripe/paypal/cancel 修改,模拟支付成功后 webhook 回调
const subDb: SubscriptionStatusData = {
  plan: 'free',
  status: 'free',
  provider: null,
  expiresAt: null,
  pdfExportsLeft: 0,
  pdfExportsResetAt: null,
  stripeCustomerId: null,
  paypalSubId: null,
  cancelAtPeriodEnd: false,
};

// 预置 mock 故事
const storyDb = new Map<string, Story>();
const STORY_TITLES = [
  { zh: '小熊的太空冒险', en: "Bear's Space Adventure" },
  { zh: '会唱歌的森林', en: 'The Singing Forest' },
  { zh: '彩虹尽头的秘密', en: 'Secret at Rainbow End' },
  { zh: '海底图书馆', en: 'The Underwater Library' },
  { zh: '月亮上的茶会', en: 'Tea Party on the Moon' },
];

function buildStory(idx: number): Story {
  const id = `cm_story_${idx + 1}`;
  const title = STORY_TITLES[idx];
  return {
    id,
    childId: 'cm_child_demo',
    title: title.zh,
    titleLearning: title.en,
    coverUrl: `/assets/story/story_generic_sky.webp`, // 走兜底图,挂了 EmptyState 处理
    coverUrlHd: `/assets/story/story_generic_sky.webp`,
    pages: Array.from({ length: 12 }, (_, i) => ({
      pageNum: i + 1,
      imageUrl: `/assets/story/story_generic_${['forest', 'sky', 'ocean'][i % 3]}.webp`,
      imageUrlHd: `/assets/story/story_generic_${['forest', 'sky', 'ocean'][i % 3]}.webp`,
      text: `这是第 ${i + 1} 页的故事内容,小熊和朋友们正在经历一段奇妙的旅程……`,
      textLearning: `This is page ${i + 1}. The bear and friends are on an amazing journey...`,
      ttsUrl: null,
      ttsUrlLearning: null,
      durationMs: 8000,
    })),
    dialogue: {
      summary: 'A magical adventure with bears',
      rounds: [{ q: '想听什么故事?', a: '想听小熊的故事' }],
    },
    metadata: {
      primaryLang: 'zh',
      learningLang: 'en',
      duration: 96,
      provider: 'mixed',
      createdAt: new Date(Date.now() - idx * 86400_000).toISOString(),
    },
    status: 'completed',
    isPublic: false,
    favorited: idx === 0 || idx === 2,
    playCount: Math.floor(Math.random() * 8),
  };
}

STORY_TITLES.forEach((_, i) => {
  const s = buildStory(i);
  storyDb.set(s.id, s);
});

// PDF 任务:taskId → { progress, startedAt }
const pdfTasks = new Map<string, { startedAt: number; failed?: boolean }>();

// =============================================
// 工具
// =============================================

function ok<T>(data: T): ApiResponse<T> {
  return { code: 0, data, requestId: rid() };
}

const ERROR_I18N: Record<number, { zh: string; en: string; pl: string; ro: string }> = {
  10002: {
    zh: '验证码错误',
    en: 'Verification code invalid',
    pl: 'Kod weryfikacyjny nieprawidłowy',
    ro: 'Cod de verificare invalid',
  },
  10003: {
    zh: '邮箱格式不正确',
    en: 'Invalid email format',
    pl: 'Nieprawidłowy format e-mail',
    ro: 'Format de e-mail invalid',
  },
  10004: {
    zh: '验证码已过期',
    en: 'Verification code expired',
    pl: 'Kod weryfikacyjny wygasł',
    ro: 'Codul de verificare a expirat',
  },
  10005: {
    zh: '邮箱已注册,请直接登录',
    en: 'Email already registered, please log in',
    pl: 'E-mail już zarejestrowany, zaloguj się',
    ro: 'E-mail deja înregistrat, autentifică-te',
  },
  10007: {
    zh: '邮箱或密码错误',
    en: 'Wrong email or password',
    pl: 'Nieprawidłowy e-mail lub hasło',
    ro: 'E-mail sau parolă greșită',
  },
  10008: {
    zh: '登录失败次数过多,请 15 分钟后重试或用验证码登录',
    en: 'Too many failed attempts, try again in 15 minutes or use code login',
    pl: 'Zbyt wiele nieudanych prób, spróbuj ponownie za 15 minut lub zaloguj się kodem',
    ro: 'Prea multe încercări eșuate, reîncearcă peste 15 min sau folosește codul',
  },
  10009: {
    zh: '密码至少 8 位,包含字母和数字',
    en: 'Password must be at least 8 chars with letter and number',
    pl: 'Hasło: min. 8 znaków z literami i cyframi',
    ro: 'Parolă: min. 8 caractere cu litere și cifre',
  },
  20005: {
    zh: '设备不存在',
    en: 'Device not found',
    pl: 'Urządzenie nie znalezione',
    ro: 'Dispozitiv negăsit',
  },
  30007: {
    zh: '故事不存在',
    en: 'Story not found',
    pl: 'Historia nie znaleziona',
    ro: 'Poveste negăsită',
  },
  30009: {
    zh: '孩子不存在',
    en: 'Child not found',
    pl: 'Dziecko nie znalezione',
    ro: 'Copil negăsit',
  },
  30010: {
    zh: '最多添加 4 个孩子',
    en: 'Max 4 children allowed',
    pl: 'Maksymalnie 4 dzieci',
    ro: 'Maximum 4 copii permiși',
  },
  40006: {
    zh: '订阅后可导出 PDF 绘本',
    en: 'Subscribe to export PDF albums',
    pl: 'Zasubskrybuj, aby eksportować albumy PDF',
    ro: 'Abonează-te pentru a exporta albumele PDF',
  },
  90001: { zh: '参数缺失', en: 'Missing parameter', pl: 'Brak parametru', ro: 'Parametru lipsă' },
  90002: {
    zh: '参数格式错误',
    en: 'Invalid parameter',
    pl: 'Nieprawidłowy parametr',
    ro: 'Parametru invalid',
  },
};

function err(code: number, fallback = 'Business error'): ApiResponse {
  const i = ERROR_I18N[code];
  return {
    code,
    message: i?.zh || fallback,
    messageEn: i?.en || fallback,
    messagePl: i?.pl || fallback,
    messageRo: i?.ro || fallback,
    requestId: rid(),
  };
}

// =============================================
// 路由(支持 :param 动态匹配)
// =============================================

type MockHandler = (
  data: Record<string, unknown>,
  params: Record<string, string>
) => Promise<ApiResponse> | ApiResponse;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: MockHandler;
}

const routes: Route[] = [];

function route(method: string, pathPattern: string, handler: MockHandler) {
  const paramNames: string[] = [];
  const regex = pathPattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({
    method: method.toUpperCase(),
    pattern: new RegExp(`^${regex}$`),
    paramNames,
    handler,
  });
}

// =============================================
// /api/auth
// =============================================

route('POST', '/api/auth/send-code', async (data) => {
  await sleep(300);
  const email = String(data.email || '').toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(10003);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const existing = userDb.get(email);
  userDb.set(email, {
    ...(existing || {
      email,
      hasPassword: false,
      locale: String(data.locale || 'en'),
      failedLogins: 0,
    }),
    lastCode: code,
    codeExpiresAt: Date.now() + 300_000,
  });
  // eslint-disable-next-line no-console
  console.log(
    `%c[Mock] 📧 验证码 → ${email}: ${code}`,
    'color: #FF8A3D; font-weight: bold; font-size: 14px'
  );
  return ok({ expiresIn: 300, nextRetryAfter: 60 } satisfies SendCodeResp);
});

route('POST', '/api/auth/register', async (data) => {
  await sleep(500);
  const email = String(data.email || '').toLowerCase().trim();
  const code = String(data.code || '');
  const deviceId = String(data.deviceId || '');
  const activationCode = String(data.activationCode || '');
  if (!email) return err(90001);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(10003);
  if (!/^\d{6}$/.test(code)) return err(90002);
  const user = userDb.get(email);
  if (!user || user.lastCode !== code) return err(10002);
  if (!user.codeExpiresAt || user.codeExpiresAt < Date.now()) return err(10004);
  if (user.hasPassword) return err(10005);
  const password = data.password ? String(data.password) : undefined;
  if (password && !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) return err(10009);

  // 激活码校验(§4.2 错误码 20002/20003)
  // mock 策略:只要同时传了 deviceId + activationCode 就算通过,让 demo 永远走得通
  // 如果想演示"激活码错误"的负反馈路径,可以让 activationCode === 'FAIL' 返回 20002
  if (deviceId && !activationCode) return err(20002);
  if (activationCode === 'FAIL') return err(20002);
  if (deviceId === 'BOUND_BY_OTHER') return err(20003);

  userDb.set(email, {
    ...user,
    password,
    hasPassword: !!password,
    lastCode: undefined,
    codeExpiresAt: undefined,
    locale: String(data.locale || user.locale),
  });
  const resp: RegisterResp = {
    parentToken: `mock.jwt.${Math.random().toString(36).slice(2)}`,
    parent: {
      id: `parent_${email.split('@')[0]}`,
      email,
      locale: (data.locale as 'en') || 'en',
      createdAt: nowIso(),
      activated: !!deviceId,
    },
    device: {
      id: genId(),
      deviceId: deviceId || 'tv_gp15_mock',
      status: 'bound',
      boundAt: nowIso(),
      storiesLeft: 6,
    },
  };
  return ok(resp);
});

route('POST', '/api/auth/login-code', async (data) => {
  await sleep(400);
  const email = String(data.email || '').toLowerCase().trim();
  const code = String(data.code || '');
  const user = userDb.get(email);
  if (!user || user.lastCode !== code) return err(10002);
  if (!user.codeExpiresAt || user.codeExpiresAt < Date.now()) return err(10004);
  user.lastCode = undefined;
  user.codeExpiresAt = undefined;
  user.failedLogins = 0;
  user.lockedUntil = undefined;
  const resp: LoginResp = {
    parentToken: `mock.jwt.${Math.random().toString(36).slice(2)}`,
    parent: {
      id: `parent_${email.split('@')[0]}`,
      email,
      locale: (user.locale as 'en') || 'en',
      activated: true,
      subscription: {
        plan: subDb.plan,
        status: subDb.status,
        expiresAt: subDb.expiresAt,
        pdfExportsLeft: subDb.pdfExportsLeft,
      },
    },
  };
  return ok(resp);
});

route('POST', '/api/auth/login-password', async (data) => {
  await sleep(400);
  const email = String(data.email || '').toLowerCase().trim();
  const password = String(data.password || '');
  const user = userDb.get(email);
  if (!user || !user.hasPassword) return err(10007);
  if (user.lockedUntil && user.lockedUntil > Date.now()) return err(10008);
  if (user.password !== password) {
    user.failedLogins = (user.failedLogins || 0) + 1;
    if (user.failedLogins >= 5) {
      user.lockedUntil = Date.now() + 15 * 60 * 1000;
      return err(10008);
    }
    return err(10007);
  }
  user.failedLogins = 0;
  return ok({
    parentToken: `mock.jwt.${Math.random().toString(36).slice(2)}`,
    parent: {
      id: `parent_${email.split('@')[0]}`,
      email,
      locale: (user.locale as 'en') || 'en',
      activated: true,
      subscription: {
        plan: subDb.plan,
        status: subDb.status,
        expiresAt: subDb.expiresAt,
        pdfExportsLeft: subDb.pdfExportsLeft,
      },
    },
  } satisfies LoginResp);
});

route('POST', '/api/auth/refresh', async () => {
  await sleep(150);
  return ok({
    parentToken: `mock.jwt.refreshed.${Date.now()}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  });
});

route('POST', '/api/auth/logout', async () => {
  await sleep(100);
  return ok(null);
});

// =============================================
// /api/parent
// =============================================

route('GET', '/api/parent/me', async () => {
  await sleep(200);
  return ok({
    parent: {
      id: 'parent_demo',
      email: 'demo@wonderbear.app',
      locale: 'en' as const,
      activated: true,
      playBgm: true,
      createdAt: new Date(Date.now() - 86400_000).toISOString(),
      subscription: {
        plan: subDb.plan,
        status: subDb.status,
        expiresAt: subDb.expiresAt,
        pdfExportsLeft: subDb.pdfExportsLeft,
      },
      devicesCount: deviceDb.size,
      childrenCount: childDb.size,
    },
    devices: [...deviceDb.values()],
    children: [...childDb.values()],
  });
});

route('PATCH', '/api/parent/me', async (data) => {
  await sleep(200);
  // 修改密码场景
  if (data.password) {
    const newPwd = String(data.password);
    const cur = String(data.currentPassword || '');
    const user = userDb.get('demo@wonderbear.app');
    if (!user) return err(10007);
    if (user.password !== cur) return err(10007);
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPwd)) return err(10009);
    user.password = newPwd;
  }
  return ok({
    parent: {
      id: 'parent_demo',
      email: 'demo@wonderbear.app',
      locale: (data.locale as 'en') || 'en',
      activated: true,
      playBgm: data.playBgm !== undefined ? !!data.playBgm : true,
      createdAt: new Date(Date.now() - 86400_000).toISOString(),
      subscription: {
        plan: subDb.plan,
        status: subDb.status,
        expiresAt: subDb.expiresAt,
        pdfExportsLeft: subDb.pdfExportsLeft,
      },
      devicesCount: deviceDb.size,
      childrenCount: childDb.size,
    },
  });
});

// =============================================
// /api/child
// =============================================

route('GET', '/api/child/list', async () =>
  ok({ items: [...childDb.values()], total: childDb.size, maxAllowed: 4 as const })
);

route('GET', '/api/child/:id', async (_, params) => {
  await sleep(100);
  const child = childDb.get(params.id);
  if (!child) return err(30009);
  return ok({ child, storiesCount: storyDb.size, lastStoryAt: nowIso() });
});

route('POST', '/api/child', async (data) => {
  await sleep(300);
  if (childDb.size >= 4) return err(30010);
  const name = String(data.name || '').trim();
  const age = Number(data.age);
  if (!name || name.length > 20) return err(90002);
  if (!Number.isFinite(age) || age < 3 || age > 8) return err(90002);
  const child: Child = {
    id: genId(),
    parentId: 'parent_demo',
    name,
    age,
    gender: (data.gender as Child['gender']) ?? null,
    avatar: String(data.avatar || 'avatar_bear_classic'),
    primaryLang: (data.primaryLang as Child['primaryLang']) || 'en',
    secondLang: (data.secondLang as Child['secondLang']) || 'none',
    birthday: (data.birthday as string | null) ?? null,
    coins: 0,
    voiceId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  childDb.set(child.id, child);
  return ok({ child });
});

route('PATCH', '/api/child/:id', async (data, params) => {
  await sleep(200);
  const existing = childDb.get(params.id);
  if (!existing) return err(30009);
  const updated: Child = {
    ...existing,
    ...(data.name !== undefined ? { name: String(data.name) } : {}),
    ...(data.age !== undefined ? { age: Number(data.age) } : {}),
    ...(data.gender !== undefined ? { gender: data.gender as Child['gender'] } : {}),
    ...(data.avatar !== undefined ? { avatar: String(data.avatar) } : {}),
    ...(data.primaryLang !== undefined
      ? { primaryLang: data.primaryLang as Child['primaryLang'] }
      : {}),
    ...(data.secondLang !== undefined
      ? { secondLang: data.secondLang as Child['secondLang'] }
      : {}),
    ...(data.birthday !== undefined ? { birthday: data.birthday as string | null } : {}),
    updatedAt: nowIso(),
  };
  childDb.set(updated.id, updated);
  return ok({ child: updated });
});

route('DELETE', '/api/child/:id', async (_, params) => {
  await sleep(200);
  if (!childDb.has(params.id)) return err(30009);
  childDb.delete(params.id);
  return ok({ deleted: true as const });
});

// =============================================
// /api/device
// =============================================

route('GET', '/api/device/list', async () => ok({ items: [...deviceDb.values()] }));

route('POST', '/api/device/:id/reboot', async (_, params) => {
  await sleep(300);
  if (!deviceDb.has(params.id)) return err(20005);
  return ok({
    commandId: `cmd_${Math.random().toString(36).slice(2, 10)}`,
    queuedAt: nowIso(),
    willExecuteWithin: 300, // 5 分钟
  });
});

route('POST', '/api/device/unbind', async (data) => {
  await sleep(400);
  const deviceId = String(data.deviceId || '');
  const code = String(data.confirmCode || '');
  if (!/^\d{6}$/.test(code)) return err(10002);
  // 找到对应的 mock 设备(按硬件 deviceId 匹配)
  const target = [...deviceDb.values()].find((d) => d.deviceId === deviceId || d.id === deviceId);
  if (!target) return err(20005);
  // mock:不实际验证 code,直接走;真实环境后端会校验
  deviceDb.delete(target.id);
  return ok({ deviceId: target.deviceId, status: 'unbound_transferable' as const });
});

// =============================================
// /api/subscription + /api/stripe
// =============================================

route('GET', '/api/subscription/status', async () => {
  await sleep(150);
  return ok({ ...subDb });
});

route('POST', '/api/subscription/stripe/create', async (data) => {
  await sleep(400);
  // 真环境会返 Stripe Checkout 的 session_id 和 url。mock 直接给一个会跳到我们 success 页的 URL,
  // 模拟"用户秒支付完成"链路 + webhook 延迟
  const plan = data.plan as 'monthly' | 'yearly';
  // 模拟 webhook 在 5 秒后回调,把订阅置为 active
  setTimeout(() => {
    subDb.plan = plan;
    subDb.status = 'active';
    subDb.provider = 'stripe';
    subDb.expiresAt = new Date(
      Date.now() + (plan === 'yearly' ? 365 : 30) * 86400_000
    ).toISOString();
    subDb.pdfExportsLeft = 5;
    subDb.pdfExportsResetAt = new Date(Date.now() + 30 * 86400_000).toISOString();
    subDb.stripeCustomerId = 'cus_mock_demo';
    subDb.cancelAtPeriodEnd = false;
    // eslint-disable-next-line no-console
    console.log(`%c[Mock] 💳 Stripe webhook → ${plan} active`, 'color: #7FAE7F');
  }, 5000);

  const successUrl = String(data.successUrl || '/');
  return ok({
    sessionId: `cs_mock_${Math.random().toString(36).slice(2, 10)}`,
    // 直接把"成功页"URL 返回,前端跳过去后会轮询 status 等 webhook
    url: successUrl,
  });
});

route('POST', '/api/subscription/paypal/create', async (data) => {
  await sleep(400);
  const plan = data.plan as 'monthly' | 'yearly';
  setTimeout(() => {
    subDb.plan = plan;
    subDb.status = 'active';
    subDb.provider = 'paypal';
    subDb.expiresAt = new Date(
      Date.now() + (plan === 'yearly' ? 365 : 30) * 86400_000
    ).toISOString();
    subDb.pdfExportsLeft = 5;
    subDb.paypalSubId = 'I-MOCK-PAYPAL-SUB';
  }, 5000);
  const returnUrl = String(data.returnUrl || '/');
  return ok({
    approvalUrl: returnUrl,
    subscriptionId: 'I-MOCK-PAYPAL-SUB',
  });
});

route('POST', '/api/subscription/cancel', async () => {
  await sleep(300);
  subDb.cancelAtPeriodEnd = true;
  return ok({
    status: 'canceled' as const,
    expiresAt: subDb.expiresAt || nowIso(),
    cancelAtPeriodEnd: true as const,
  });
});

route('POST', '/api/stripe/portal-session', async (data) => {
  await sleep(200);
  return ok({
    url: String(data.returnUrl || '/'),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  });
});

// =============================================
// /api/story
// =============================================

route('GET', '/api/story/list', async (data) => {
  await sleep(200);
  let items = [...storyDb.values()].map<StorySummary>((s) => ({
    id: s.id,
    title: s.title,
    coverUrl: s.coverUrl,
    createdAt: s.metadata.createdAt,
    playCount: s.playCount,
    favorited: s.favorited,
    primaryLang: s.metadata.primaryLang,
  }));
  if (data.onlyFavorited) items = items.filter((s) => s.favorited);
  // sort
  if (data.sort === 'most_played') items.sort((a, b) => b.playCount - a.playCount);
  else if (data.sort === 'favorited')
    items.sort((a, b) => Number(b.favorited) - Number(a.favorited));
  else items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ok({ items, nextCursor: null, total: items.length });
});

route('GET', '/api/story/:id', async (_, params) => {
  await sleep(150);
  const story = storyDb.get(params.id);
  if (!story) return err(30007);
  return ok({ story });
});

route('POST', '/api/story/:id/favorite', async (data, params) => {
  await sleep(150);
  const story = storyDb.get(params.id);
  if (!story) return err(30007);
  story.favorited = !!data.favorited;
  return ok({ storyId: story.id, favorited: story.favorited });
});

route('DELETE', '/api/story/:id', async (_, params) => {
  await sleep(200);
  if (!storyDb.has(params.id)) return err(30007);
  storyDb.delete(params.id);
  return ok({ deleted: true as const });
});

// =============================================
// /api/pdf(模拟异步任务)
// =============================================

route('POST', '/api/pdf/generate', async (data) => {
  await sleep(300);
  const storyIds = Array.isArray(data.storyIds) ? (data.storyIds as string[]) : [];
  if (storyIds.length === 0) return err(90001);
  for (const sid of storyIds) {
    if (!storyDb.has(sid)) return err(30007);
  }
  // 免费用户 mock 直接放行(真环境会返 40006)
  const taskId = `pdf_${Math.random().toString(36).slice(2, 10)}`;
  pdfTasks.set(taskId, { startedAt: Date.now() });
  return ok({
    taskId,
    status: 'queued' as const,
    estimatedDurationSec: 18,
  });
});

route('GET', '/api/pdf/:taskId/status', async (_, params) => {
  await sleep(100);
  const task = pdfTasks.get(params.taskId);
  if (!task) return err(90002);
  // 模拟进度:18 秒生成完
  const elapsed = (Date.now() - task.startedAt) / 1000;
  const total = 18;
  const progress = Math.min(100, Math.round((elapsed / total) * 100));

  let status: PdfTaskStatus['status'] = 'queued';
  if (elapsed > 1 && elapsed <= total) status = 'generating';
  else if (elapsed > total) status = 'completed';

  const resp: PdfTaskStatus = {
    taskId: params.taskId,
    status,
    progress,
    downloadUrl:
      status === 'completed'
        ? `data:text/plain;charset=utf-8,Mock%20PDF%20for%20${params.taskId}`
        : null,
    expiresAt:
      status === 'completed'
        ? new Date(Date.now() + 24 * 3600_000).toISOString()
        : null,
    error: null,
  };
  return ok(resp);
});

// =============================================
// 主入口
// =============================================

export async function mockHandle(
  method: string,
  url: string,
  data: Record<string, unknown>
): Promise<ApiResponse | null> {
  const path = url.split('?')[0];
  const m = method.toUpperCase();
  for (const r of routes) {
    if (r.method !== m) continue;
    const match = path.match(r.pattern);
    if (!match) continue;
    const params: Record<string, string> = {};
    r.paramNames.forEach((name, i) => {
      params[name] = match[i + 1];
    });
    return r.handler(data || {}, params);
  }
  return null;
}

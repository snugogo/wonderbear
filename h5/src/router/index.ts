import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

/**
 * 路由表(API_CONTRACT 配套页面清单)
 *
 * hash 模式:H5_HANDOFF 强制要求,TV 扫码 URL 必须含 #/register
 */
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },

  // ---- 认证 ----
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { requiresAuth: false, title: 'Sign in' },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/auth/RegisterView.vue'),
    meta: { requiresAuth: false, title: 'Sign up' },
  },

  // ---- 首页 ----
  {
    path: '/home',
    name: 'Home',
    component: () => import('@/views/home/HomeView.vue'),
    meta: { requiresAuth: true, title: 'WonderBear' },
  },

  // ---- Onboard(扫码注册后的引导链路) ----
  {
    path: '/onboard/child',
    name: 'OnboardChild',
    component: () => import('@/views/onboard/OnboardChildView.vue'),
    meta: { requiresAuth: true, title: 'Add your child' },
  },
  {
    path: '/onboard/done',
    name: 'OnboardDone',
    component: () => import('@/views/onboard/OnboardDoneView.vue'),
    meta: { requiresAuth: true, title: 'All set!' },
  },

  // ---- 孩子管理 ----
  {
    path: '/children',
    name: 'Children',
    component: () => import('@/views/children/ChildrenListView.vue'),
    meta: { requiresAuth: true, title: 'Children' },
  },
  {
    path: '/children/new',
    name: 'ChildCreate',
    component: () => import('@/views/children/ChildFormView.vue'),
    meta: { requiresAuth: true, title: 'Add child' },
  },
  {
    path: '/children/:id/edit',
    name: 'ChildEdit',
    component: () => import('@/views/children/ChildFormView.vue'),
    meta: { requiresAuth: true, title: 'Edit child' },
  },

  // ---- 订阅 ----
  {
    path: '/subscribe',
    name: 'Subscribe',
    component: () => import('@/views/subscribe/SubscribeView.vue'),
    meta: { requiresAuth: true, title: 'Subscription' },
  },
  {
    path: '/subscribe/success',
    name: 'SubscribeSuccess',
    component: () => import('@/views/subscribe/SubscribeSuccessView.vue'),
    meta: { requiresAuth: true, title: 'Payment successful' },
  },
  {
    path: '/subscribe/cancel',
    name: 'SubscribeCancel',
    component: () => import('@/views/subscribe/SubscribeCancelView.vue'),
    meta: { requiresAuth: true, title: 'Payment canceled' },
  },

  // ---- 故事 ----
  {
    path: '/stories',
    name: 'Stories',
    component: () => import('@/views/stories/StoriesListView.vue'),
    meta: { requiresAuth: true, title: 'Stories' },
  },
  {
    path: '/stories/:id',
    name: 'StoryDetail',
    component: () => import('@/views/stories/StoryDetailView.vue'),
    meta: { requiresAuth: true, title: 'Story' },
  },
  {
    path: '/stories/:id/pdf',
    name: 'StoryPdf',
    component: () => import('@/views/stories/PdfExportView.vue'),
    meta: { requiresAuth: true, title: 'Export PDF' },
  },

  // ---- 设备 ----
  {
    path: '/devices',
    name: 'Devices',
    component: () => import('@/views/devices/DevicesView.vue'),
    meta: { requiresAuth: true, title: 'Devices' },
  },

  // ---- 设置 ----
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/settings/SettingsView.vue'),
    meta: { requiresAuth: true, title: 'Settings' },
  },

  // ---- 仍占位(P1) ----
  {
    path: '/history',
    name: 'History',
    component: () => import('@/views/placeholder/PlaceholderView.vue'),
    meta: { requiresAuth: true, title: 'History', placeholderKey: 'history' },
  },
  {
    path: '/help',
    name: 'Help',
    component: () => import('@/views/placeholder/PlaceholderView.vue'),
    meta: { requiresAuth: true, title: 'Help', placeholderKey: 'help' },
  },

  // ---- 404 ----
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    redirect: '/home',
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();

  if (to.path === '/register') {
    const deviceId = (to.query.device as string) || (to.query.deviceId as string) || '';
    const activationCode = (to.query.code as string) || (to.query.activationCode as string) || '';
    if (deviceId || activationCode) {
      authStore.setDeviceContext({
        deviceId,
        activationCode,
        enteredAt: Date.now(),
      });
    }
  }

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }

  if (authStore.isLoggedIn && (to.name === 'Login' || to.name === 'Register')) {
    if (!authStore.hasPendingDevice) {
      next({ name: 'Home' });
      return;
    }
  }

  next();
});

router.afterEach((to) => {
  const title = (to.meta.title as string) || 'WonderBear';
  document.title = `${title} · WonderBear`;
});

export default router;

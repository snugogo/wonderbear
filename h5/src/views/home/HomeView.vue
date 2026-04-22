<template>
  <div class="home wb-page">
    <header class="head">
      <BrandLogo size="sm" :show-text="true" />
      <LangSwitch />
    </header>

    <!-- 欢迎卡 -->
    <div class="welcome">
      <div class="welcome-text">
        <p class="hello">{{ t('home.hello') }}</p>
        <p class="email">{{ authStore.parent?.email }}</p>
        <div v-if="authStore.device" class="device-chip">
          <van-icon name="success" />
          <span>{{ t('home.deviceBound', { id: shortDeviceId }) }}</span>
        </div>
      </div>
      <img
        v-if="!bearBroken"
        :src="asset('bear.welcome')"
        alt=""
        class="welcome-bear"
        @error="bearBroken = true"
      />
      <span v-else class="welcome-bear fallback">🧸</span>
    </div>

    <!-- 没孩子时的醒目引导(可能是 onboard 跳过来的) -->
    <div
      v-if="!loadingMe && childrenCount === 0"
      class="no-child-banner"
      @click="router.push({ name: 'OnboardChild' })"
    >
      <img
        v-if="!bannerBroken"
        :src="asset('h5.emptyChildren')"
        class="banner-img"
        alt=""
        @error="bannerBroken = true"
      />
      <span v-else class="banner-img fallback">🧒</span>
      <div class="banner-text">
        <div class="banner-title">{{ t('home.noChildTitle') }}</div>
        <div class="banner-desc">{{ t('home.noChildDesc') }}</div>
      </div>
      <van-icon name="arrow" color="var(--wb-primary-dark)" />
    </div>

    <!-- 功能入口 -->
    <div class="menu">
      <div
        v-for="item in menuItems"
        :key="item.name"
        class="menu-item"
        @click="router.push({ name: item.name })"
      >
        <div class="icon-wrap" :style="{ background: item.bg }">
          <van-icon :name="item.icon" size="22" :color="item.color" />
        </div>
        <div class="menu-text">
          <div class="menu-title">{{ t(item.title) }}</div>
          <div class="menu-desc">{{ t(item.desc) }}</div>
        </div>
        <span v-if="item.badge" class="badge">{{ item.badge }}</span>
        <van-icon name="arrow" color="var(--wb-text-sub)" />
      </div>
    </div>

    <van-button block round plain class="logout" @click="onLogout">
      {{ t('home.signOut') }}
    </van-button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { parentApi } from '@/api/parent';
import BrandLogo from '@/components/BrandLogo.vue';
import LangSwitch from '@/components/LangSwitch.vue';
import { asset } from '@/config/assets';

const { t } = useI18n();
const authStore = useAuthStore();
const router = useRouter();
const bearBroken = ref(false);
const bannerBroken = ref(false);
const loadingMe = ref(true);

// 硬件 deviceId 可能很长,截取显示
const shortDeviceId = computed(() => {
  const id = authStore.device?.deviceId || authStore.device?.id || '';
  return id.length > 16 ? id.slice(0, 8) + '…' + id.slice(-4) : id;
});

// 菜单项,徽章从 /api/parent/me 拿到的数据填充
const childrenCount = ref(0);
const devicesCount = ref(0);

const menuItems = computed(() => [
  {
    name: 'Children',
    title: 'home.menu.children.title',
    desc: 'home.menu.children.desc',
    icon: 'friends-o',
    color: '#E87020',
    bg: 'rgba(245, 191, 163, 0.3)',
    badge: childrenCount.value > 0 ? `${childrenCount.value}/4` : '',
  },
  {
    name: 'Stories',
    title: 'home.menu.stories.title',
    desc: 'home.menu.stories.desc',
    icon: 'records',
    color: '#4A90E2',
    bg: 'rgba(184, 216, 232, 0.45)',
    badge: '',
  },
  {
    name: 'Subscribe',
    title: 'home.menu.subscribe.title',
    desc: 'home.menu.subscribe.desc',
    icon: 'gold-coin-o',
    color: '#E8A658',
    bg: 'rgba(232, 200, 120, 0.3)',
    badge: authStore.isSubscribed ? '✓' : '',
  },
  {
    name: 'Devices',
    title: 'home.menu.devices.title',
    desc: 'home.menu.devices.desc',
    icon: 'tv-o',
    color: '#7FAE7F',
    bg: 'rgba(184, 224, 210, 0.45)',
    badge: devicesCount.value > 0 ? String(devicesCount.value) : '',
  },
  {
    name: 'Settings',
    title: 'home.menu.settings.title',
    desc: 'home.menu.settings.desc',
    icon: 'setting-o',
    color: '#8C7E6A',
    bg: 'rgba(240, 230, 210, 0.6)',
    badge: '',
  },
  {
    name: 'Help',
    title: 'home.menu.help.title',
    desc: 'home.menu.help.desc',
    icon: 'question-o',
    color: '#F4B5C4',
    bg: 'rgba(244, 181, 196, 0.25)',
    badge: '',
  },
]);

// 进首页即拉一次完整资料(devices + children + subscription)
// 失败不阻塞 UI(token 过期会被拦截器处理)
onMounted(async () => {
  loadingMe.value = true;
  try {
    const { parent, devices, children } = await parentApi.me();
    authStore.setFullParent(parent);
    devicesCount.value = devices.length;
    childrenCount.value = children.length;
  } catch {
    // ignore: 只影响徽章展示,不影响主流程
  } finally {
    loadingMe.value = false;
  }
});

async function onLogout() {
  await authStore.logout();
  router.replace({ name: 'Login' });
}
</script>

<style scoped>
.home {
  background: linear-gradient(180deg, #FFF8F0 0%, #FFD9B8 100%);
  padding-bottom: 32px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.welcome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px;
  background: var(--wb-card);
  border-radius: 20px;
  box-shadow: 0 4px 20px rgba(255, 138, 61, 0.08);
  margin-bottom: 20px;
}
.welcome-text {
  flex: 1;
  min-width: 0;
}
.hello {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--wb-text);
}
.email {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--wb-text-sub);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.device-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: rgba(127, 174, 127, 0.15);
  color: var(--wb-success);
  border-radius: 999px;
  font-size: 11px;
}
.welcome-bear {
  width: 72px;
  height: 72px;
  object-fit: contain;
  flex-shrink: 0;
}
.welcome-bear.fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56px;
  line-height: 1;
}

/* 没孩子的醒目引导卡 */
.no-child-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #FFE4CC 0%, #FFD9B8 100%);
  border-radius: 16px;
  cursor: pointer;
  border: 1.5px dashed var(--wb-primary);
  transition: transform 0.12s;
}
.no-child-banner:active {
  transform: scale(0.98);
}
.banner-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex-shrink: 0;
}
.banner-img.fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
}
.banner-text {
  flex: 1;
  min-width: 0;
}
.banner-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--wb-primary-dark);
  margin-bottom: 2px;
}
.banner-desc {
  font-size: 12px;
  color: var(--wb-text-sub);
  line-height: 1.4;
}
.menu {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--wb-card);
  border-radius: 14px;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
}
.menu-item:active {
  transform: scale(0.98);
  box-shadow: 0 2px 8px rgba(255, 138, 61, 0.15);
}
.icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.menu-text {
  flex: 1;
  min-width: 0;
}
.menu-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--wb-text);
  margin-bottom: 2px;
}
.menu-desc {
  font-size: 12px;
  color: var(--wb-text-sub);
}
.badge {
  padding: 2px 8px;
  background: var(--wb-primary-light);
  color: var(--wb-primary-dark);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  margin-right: 4px;
}
.logout {
  height: 44px;
  color: var(--wb-text-sub);
  border-color: var(--wb-border);
}
</style>

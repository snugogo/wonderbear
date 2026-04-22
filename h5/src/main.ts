import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { i18n, initLocale } from '@/i18n';
import router from '@/router';
import App from './App.vue';

// Vant 样式(按需导入配合 auto-import resolver,基础样式仍需全量引入一次)
import 'vant/lib/index.css';

// 全局样式
import '@/assets/styles/global.css';

async function bootstrap() {
  await initLocale();

  const app = createApp(App);
  app.use(createPinia());
  app.use(i18n);
  app.use(router);

  app.mount('#app');
}

bootstrap();

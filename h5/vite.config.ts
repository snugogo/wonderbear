import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { VantResolver } from '@vant/auto-import-resolver';
import mobileForever from 'postcss-mobile-forever';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      vue(),
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
        dts: 'src/types/auto-imports.d.ts',
        eslintrc: { enabled: false },
      }),
      Components({
        resolvers: [VantResolver()],
        dts: 'src/types/components.d.ts',
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    css: {
      postcss: {
        plugins: [
          // 以 375px 设计稿为基准,自动把 px 转为 vw,保证在不同移动端屏宽下等比缩放
          mobileForever({
            viewportWidth: 375,
            maxDisplayWidth: 600,
            appSelector: '#app',
            border: true,
            disableMobile: false,
          }),
        ],
      },
    },
    server: {
      host: '0.0.0.0',
      port: Number(env.VITE_DEV_PORT) || 5174,
      proxy: {
        // 开发阶段:真实联调时请求会代理到后端;当前阶段 mock 层会拦截,这里配置不影响
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue', 'vue-router', 'pinia'],
            vant: ['vant'],
            i18n: ['vue-i18n'],
          },
        },
      },
    },
  };
});

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// GP15 WebView Chromium version unknown — assume ES2019 baseline.
// If real device proves to be Chromium 87+, we can bump to es2020.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // allow phone testing on LAN
  },
  build: {
    target: 'es2019',
    cssTarget: 'chrome79',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Single bundle — no code splitting. WebView startup matters more than HTTP cache.
        manualChunks: undefined,
      },
    },
    // Hard ceiling: warn if final JS > 400KB (kickoff hard rule)
    chunkSizeWarningLimit: 400,
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
});

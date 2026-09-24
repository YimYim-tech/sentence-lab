/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

const THEME = '#0284C7';
const PAPER = '#F8FAFC';

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    define: {
      __SINGLE__: JSON.stringify(single),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [
      react(),
      single
        ? viteSingleFile({ removeViteModuleLoader: true })
        : VitePWA({
            registerType: 'autoUpdate',
            injectRegister: false,
            includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
            manifest: {
              id: './',
              name: 'Sentence Lab — מעבדת משפטים',
              short_name: 'Sentence Lab',
              description: 'תרגול אישי של בניית משפטים באנגלית — בנגיעות, בלי להקליד.',
              lang: 'he',
              dir: 'rtl',
              start_url: './',
              scope: './',
              display: 'standalone',
              orientation: 'portrait',
              background_color: PAPER,
              theme_color: THEME,
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,woff2,woff,png,svg,webmanifest}'],
              navigateFallback: 'index.html',
              cleanupOutdatedCaches: true,
              clientsClaim: true,
              skipWaiting: true,
            },
          }),
    ],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      target: 'es2020',
      sourcemap: false,
      assetsInlineLimit: single ? 100_000_000 : 4096,
    },
    test: {
      environment: 'node',
      include: ['tests/unit/**/*.test.ts'],
      setupFiles: ['tests/unit/setup.ts'],
    },
  };
});

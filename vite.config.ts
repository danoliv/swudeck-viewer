/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Base URL: override with VITE_BASE env var for GitHub Pages (Phase 9)
  base: process.env.VITE_BASE ?? '/',

  // Vite serves public/ as static root — data/*.json and styles.css live here
  publicDir: 'public',

  build: {
    outDir: process.env.VITE_OUT_DIR ?? 'dist',
    manifest: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        compare: 'compare.html',
        settings: 'settings.html',
        navigation: 'src/components/navigation.ts',
        viewerPage: 'src/pages/index.ts',
        comparePage: 'src/pages/compare.ts',
        settingsPage: 'src/pages/settings.ts',
      },
    },
  },

  test: {
    globals: true,
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        url: 'http://localhost/',
      },
    },
    setupFiles: ['./test-setup.js'],
    include: ['**/__tests__/**/*.{js,ts}', '**/*.{spec,test}.{js,ts}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', 'test.js', 'test-runner.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['test-setup.js', 'vite.config.ts'],
    },
  },
});

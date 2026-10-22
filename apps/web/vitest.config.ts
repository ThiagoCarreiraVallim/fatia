import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    clearMocks: true,
    restoreMocks: true,
    // Os testes que formatam hora (artefatos e cota do chat) esperam o fuso do CI. Sem isto,
    // numa máquina em -04 eles mostram 11:00 onde o teste espera 15:00.
    env: { TZ: 'UTC' },
  },
});

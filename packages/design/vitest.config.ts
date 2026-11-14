import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.{test,spec}.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});

import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Testa apenas lógica pura — nada que renderize componente do React Native.
 *
 * Montar `react-native` dentro do Vitest exigiria o preset do Jest do RN, um
 * runtime paralelo e a manutenção de dois harnesses de teste. A cobertura de
 * interface do app fica na auditoria de paridade (issue #130), feita em
 * aparelho; aqui ficam as regras que não dependem de tela.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.{test,spec}.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});

import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright do Fatia (ADR 029).
 *
 * Pressupõe a stack local de pé (`pnpm dev`, ou API + web + Logto) e o Logto
 * configurado (`pnpm logto:bootstrap`). Não sobe servidor sozinho: o mesmo
 * config serve para fotografar a stack local e, no CI, a que o job subir.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3030';

// Absoluto: rodado da raiz do repo, o relativo gravaria a sessão em `./.auth`, fora do .gitignore.
export const STORAGE_STATE = path.join(__dirname, '.auth/demo.json');

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts|logto\.ts/,
      use: { ...devices['Pixel 7'], storageState: STORAGE_STATE },
    },
    {
      name: 'desktop',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts|logto\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: STORAGE_STATE,
      },
    },
  ],
});

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { ROUTES } from '../../packages/api-client/src/navigation';
import { logtoSignIn } from './logto';

/**
 * Login real no Logto com o usuário demo (ADR 029) — sem bypass.
 *
 * Depois do login a API já provisionou o `User` (primeira chamada autenticada),
 * então é aqui que o seed de demonstração roda: antes disso o demo não existe
 * no banco. `E2E_SKIP_SEED=1` pula o seed (ex.: fotografar estado vazio).
 */
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@fatia.local';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'Fatia-demo-2026!';

setup('login do usuário demo', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Entrar' }).click();

  await logtoSignIn(page, DEMO_EMAIL, DEMO_PASSWORD);

  // Consentimento do app aparece só no primeiro login de cada cliente.
  const consent = page.getByRole('button', { name: /autorizar|authorize|continuar|continue/i });
  await page
    .waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30_000 })
    .catch(() => undefined);
  if (await consent.isVisible().catch(() => false)) await consent.click();

  await page.waitForURL('http://localhost:3030/**', { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);
  // Uma chamada autenticada provisiona o User na API.
  const me = await page.request.get('/api/proxy/users/me');
  expect(me.ok()).toBeTruthy();
  const { id: demoUserId } = (await me.json()) as { id: string };

  await page.context().storageState({ path: STORAGE_STATE });

  // O servidor de dev compila cada rota na primeira visita, e isso passa dos
  // 5 s do `expect` quando cai no meio de um fluxo (o "+" que leva ao
  // `/workout`, o menu que leva ao `/profile`). Pedir cada rota fixa aqui tira a
  // compilação de dentro dos testes.
  for (const { pattern } of ROUTES) {
    if (pattern.includes(':')) continue;
    await page.request.get(pattern, { timeout: 120_000 }).catch(() => undefined);
  }

  if (!process.env.E2E_SKIP_SEED) {
    execSync('pnpm db:seed:demo', {
      cwd: resolve(__dirname, '../..'),
      stdio: 'inherit',
      env: { ...process.env, DEMO_USER_ID: demoUserId },
    });
  }
});

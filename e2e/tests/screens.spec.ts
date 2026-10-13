import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Page, test } from '@playwright/test';

/**
 * `pnpm ui:snap <etapa>` (ADR 029): fotografa cada tela do PWA, em celular e
 * desktop, para comparar antes/depois de uma mudança de UI.
 *
 * Não é teste de regressão (não compara pixels nem falha por diferença): é o
 * registro visual que a revisão olha. A comparação lado a lado é o
 * `pnpm ui:compare <etapa-a> <etapa-b>`.
 *
 * Rotas dinâmicas são descobertas pela própria UI (primeiro link da lista),
 * então dependem do seed de demonstração que o `auth.setup.ts` roda.
 */
const STAGE = process.env.UI_STAGE ?? 'adhoc';

function shotPath(page: Page, name: string) {
  const project = test.info().project.name;
  const dir = resolve(__dirname, '..', 'screenshots', STAGE, project);
  mkdirSync(dir, { recursive: true });
  return resolve(dir, `${name}.png`);
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // Skeletons e transições de drawer.
  await page.waitForTimeout(600);
}

async function snap(page: Page, name: string, fullPage = true) {
  await settle(page);
  await page.screenshot({ path: shotPath(page, name), fullPage, animations: 'disabled' });
}

async function visit(page: Page, path: string, name: string) {
  await page.goto(path);
  await snap(page, name);
}

/** Primeiro href da página que casa com o prefixo, ou null. */
async function firstHref(page: Page, prefix: string): Promise<string | null> {
  const link = page.locator(`a[href^="${prefix}"]`).first();
  return (await link.count()) > 0 ? link.getAttribute('href') : null;
}

const STATIC_ROUTES: Array<[string, string]> = [
  ['/', '01-dashboard'],
  ['/nutrition', '10-nutricao'],
  ['/nutrition/goals', '11-nutricao-metas'],
  ['/nutrition/nutrient-targets', '12-nutricao-nutrientes'],
  ['/workout', '20-treino'],
  ['/workout/plans', '21-treino-planos'],
  ['/workout/history', '23-treino-historico'],
  ['/progress', '30-progresso'],
  ['/progress/records', '31-progresso-recordes'],
  ['/goals', '40-metas'],
  ['/profile', '50-perfil'],
  ['/profile/connect', '51-perfil-conectar-ia'],
  ['/chat', '60-chat'],
  ['/students', '70-pro-alunos'],
  ['/privacy', '90-privacidade'],
  ['/terms', '91-termos'],
];

test.describe('telas', () => {
  for (const [path, name] of STATIC_ROUTES) {
    test(name, async ({ page }) => visit(page, path, name));
  }

  test('rotas dinâmicas de treino', async ({ page }) => {
    await page.goto('/workout/plans');
    await settle(page);
    const plan = await firstHref(page, '/workout/plans/');
    if (plan) await visit(page, plan, '22-treino-plano-detalhe');

    await page.goto('/workout/history');
    await settle(page);
    const session = await firstHref(page, '/workout/session/');
    if (session) await visit(page, session, '24-treino-sessao-detalhe');

    await page.goto('/workout');
    await settle(page);
    const quick = await firstHref(page, '/workout/quick/');
    if (quick) await visit(page, quick, '25-treino-rapido');
  });
});

test.describe('drawers de registro', () => {
  test('dashboard: água e peso', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    for (const [label, name] of [
      [/água/i, '02-dashboard-drawer-agua'],
      [/peso/i, '03-dashboard-drawer-peso'],
    ] as const) {
      const button = page.getByRole('button', { name: label }).first();
      if (!(await button.isVisible().catch(() => false))) continue;
      await button.click();
      await snap(page, name, false);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });

  test('nutrição: busca de alimento', async ({ page }) => {
    await page.goto('/nutrition');
    await settle(page);
    const add = page.getByRole('button', { name: 'Adicionar item' }).first();
    if (!(await add.isVisible().catch(() => false))) return;
    await add.click();
    await snap(page, '13-nutricao-drawer-busca', false);
    const search = page.getByRole('textbox').first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill('arroz');
      await page.waitForTimeout(800);
      await snap(page, '14-nutricao-drawer-busca-resultado', false);
    }
  });
});

test('login (sem sessão)', async ({ browser }, info) => {
  const context = await browser.newContext({
    ...info.project.use,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto('/login');
  await snap(page, '00-login');
  await page.getByRole('link', { name: 'Entrar' }).click();
  await page.locator('input[name="identifier"]').waitFor();
  await snap(page, '00-login-logto');
  await context.close();
});

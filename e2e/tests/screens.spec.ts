import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Locator, type Page, test } from '@playwright/test';

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

/**
 * Espera o controle aparecer. `networkidle` sai antes do React Query terminar
 * no dev server, e checar `isVisible()` na hora pulava o drawer em silêncio.
 */
async function appears(locator: Locator): Promise<boolean> {
  return locator
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
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
      if (!(await appears(button))) continue;
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
    if (!(await appears(add))) return;
    await add.click();
    // Atalhos (favoritos e recentes) carregam depois do drawer abrir.
    await appears(page.getByText('Recentes'));
    await snap(page, '13-nutricao-drawer-busca', false);
    const search = page.getByRole('textbox').first();
    if (await appears(search)) {
      await search.fill('arroz');
      await page.waitForTimeout(800);
      await snap(page, '14-nutricao-drawer-busca-resultado', false);
      // O alimento escolhido: onde se diz quanto comeu (gramas ou medida caseira).
      const arroz = page.getByRole('button', { name: /^Arroz, tipo 1, cozido/ }).first();
      if (await appears(arroz)) {
        await arroz.click();
        await page.waitForTimeout(500);
        await snap(page, '15-nutricao-drawer-alimento', false);
        const colher = page.getByRole('radio', { name: /colher de sopa/ });
        if (await appears(colher)) {
          await colher.click();
          await page.getByRole('button', { name: 'Mais' }).click();
          await page.waitForTimeout(300);
          await snap(page, '16-nutricao-drawer-medida', false);
        }
      }
    }
  });
});

test.describe('copiar e refeições salvas', () => {
  test('nutrição: ações da refeição, copiar dia e refeições salvas', async ({ page }) => {
    await page.goto('/nutrition');
    await settle(page);
    const mais = page.getByRole('button', { name: /^Mais ações de / }).first();
    if (!(await appears(mais))) return;
    await mais.click();
    await snap(page, '17-nutricao-acoes-refeicao', false);

    // Salva uma refeição só para a foto da seção, e apaga no fim.
    const nome = `Foto ${test.info().project.name}`;
    const drawer = page.getByRole('dialog');
    await drawer.getByLabel('Nome da refeição salva').fill(nome);
    await drawer.getByRole('button', { name: 'Salvar refeição' }).click();
    await appears(drawer.getByText(/salva\. Ela aparece/));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    const copiarDia = page.getByRole('button', { name: 'Copiar dia' });
    if (await appears(copiarDia)) {
      await copiarDia.click();
      await snap(page, '18-nutricao-copiar-dia', false);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    const registrar = page.getByRole('button', { name: /^Registrar / }).first();
    if (await appears(registrar)) {
      await registrar.click();
      await appears(page.getByText('Refeições salvas'));
      await snap(page, '19-nutricao-drawer-salvas', false);
    }
    // Limpeza pela própria UI, para não sobrar refeição salva no demo.
    const apagar = page.getByRole('button', { name: `Apagar ${nome}` });
    if (await appears(apagar)) {
      await apagar.click();
      await page.getByRole('button', { name: `Confirmar apagar ${nome}` }).click();
      await apagar.waitFor({ state: 'detached' }).catch(() => undefined);
    }
  });
});

test.describe('alimento personalizado', () => {
  test('nutrição: cadastro pelo drawer e Meus alimentos', async ({ page }) => {
    await page.goto('/nutrition');
    await settle(page);
    const registrar = page.getByRole('button', { name: /^Registrar / }).first();
    if (await appears(registrar)) {
      await registrar.click();
      const drawer = page.getByRole('dialog');
      await drawer.getByPlaceholder(/Ex\.: arroz/).fill('Granola da casa');
      const criar = drawer.getByRole('button', { name: 'Criar "Granola da casa"' });
      if (await appears(criar)) {
        await criar.click();
        // Preenche sem salvar: a foto não deixa alimento no demo.
        await drawer.getByLabel('Tamanho da porção (g)').fill('40');
        await drawer.getByLabel('Calorias (kcal)').fill('180');
        await drawer.getByLabel('Proteína (g)').fill('4');
        await drawer.getByLabel('Carboidrato (g)').fill('24');
        await drawer.getByLabel('Gordura (g)').fill('7,2');
        await snap(page, '20-nutricao-criar-alimento', false);
      }
      await page.keyboard.press('Escape');
    }

    await page.goto('/nutrition/foods');
    await settle(page);
    await snap(page, '21-meus-alimentos');
  });
});

test.describe('código de barras', () => {
  test('nutrição: leitor no drawer e produto lido', async ({ page }) => {
    // Resposta fixa: a foto não depende do Open Food Facts estar no ar.
    await page.route('**/api/proxy/nutrition/foods/barcode/**', (route) =>
      route.fulfill({
        json: {
          status: 'ok',
          product: {
            barcode: '7891000100103',
            name: 'Leite Condensado',
            brand: 'Moça',
            basis: '100g',
            kcalPer100g: 325,
            proteinPer100g: 7,
            carbsPer100g: 55,
            fatPer100g: 8,
            servingSize: 20,
            servingLabel: '20 g',
          },
          attribution: {
            source: 'Open Food Facts',
            license: 'ODbL 1.0',
            url: 'https://world.openfoodfacts.org/product/7891000100103',
          },
        },
      }),
    );
    await page.goto('/nutrition');
    await settle(page);
    const registrar = page.getByRole('button', { name: /^Registrar / }).first();
    if (!(await appears(registrar))) return;
    await registrar.click();
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Ler código de barras' }).click();
    // Sem câmera no navegador de teste: aparece o aviso, com o campo do código.
    await drawer.getByLabel('Digitar o código').waitFor();
    await settle(page);
    await snap(page, '22-nutricao-ler-codigo', false);

    await drawer.getByLabel('Digitar o código').fill('7891000100103');
    await drawer.getByRole('button', { name: 'Buscar' }).click();
    await drawer.getByText('Leite Condensado (Moça)').waitFor();
    // Não adiciona: a foto não deixa refeição no demo.
    await snap(page, '23-nutricao-produto-lido', false);
    await page.keyboard.press('Escape');
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

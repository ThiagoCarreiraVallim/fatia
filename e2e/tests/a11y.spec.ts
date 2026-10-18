import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { TEAM_STORAGE_STATE } from '../playwright.config';
import { COMMUNITY_SLUG, newInvitePath, purgeDemo } from './community';

/**
 * Acessibilidade automática (Fase 3): o axe roda nas telas do app, no menu
 * "Mais" e no Registrar, em celular e desktop, e falha em violação `serious` ou
 * `critical`. Não substitui leitor de tela de verdade; pega o que dá para pegar
 * de máquina — contraste, rótulo, nome de botão, ARIA inválido.
 *
 * O resultado lista cada violação com os seletores, para a correção não
 * depender de rodar o axe à mão.
 */

const ROTAS = [
  '/',
  '/nutrition',
  '/nutrition/goals',
  '/nutrition/nutrient-targets',
  '/nutrition/foods',
  '/workout',
  '/workout/plans',
  '/workout/history',
  '/progress',
  '/progress/records',
  '/goals',
  '/profile',
  '/profile/connect',
  '/plan',
  '/community',
];

async function auditar(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(400);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      regra: v.id,
      impacto: v.impact,
      ajuda: v.help,
      alvos: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
}

for (const rota of ROTAS) {
  test(`axe: ${rota}`, async ({ page }) => {
    await page.goto(rota);
    expect(await auditar(page)).toEqual([]);
  });
}

test('axe: menu "Mais" e Registrar', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    await page.getByRole('button', { name: 'Mais', exact: true }).click();
    await page.getByRole('dialog', { name: 'Menu' }).waitFor();
    expect(await auditar(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  }
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Registrar' }).waitFor();
  expect(await auditar(page)).toEqual([]);
});

test.describe('axe: comunidade', () => {
  test.beforeEach(() => purgeDemo());
  test.afterEach(() => purgeDemo());

  test('convite inválido, convite com consentimento e a comunidade por dentro', async ({
    page,
  }) => {
    await page.goto(`/c/${'x'.repeat(43)}`);
    await page.getByRole('heading', { name: 'Convite indisponível' }).waitFor();
    expect(await auditar(page)).toEqual([]);

    await page.goto(newInvitePath());
    await page.getByRole('button', { name: 'Aceitar e entrar' }).waitFor();
    expect(await auditar(page)).toEqual([]);

    await page.getByRole('button', { name: 'Aceitar e entrar' }).click();
    await page.waitForURL(/\/community\/[0-9a-f-]{36}$/);
    await page.getByRole('heading', { name: 'O que eu compartilho' }).waitFor();
    expect(await auditar(page)).toEqual([]);

    // Planos e dicas (Fase 7a): a lista, as dicas e o "o que entra na sua conta".
    const comunidade = page.url();
    await page.goto(`${comunidade}/content`);
    await page.getByRole('link', { name: /Cutting 1.800 kcal/ }).waitFor();
    expect(await auditar(page)).toEqual([]);
    await page.goto(`${comunidade}/content?tab=tips`);
    await page.getByRole('heading', { name: 'Água antes do treino' }).waitFor();
    expect(await auditar(page)).toEqual([]);
    await page.goto(`${comunidade}/content`);
    await page.getByRole('link', { name: /Cutting 1.800 kcal/ }).click();
    await page.getByRole('button', { name: 'Adotar plano' }).click();
    await page.getByRole('dialog').waitFor();
    expect(await auditar(page)).toEqual([]);

    // Catálogo da comunidade (Fase 7b): a lista e o detalhe com o tutorial.
    await page.goto(`${comunidade}/content?tab=exercises`);
    await page.getByRole('button', { name: /Supino Máquina/ }).click();
    await page.getByRole('region', { name: 'Tutorial de Academia Demo' }).waitFor();
    expect(await auditar(page)).toEqual([]);
  });
});

test.describe('axe: painel da comunidade', () => {
  test.use({ storageState: TEAM_STORAGE_STATE });

  test('as seções do painel, o membro e criar comunidade', async ({ page }) => {
    const grupos = (await (await page.request.get('/api/proxy/groups')).json()) as Array<{
      id: string;
      slug: string;
    }>;
    const id = grupos.find((g) => g.slug === COMMUNITY_SLUG)!.id;
    const secoes: Array<[string, string]> = [
      [`/org/${id}`, 'Membros ativos'],
      [`/org/${id}/members`, 'Lara Mendes'],
      [`/org/${id}/invites`, 'Link de convite'],
      [`/org/${id}/seats`, 'Assentos PRO'],
      [`/org/${id}/settings`, 'Código de entrada'],
      [`/org/${id}/content`, 'Corpo inteiro para começar'],
      [`/org/${id}/content/plans/new?kind=NUTRITION`, 'Metas diárias'],
      [`/org/${id}/content/tips/new`, 'Categoria'],
      [`/org/${id}/exercises`, 'Equipamento da academia'],
      [`/org/${id}/exercises/new`, 'Como executar'],
      ['/community/new', 'Como se entra'],
    ];
    for (const [rota, marco] of secoes) {
      await page.goto(rota);
      await page.getByText(marco).first().waitFor();
      expect({ rota, violacoes: await auditar(page) }).toEqual({ rota, violacoes: [] });
    }
    await page.goto(`/org/${id}/members`);
    await page
      .getByRole('link', { name: /Ver dados/ })
      .first()
      .click();
    await page.getByRole('navigation', { name: 'Categorias autorizadas' }).waitFor();
    expect(await auditar(page)).toEqual([]);
  });
});

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { newInvitePath, purgeDemo } from './community';

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
  });
});

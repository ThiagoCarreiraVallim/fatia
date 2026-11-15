import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * Validação da etapa 3 do redesign (#374, #375, #376): o dia em faixas, a
 * refeição, editar item, copiar, metas do dia, nutrientes e o plano alimentar.
 * Fotografa celular e desktop e roda o axe. `UI_STAGE=etapa-03`.
 */
const STAGE = process.env.UI_STAGE ?? 'adhoc';
test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function snap(page: Page, name: string) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  const dir = resolve(__dirname, '..', 'screenshots', STAGE, test.info().project.name);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: resolve(dir, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

async function seriousA11y(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    );
}

const TELAS: Array<[string, string]> = [
  ['n1-dia', '/nutrition'],
  ['n6-metas', '/nutrition/goals'],
  ['n7-nutrientes', '/nutrition/nutrient-targets'],
  ['n5-plano', '/nutrition/plan'],
  ['n12-meus-alimentos', '/nutrition/foods'],
];

for (const [name, path] of TELAS) {
  test(`etapa 3 · ${name}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status() ?? 200).toBeLessThan(400);
    await expect(page.locator('main, body').first()).toBeVisible();
    await snap(page, name);
    expect(await seriousA11y(page)).toEqual([]);
  });
}

test('etapa 3 · a refeição, editar item e copiar (N8, N14, N9)', async ({ page }) => {
  await page.goto('/nutrition');
  const meal = page.locator('a[href^="/nutrition/meals/"]').first();
  await expect(meal).toBeVisible({ timeout: 15_000 });
  await meal.click();
  await page.waitForURL(/\/nutrition\/meals\//);
  await snap(page, 'n8-refeicao');
  expect(await seriousA11y(page)).toEqual([]);

  await page
    .getByRole('button', { name: /Copiar/ })
    .first()
    .click();
  await snap(page, 'n9-copiar');
  await page.keyboard.press('Escape');

  const item = page.getByRole('button', { name: /g\b|kcal/ }).first();
  if (await item.isVisible().catch(() => false)) {
    await item.click();
    await snap(page, 'n14-editar-item');
  }
});

test('etapa 3 · busca, sem resultado e criar alimento (N15, N11)', async ({ page }) => {
  await page.goto('/nutrition');
  await page.getByRole('button', { name: /Adicionar lanche ou refeição/ }).click();
  await snap(page, 'n15-busca');
  await page
    .getByRole('searchbox')
    .or(page.getByRole('textbox'))
    .first()
    .fill('granola da casa xyz');
  await page.waitForTimeout(1200);
  await snap(page, 'n15-busca-vazia');
  const criar = page.getByRole('button', { name: /Criar/ }).first();
  if (await criar.isVisible().catch(() => false)) {
    await criar.click();
    await snap(page, 'n11-criar-alimento');
  }
});

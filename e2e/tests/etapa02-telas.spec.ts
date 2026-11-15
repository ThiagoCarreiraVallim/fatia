import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * Validação da etapa 2 do redesign (#371, #373, #387, #389): Hoje, Você,
 * Lembretes, Notificações e o onboarding refeito ("Refazer" leva objetivo,
 * corpo e metas). Fotografa celular e desktop e roda o axe.
 * `UI_STAGE=etapa-02`.
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
  ['h1-hoje', '/'],
  ['v1-voce', '/you'],
  ['v9-editar-perfil', '/you/edit'],
  ['v8-apagar-conta', '/you/delete'],
  ['v10-unidades', '/you/units'],
  ['v11-novidades', '/you/news'],
  ['v12-ajuda', '/you/help'],
  ['v2-lembretes', '/you/reminders'],
  ['v4-notificacoes', '/profile/notifications'],
  ['apagar-conta-publica', '/apagar-conta'],
];

for (const [name, path] of TELAS) {
  test(`etapa 2 · ${name}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('main, body').first()).toBeVisible();
    await snap(page, name);
    expect(await seriousA11y(page)).toEqual([]);
  });
}

test('etapa 2 · onboarding refeito (objetivo → sobre você → rotina → metas)', async ({ page }) => {
  await page.goto('/onboarding?refazer=1');
  await snap(page, 'onb-04-objetivo');
  await page.getByRole('radio', { name: /Manter o peso/ }).click();
  await snap(page, 'onb-04-objetivo-escolhido');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await snap(page, 'onb-05-sobre-voce');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await snap(page, 'onb-06-rotina');
  await page.getByRole('radio', { name: /Moderado/ }).click();
  await page.getByRole('button', { name: /Calcular minhas metas/ }).click();
  await snap(page, 'onb-07-metas');
});

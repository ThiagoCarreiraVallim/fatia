import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Page, test } from '@playwright/test';

/**
 * PROTÓTIPO (Fase 5): fotografa as variantes da barra com a aba Comunidade
 * (cookie `fatia_nav_variant`). Só roda com `NAV_VARIANTS=1`; some junto com
 * o protótipo depois da escolha.
 */
test.skip(!process.env.NAV_VARIANTS, 'só para comparar as variantes da barra');

const VARIANTS = ['atual', 'a', 'b', 'c', 'd'] as const;

function shot(page: Page, name: string) {
  const dir = resolve(__dirname, '..', 'screenshots', '29-nav-variantes', test.info().project.name);
  mkdirSync(dir, { recursive: true });
  return page.screenshot({ path: resolve(dir, `${name}.png`), animations: 'disabled' });
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // O selo "N" do Next em dev cobre a primeira aba.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.waitForTimeout(800);
}

for (const v of VARIANTS) {
  test(`variante ${v}`, async ({ page, context, baseURL }) => {
    if (v !== 'atual') {
      await context.addCookies([{ name: 'fatia_nav_variant', value: v, url: baseURL! }]);
    }
    const desktop = test.info().project.name === 'desktop';
    if (desktop && v !== 'a') test.skip(true, 'no desktop só a lateral muda, igual nas quatro');

    for (const [path, name] of [
      ['/', 'inicio'],
      ['/nutrition', 'nutricao'],
      ['/community', 'comunidade'],
    ] as const) {
      await page.goto(path);
      await settle(page);
      await shot(page, `${v}-${name}`);
    }
    if (desktop) return;

    await page.goto('/');
    await settle(page);
    const menu =
      v === 'a'
        ? page.getByRole('button', { name: 'Menu' })
        : page.getByRole('button', { name: 'Mais', exact: true });
    await menu.click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(600);
    await shot(page, `${v}-menu`);
  });
}

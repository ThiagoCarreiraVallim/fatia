import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { TEAM_STORAGE_STATE } from '../playwright.config';
import { COMMUNITY_SLUG } from './community';

/**
 * Validação da etapa 1 (#368, #370): telas web que correspondem às pranchas
 * "Dados-*" (estados, metas pessoais, conquistas, notificações, plano) e ao
 * painel da equipe. Fotografa celular e desktop, roda o axe e mede fonte do
 * corpo/títulos e rolagem horizontal. `UI_STAGE=etapa-01-r2`.
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

async function audit(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const found = violations.map((v) => ({
    regra: v.id,
    impacto: v.impact,
    alvos: v.nodes.slice(0, 4).map((n) => n.target.join(' ')),
  }));
  const tokens = await page.evaluate(() => {
    const cs = (el: Element | null) => (el ? getComputedStyle(el) : null);
    const h = document.querySelector('h1, h2');
    return {
      body: cs(document.body)?.fontFamily.split(',')[0],
      bg: cs(document.body)?.backgroundColor,
      titulo: cs(h)?.fontFamily.split(',')[0],
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  console.log(
    `AXE ${test.info().project.name} ${name}: ${JSON.stringify(found)} TOKENS ${JSON.stringify(tokens)}`,
  );
  return found.filter((v) => v.impacto === 'serious' || v.impacto === 'critical');
}

const TELAS: Array<[string, string]> = [
  ['t1-hoje', '/'],
  ['t1-nutricao', '/nutrition'],
  ['t1-nutricao-metas', '/nutrition/goals'],
  ['t1-treino', '/workout'],
  ['t1-treino-planos', '/workout/plans'],
  ['t1-progresso', '/progress'],
  ['t1-progresso-recordes', '/progress/records'],
  ['t1-voce', '/you'],
  ['t1-perfil', '/profile'],
  ['t1-notificacoes', '/profile/notifications'],
  ['t1-plano', '/plan'],
  ['t1-comunidade', '/community'],
  ['t1-chat', '/chat'],
];

for (const [nome, rota] of TELAS) {
  test(`#370 ${nome}`, async ({ page }) => {
    await page.goto(rota);
    await snap(page, nome);
    expect(await audit(page, nome)).toEqual([]);
  });
}

test('#370 metas pessoais: abas de estado (ativas, concluídas, arquivadas)', async ({ page }) => {
  await page.goto('/goals');
  for (const aba of [/conclu/i, /arquiv/i]) {
    const t = page.getByRole('tab', { name: aba }).or(page.getByRole('button', { name: aba }));
    if (
      await t
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await t.first().click();
      await snap(page, `t1-metas-${String(aba).replace(/\W/g, '')}`);
    }
  }
});

test.describe('painel da equipe', () => {
  test.use({ storageState: TEAM_STORAGE_STATE });
  const SUB = [
    '',
    '/members',
    '/invites',
    '/seats',
    '/settings',
    '/moderation',
    '/challenges',
    '/agent',
  ];

  for (const sub of SUB) {
    test(`#370 painel${sub || ' visão geral'}`, async ({ page }) => {
      const grupos = (await (await page.request.get('/api/proxy/groups')).json()) as Array<{
        id: string;
        slug: string;
      }>;
      const id = grupos.find((g) => g.slug === COMMUNITY_SLUG)!.id;
      await page.goto(`/org/${id}${sub}`);
      const nome = `t1-painel${sub.replace('/', '-') || '-visao'}`;
      await snap(page, nome);
      expect(await audit(page, nome)).toEqual([]);
    });
  }
});

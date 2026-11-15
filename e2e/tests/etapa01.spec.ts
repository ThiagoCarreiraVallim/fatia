import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * Validação do layout web da etapa 1 contra as pranchas do canvas (#368, #369,
 * #370). `UI_STAGE=etapa-01-r1 npx playwright test tests/etapa01.spec.ts`.
 * Fotografa, em celular e desktop, as telas que têm prancha de destino e roda
 * o axe em cada uma. Estados da IA vêm de respostas simuladas da API.
 */
const STAGE = process.env.UI_STAGE ?? 'adhoc';

// O axe mede contraste no meio da animação de entrada (opacidade subindo) e
// acusa violação que some um instante depois. Com "reduzir movimento" as
// animações do DS vão direto ao estado final, e a medição fica estável.
test.use({ contextOptions: { reducedMotion: 'reduce' } });
const IA = /^(Abrir a IA|Abrir registro|IA )/;

async function snap(page: Page, name: string, fullPage = true) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  const dir = resolve(__dirname, '..', 'screenshots', STAGE, test.info().project.name);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: resolve(dir, `${name}.png`), fullPage, animations: 'disabled' });
}

async function axe(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const found = violations.map((v) => ({
    regra: v.id,
    impacto: v.impact,
    alvos: v.nodes.slice(0, 4).map((n) => n.target.join(' ')),
  }));
  console.log(`AXE ${test.info().project.name} ${name}: ${JSON.stringify(found)}`);
  return found.filter((v) => v.impacto === 'serious' || v.impacto === 'critical');
}

async function appears(l: Locator) {
  return l
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
}

const PRO = { available: true, photos: true, dictation: true, allowed: true };
const conv = (id: string, title: string, state: string, h: number) => ({
  id,
  title,
  state,
  agentGroupId: null,
  createdAt: new Date(Date.now() - h * 3_600_000).toISOString(),
  updatedAt: new Date(Date.now() - h * 3_600_000).toISOString(),
});

async function mockAi(page: Page, convs: unknown[], pending = { waiting: 0, thinking: 0 }) {
  await page.route('**/api/proxy/chat/availability', (r) => r.fulfill({ json: PRO }));
  await page.route('**/api/proxy/chat/conversations/pending-count', (r) =>
    r.fulfill({ json: pending }),
  );
  await page.route(/\/api\/proxy\/chat\/conversations(\?.*)?$/, (r) => r.fulfill({ json: convs }));
}

test('#368 galeria do design system', async ({ page }) => {
  await page.goto('/design-system');
  await snap(page, 'e1-design-system');
  expect(await axe(page, 'design-system')).toEqual([]);
});

test('#369 menu da IA: Free (prancha H6c6)', async ({ page }) => {
  await page.route('**/api/proxy/chat/availability', (r) =>
    r.fulfill({
      json: {
        available: true,
        photos: true,
        dictation: true,
        allowed: false,
        reason: 'plan_required',
      },
    }),
  );
  await page.goto('/');
  const ia = page.getByRole('button', { name: IA });
  if (!(await appears(ia))) return;
  await ia.click();
  await appears(page.getByRole('dialog').getByText('Registrar manual'));
  await snap(page, 'e1-menu-ia-free', false);
  expect(await axe(page, 'menu-free')).toEqual([]);
  // O cartão do Free (s1) precisa contrastar com a folha (s2), como na prancha.
  const dialog = page.getByRole('dialog');
  const card = dialog
    .getByText('Registre falando ou por foto')
    .locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]');
  const [cardBg, sheetBg] = await Promise.all([
    card.evaluate((el) => getComputedStyle(el).backgroundColor),
    dialog.evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);
  expect(cardBg).not.toBe(sheetBg);
});

test('#369 menu da IA: PRO com conversas (H6c5) e ativa (H6c8)', async ({ page }) => {
  await mockAi(page, [
    conv('c1', 'Registro do almoço', 'idle', 2),
    conv('c2', 'Treino sem ombro', 'idle', 26),
  ]);
  await page.goto('/');
  const ia = page.getByRole('button', { name: IA });
  if (!(await appears(ia))) return;
  await ia.click();
  await appears(page.getByRole('dialog').getByText('Conversas'));
  await snap(page, 'e1-menu-ia-pro', false);
  expect(await axe(page, 'menu-pro')).toEqual([]);
});

test('#369 menu da IA com conversa esperando e pensando (H6c8)', async ({ page }) => {
  await mockAi(
    page,
    [
      conv('c1', 'Registro do almoço', 'waiting', 1),
      conv('c3', 'Resumo da semana', 'thinking', 1),
      conv('c2', 'Treino sem ombro', 'idle', 26),
    ],
    { waiting: 1, thinking: 1 },
  );
  await page.goto('/');
  await page.waitForTimeout(1500);
  await snap(page, 'e1-botao-ia-ativa', false);
  const ia = page.getByRole('button', { name: /^(Abrir a IA|Abrir registro|IA )/ });
  if (!(await appears(ia))) return;
  await ia.click();
  await appears(page.getByRole('dialog').getByText('Conversas'));
  await snap(page, 'e1-menu-ia-ativa', false);
  expect(await axe(page, 'menu-ativa')).toEqual([]);
});

test('#369 menu da IA: teclado aberto (H6c7) e rascunho', async ({ page }) => {
  await mockAi(page, [conv('c1', 'Registro do almoço', 'idle', 2)]);
  await page.goto('/');
  const ia = page.getByRole('button', { name: IA });
  if (!(await appears(ia))) return;
  await ia.click();
  const campo = page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Pergunte ou registre com a IA' });
  if (!(await appears(campo))) return;
  await campo.fill('comi arroz e feijão no almoço');
  await snap(page, 'e1-menu-ia-teclado', false);
  expect(await axe(page, 'menu-teclado')).toEqual([]);
  // Retomar: fecha e reabre, o rascunho continua (Ia-Drawer).
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: IA }).click();
  await page.waitForTimeout(600);
  await snap(page, 'e1-menu-ia-retomar', false);
});

test('#369 cards do carrossel de Treino e treino em andamento', async ({ page }) => {
  await page.goto('/workout');
  await snap(page, 'e1-treino-cards', false);
  expect(await axe(page, 'treino')).toEqual([]);

  // A figura do corpo cabe ao lado do texto: o diagrama de antes, 128 px numa
  // caixa de 64, passava por cima do título e das linhas.
  const card = page.getByRole('region', { name: 'Seus músculos hoje' });
  if (await appears(card)) {
    const figure = await card.getByRole('img').first().boundingBox();
    const legend = await card.getByRole('list', { name: 'Legenda' }).boundingBox();
    expect(figure && legend).toBeTruthy();
    expect(figure!.x + figure!.width).toBeLessThanOrEqual(legend!.x);
  }
});

test('#370 metas (estado de objetivo pessoal)', async ({ page }) => {
  await page.goto('/goals');
  await snap(page, 'e1-metas');
  expect(await axe(page, 'metas')).toEqual([]);
});

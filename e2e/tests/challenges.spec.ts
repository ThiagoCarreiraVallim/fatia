import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TEAM_STORAGE_STATE } from '../playwright.config';
import { COMMUNITY_SLUG, newInvitePath, purgeDemo } from './community';

/**
 * Desafios da comunidade (Fase 8a), de ponta a ponta: a dona marca um desafio
 * pelo painel; o demo entra na comunidade, vê o desafio, participa com um
 * apelido, encontra a própria linha no ranking e sai; a dona encerra. No fim o
 * demo sai da comunidade e o seed refaz os desafios.
 */
const ROOT = resolve(__dirname, '../..');

async function groupId(page: Page): Promise<string> {
  const grupos = (await (await page.request.get('/api/proxy/groups')).json()) as Array<{
    id: string;
    slug: string;
  }>;
  return grupos.find((g) => g.slug === COMMUNITY_SLUG)!.id;
}

test.describe('desafios da comunidade', () => {
  test.skip(({ isMobile }) => !isMobile, 'fluxos rodam uma vez, no celular');

  test.afterAll(() => {
    purgeDemo();
    execSync('pnpm -s db:seed:demo', { cwd: ROOT, stdio: 'ignore' });
  });

  test('a dona marca; o membro participa, se vê no ranking e sai; a dona encerra', async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(180_000);
    const titulo = `Desafio E2E ${Date.now() % 100000}`;
    const donaCtx = await browser.newContext({
      ...info.project.use,
      storageState: TEAM_STORAGE_STATE,
    });
    const dona = await donaCtx.newPage();
    const id = await groupId(dona);

    try {
      // Dona: marca um desafio de água que começa hoje.
      await dona.goto(`/org/${id}/challenges`);
      await dona.getByRole('button', { name: 'Novo desafio' }).click();
      await dona.getByLabel('Título').fill(titulo);
      await dona.getByRole('radio', { name: /Água/ }).check();
      const inicio = await dona.getByLabel('Começa em').inputValue();
      const fim = new Date(Date.parse(`${inicio}T12:00:00Z`) + 6 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      await dona.getByLabel('Termina em').fill(fim);
      await dona.getByRole('button', { name: 'Marcar desafio' }).click();
      await expect(dona.getByText('Desafio marcado.')).toBeVisible();
      const cartao = dona.getByRole('listitem').filter({ hasText: titulo });
      await expect(cartao.getByText('Em andamento')).toBeVisible();

      // Membro: entra na comunidade e encontra o desafio.
      await page.goto(newInvitePath());
      await page.getByRole('button', { name: 'Aceitar e entrar' }).click();
      await page.waitForURL(/\/community\/[0-9a-f-]{36}$/);
      await page.getByRole('link', { name: 'Ver todos' }).click();
      await page.getByRole('link', { name: new RegExp(titulo) }).click();
      await expect(
        page.getByText('O ranking aparece para quem participa.', { exact: false }),
      ).toBeVisible();

      await page.getByRole('button', { name: 'Participar' }).click();
      const apelido = page.getByLabel('Como aparecer no ranking');
      await apelido.fill('Demo E2E');
      await page.getByRole('dialog').getByRole('button', { name: 'Participar' }).click();
      await expect(page.getByText('Você entrou no desafio.')).toBeVisible();
      const ranking = page.getByRole('list', { name: 'Ranking' });
      await expect(ranking.getByText('Demo E2E')).toBeVisible();
      await expect(ranking.getByText('(você)')).toBeVisible();

      // Sai: a linha some do ranking e o convite para participar volta.
      await page.getByRole('button', { name: 'Sair do desafio' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Sair' }).click();
      await expect(page.getByText('Você saiu do desafio.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Participar' })).toBeVisible();

      // Dona encerra: o desafio fecha para todos.
      await dona.reload();
      await cartao.getByRole('button', { name: 'Encerrar agora' }).click();
      await dona.getByRole('dialog').getByRole('button', { name: 'Encerrar' }).click();
      await expect(dona.getByText('Desafio encerrado.', { exact: false })).toBeVisible();
      await page.reload();
      await expect(page.getByText('Este desafio terminou.', { exact: false })).toBeVisible();
    } finally {
      await donaCtx.close();
    }
  });
});

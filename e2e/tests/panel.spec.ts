import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TEAM_STORAGE_STATE } from '../playwright.config';
import { COMMUNITY_SLUG } from './community';

/**
 * O painel da comunidade (Fase 6), pela conta da equipe, dona da Academia Demo:
 * aprovar e recusar pedido, mudar papel, dar e tirar assento, convites (link,
 * lote) e criar e apagar uma comunidade. Lógica de negócio é dos testes da API;
 * aqui é a tela fazendo o caminho inteiro de verdade.
 *
 * O que muda na Academia Demo volta no fim pelo seed (idempotente), para as
 * fotos verem a comunidade como o seed a deixa. O Mailpit só recebe.
 */
test.use({ storageState: TEAM_STORAGE_STATE });

const ROOT = resolve(__dirname, '../..');

async function groupId(page: Page): Promise<string> {
  const grupos = (await (await page.request.get('/api/proxy/groups')).json()) as Array<{
    id: string;
    slug: string;
  }>;
  return grupos.find((g) => g.slug === COMMUNITY_SLUG)!.id;
}

const linha = (page: Page, nome: string) =>
  page
    .getByRole('list', { name: 'Membros da comunidade' })
    .getByRole('listitem')
    .filter({ hasText: nome });

test.describe('painel da comunidade', () => {
  test.skip(({ isMobile }) => !isMobile, 'fluxos rodam uma vez, no celular');

  test.afterAll(() => {
    execSync('pnpm -s db:seed:demo', { cwd: ROOT, stdio: 'ignore' });
  });

  test('aprova um pedido, recusa outro, muda papel e dá e tira assento', async ({ page }) => {
    const id = await groupId(page);
    await page.goto(`/org/${id}/members?filtro=pending`);

    await linha(page, 'Lara Mendes').getByRole('button', { name: 'Aprovar' }).click();
    await expect(page.getByText('Lara Mendes entrou na comunidade.')).toBeVisible();

    await linha(page, 'Marcos Reis').getByRole('button', { name: 'Recusar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Recusar' }).click();
    await expect(page.getByText('Nenhum pedido aguardando')).toBeVisible();

    await page.getByRole('button', { name: 'Todos' }).click();
    const diego = linha(page, 'Diego Lima');
    await diego.getByRole('combobox', { name: 'Papel de Diego Lima' }).click();
    await page.getByRole('option', { name: 'Profissional' }).click();
    await expect(page.getByText('Diego Lima agora é profissional.')).toBeVisible();
    await page.getByRole('button', { name: 'Equipe' }).click();
    await expect(linha(page, 'Diego Lima')).toBeVisible();
    await linha(page, 'Diego Lima').getByRole('combobox').click();
    await page.getByRole('option', { name: 'Membro' }).click();
    await expect(page.getByText('Diego Lima agora é membro.')).toBeVisible();
    await expect(linha(page, 'Diego Lima')).toHaveCount(0);

    await page.getByRole('button', { name: 'Todos' }).click();
    await linha(page, 'Diego Lima').getByRole('button', { name: 'Dar assento' }).click();
    await expect(page.getByText('Diego Lima ganhou um assento PRO.')).toBeVisible();
    await page.goto(`/org/${id}/seats`);
    await expect(page.getByText('2 de 3 em uso · cortesia')).toBeVisible();
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Diego Lima' })
      .getByRole('button', { name: 'Tirar' })
      .click();
    await expect(page.getByText('1 de 3 em uso · cortesia')).toBeVisible();
  });

  test('convite: link aparece uma vez e vai para a lista; revogado some; lote diz os pulados', async ({
    page,
  }) => {
    const id = await groupId(page);
    await page.goto(`/org/${id}/invites`);

    await page.getByLabel('Limite de usos').fill('3');
    await page.getByRole('button', { name: 'Criar link' }).click();
    await expect(page.getByTestId('invite-url')).toContainText('/c/');
    const item = page.getByRole('listitem').filter({ hasText: 'Link · 0 de 3 usos' });
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: 'Revogar' }).click();
    await expect(item).toHaveCount(0);

    const carimbo = Date.now();
    await page
      .getByLabel(/E-mails \(um por linha/)
      .fill(`lote-${carimbo}@exemplo.com\nlote-${carimbo}@exemplo.com\nsem-arroba`);
    await expect(page.getByText('1 válido · 1 inválido · 1 repetido')).toBeVisible();
    await page.getByRole('button', { name: 'Convidar 1 pessoa' }).click();
    await expect(page.getByText('1 convite enviado')).toBeVisible();
    await expect(
      page.getByRole('listitem').filter({ hasText: `lote-${carimbo}@exemplo.com` }),
    ).toBeVisible();
  });

  test('cria uma comunidade, cai nos convites do painel, e apaga digitando o nome', async ({
    page,
  }) => {
    const nome = `Box E2E ${Date.now()}`;
    await page.goto('/community/new');
    await page.getByLabel('Nome').fill(nome);
    await page.getByRole('button', { name: 'Criar comunidade' }).click();
    await page.waitForURL(/\/org\/[0-9a-f-]{36}\/invites$/);
    await expect(page.getByRole('button', { name: 'Criar link' })).toBeVisible();

    await page.getByRole('link', { name: 'Configurações' }).click();
    await page.getByRole('button', { name: 'Apagar a comunidade' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByRole('button', { name: 'Apagar' })).toBeDisabled();
    await dialogo.getByLabel(/Digite o nome/).fill(nome);
    await dialogo.getByRole('button', { name: 'Apagar' }).click();
    await page.waitForURL(/\/community$/);
    await expect(page.getByText(nome)).toHaveCount(0);
  });
});

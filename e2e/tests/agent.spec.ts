import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TEAM_STORAGE_STATE } from '../playwright.config';
import { COMMUNITY_SLUG, newInvitePath, purgeDemo } from './community';

/**
 * O agente da comunidade (Fase 7c), de ponta a ponta sem gastar modelo: o dono
 * dá nome e orientações e liga; o demo entra pela comunidade e encontra o
 * agente para escolher no chat; o dono desliga e ele some. Nenhuma mensagem é
 * enviada — o que o agente responde é medido no benchmark (`apps/agent`). No
 * fim o demo sai e o seed refaz o agente.
 */
const ROOT = resolve(__dirname, '../..');

async function groupId(page: Page): Promise<string> {
  const grupos = (await (await page.request.get('/api/proxy/groups')).json()) as Array<{
    id: string;
    slug: string;
  }>;
  return grupos.find((g) => g.slug === COMMUNITY_SLUG)!.id;
}

test.describe('agente da comunidade', () => {
  test.skip(({ isMobile }) => !isMobile, 'fluxos rodam uma vez, no celular');

  test.afterAll(() => {
    purgeDemo();
    execSync('pnpm -s db:seed:demo', { cwd: ROOT, stdio: 'ignore' });
  });

  test('o dono configura e liga; o membro escolhe no chat; desligado, some', async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(180_000);
    const nome = `Coach E2E ${Date.now() % 100000}`;
    const donoCtx = await browser.newContext({
      ...info.project.use,
      storageState: TEAM_STORAGE_STATE,
    });
    const dono = await donoCtx.newPage();
    const id = await groupId(dono);

    try {
      // Dono: nome e orientações, ligado.
      await dono.goto(`/org/${id}/agent`);
      const campoNome = dono.getByLabel('Nome');
      await campoNome.fill(nome);
      await dono
        .getByLabel('Orientações', { exact: true })
        .fill('Sugira os planos prontos da casa.');
      await expect(dono.getByRole('switch', { name: /Ligado no chat/ })).toBeChecked();
      await dono.getByRole('button', { name: 'Salvar' }).click();
      await expect(dono.getByText('Agente salvo e ligado no chat.')).toBeVisible();

      // Membro: entra e encontra o agente no chat (o plano é dublado: o demo é Free).
      await page.goto(newInvitePath());
      await page.getByRole('button', { name: 'Aceitar e entrar' }).click();
      await page.waitForURL(/\/community\/[0-9a-f-]{36}$/);
      const agentes = (await (await page.request.get('/api/proxy/chat/agents')).json()) as {
        defaultGroupId: string | null;
        agents: Array<{ groupId: string; name: string; communityName: string }>;
      };
      expect(agentes.agents).toEqual([
        expect.objectContaining({ groupId: id, name: nome, communityName: 'Academia Demo' }),
      ]);
      // Sem assento pago pela comunidade, o padrão é o assistente da Fatia.
      expect(agentes.defaultGroupId).toBeNull();

      await page.route('**/api/proxy/chat/availability', (route) =>
        route.fulfill({
          json: { available: true, photos: false, dictation: false, allowed: true, reason: 'ok' },
        }),
      );
      await page.goto('/chat');
      const escolha = page.getByRole('radiogroup', { name: 'Com quem conversar' });
      await expect(escolha.getByRole('radio', { name: /Fatia/ })).toBeChecked();
      await escolha.getByText(nome).click();
      await expect(
        page.getByText(`Conversando com ${nome}, o agente da sua comunidade.`),
      ).toBeVisible();

      // Dono desliga: o agente sai da escolha do membro.
      await dono.getByRole('switch', { name: /Ligado no chat/ }).click();
      await dono.getByRole('button', { name: 'Salvar' }).click();
      await expect(dono.getByText('Agente salvo. Ele está desligado.')).toBeVisible();
      await page.reload();
      await expect(page.getByRole('textbox', { name: 'Mensagem para o Fatia' })).toBeVisible();
      await expect(page.getByRole('radiogroup', { name: 'Com quem conversar' })).toHaveCount(0);
    } finally {
      await donoCtx.close();
    }
  });
});

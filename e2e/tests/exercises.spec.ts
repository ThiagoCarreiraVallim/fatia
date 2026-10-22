import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TEAM_STORAGE_STATE } from '../playwright.config';
import { COMMUNITY_SLUG, newInvitePath, purgeDemo } from './community';

/**
 * Catálogo de exercícios da comunidade (Fase 7b), de ponta a ponta: a equipe
 * põe um vídeo no exercício da casa (que vai ao bucket de verdade, o SeaweedFS
 * do compose); o demo entra pela comunidade, vê o tutorial com o vídeo
 * assinado e acha o exercício pelo filtro "Na minha academia". No fim o vídeo
 * sai pela API (o que também o apaga do bucket), o demo sai e o seed refaz o
 * resto.
 */
const ROOT = resolve(__dirname, '../..');
const DA_CASA = 'Leg press 45° da casa';

/** O começo de um MP4 (caixa `ftyp`): é o que a API confere. Não precisa tocar. */
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypmp42'),
  Buffer.alloc(2048),
]);

async function groupId(page: Page): Promise<string> {
  const grupos = (await (await page.request.get('/api/proxy/groups')).json()) as Array<{
    id: string;
    slug: string;
  }>;
  return grupos.find((g) => g.slug === COMMUNITY_SLUG)!.id;
}

test.describe('catálogo de exercícios da comunidade', () => {
  test.skip(({ isMobile }) => !isMobile, 'fluxos rodam uma vez, no celular');

  test.afterAll(() => {
    purgeDemo();
    execSync('pnpm -s db:seed:demo', { cwd: ROOT, stdio: 'ignore' });
  });

  test('a equipe grava o vídeo da casa; o membro vê o tutorial e filtra pela academia', async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(180_000);
    const equipeCtx = await browser.newContext({
      ...info.project.use,
      storageState: TEAM_STORAGE_STATE,
    });
    const equipe = await equipeCtx.newPage();
    const id = await groupId(equipe);
    let exercicioId: string | null = null;

    try {
      // Equipe: vídeo no exercício da casa.
      await equipe.goto(`/org/${id}/exercises`);
      await equipe.getByRole('link', { name: new RegExp(DA_CASA) }).click();
      await equipe.waitForURL(/\/exercises\/\d+$/);
      exercicioId = equipe.url().split('/').pop()!;
      await equipe
        .getByLabel('Vídeo', { exact: true })
        .setInputFiles({ name: 'leg.mp4', mimeType: 'video/mp4', buffer: MP4 });
      const video = equipe.getByLabel('Vídeo do tutorial');
      await expect(video).toBeVisible({ timeout: 30_000 });
      // O vídeo só abre assinado.
      const src = (await video.getAttribute('src'))!;
      expect((await equipe.request.get(src.split('?')[0]!)).status()).toBe(403);
      await equipe.getByRole('button', { name: 'Salvar' }).click();
      await expect(equipe.getByText('Exercício salvo.')).toBeVisible();

      // Membro: entra, vê o tutorial com o vídeo.
      await page.goto(newInvitePath());
      await page.getByRole('button', { name: 'Aceitar e entrar' }).click();
      await page.waitForURL(/\/community\/[0-9a-f-]{36}$/);
      await page.goto(`/community/${id}/content?tab=exercises`);
      await page.getByRole('button', { name: new RegExp(DA_CASA) }).click();
      const tutorial = page.getByRole('region', { name: 'Tutorial de Academia Demo' });
      await expect(tutorial).toBeVisible();
      const assinado = (await tutorial.locator('video').getAttribute('src'))!;
      const baixado = await page.request.get(assinado);
      expect(baixado.status()).toBe(200);
      expect((await baixado.body()).subarray(4, 8).toString('latin1')).toBe('ftyp');
      await expect(tutorial.locator('strong').first()).toHaveText('fundo da sala');

      // "Na minha academia" no seletor do plano: o exercício da casa vem primeiro, marcado.
      const planos = (await (await page.request.get('/api/proxy/workout/plans')).json()) as Array<{
        id: string;
      }>;
      await page.goto(`/workout/plans/${planos[0]!.id}`);
      await page.getByRole('button', { name: 'Adicionar exercício' }).click();
      await page.getByText('Na minha academia').click();
      const primeiro = page.getByRole('dialog').getByRole('listitem').first();
      await expect(primeiro).toContainText(DA_CASA);
      await expect(primeiro).toContainText('Academia Demo');
    } finally {
      // Tirar o vídeo pela API apaga o objeto do bucket e a linha.
      if (exercicioId) {
        await equipe.request.put(`/api/proxy/groups/${id}/content/exercises/${exercicioId}/guide`, {
          data: { videoFileId: null },
        });
      }
      await equipeCtx.close();
    }
  });
});

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { TEAM_STORAGE_STATE } from '../playwright.config';
import { COMMUNITY_SLUG, newInvitePath, purgeDemo } from './community';

/**
 * Planos prontos e dicas (Fase 7a), de ponta a ponta: a equipe publica uma dica
 * com imagem (que vai ao bucket de verdade, o SeaweedFS do compose) e o
 * treino em rascunho do seed; o demo entra pela comunidade, vê a dica e adota
 * o treino. Tudo volta no fim: a dica é apagada pela tela (leva a imagem), o
 * plano adotado sai, o demo sai da comunidade e o seed refaz o resto.
 */
const ROOT = resolve(__dirname, '../..');
const DRAFT = 'Braços (rascunho)';

/** PNG 64×64 de uma cor, montado à mão: sem arquivo de fixture no repositório. */
function png(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, sum]);
  };
  const w = 64;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x2c)]);
  const raw = Buffer.concat(Array.from({ length: w }, () => linha));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function groupId(page: Page): Promise<string> {
  const grupos = (await (await page.request.get('/api/proxy/groups')).json()) as Array<{
    id: string;
    slug: string;
  }>;
  return grupos.find((g) => g.slug === COMMUNITY_SLUG)!.id;
}

test.describe('planos prontos e dicas', () => {
  test.skip(({ isMobile }) => !isMobile, 'fluxos rodam uma vez, no celular');

  test.afterAll(() => {
    purgeDemo();
    execSync('pnpm -s db:seed:demo', { cwd: ROOT, stdio: 'ignore' });
  });

  test('a equipe publica dica com imagem e um treino; o membro vê e adota', async ({
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
    const titulo = `Dica E2E ${Date.now()}`;
    let planoAdotado: string | null = null;
    let dicaId: string | null = null;

    try {
      // Equipe: dica com imagem.
      await equipe.goto(`/org/${id}/content/tips/new`);
      await equipe.getByLabel('Título').fill(titulo);
      await equipe.getByLabel('Texto').fill('Alongue **5 minutos** depois do treino.');
      await equipe
        .getByLabel('Imagem')
        .setInputFiles({ name: 'dica.png', mimeType: 'image/png', buffer: png() });
      const imagem = equipe.locator('form img');
      await expect(imagem).toBeVisible({ timeout: 20_000 });
      // A imagem guardada é WebP e só abre assinada.
      const src = (await imagem.getAttribute('src'))!;
      expect(src).toContain('.webp');
      expect((await equipe.request.get(src.split('?')[0]!)).status()).toBe(403);

      await equipe.getByRole('button', { name: 'Criar rascunho' }).click();
      await equipe.waitForURL(/\/content\/tips\/[0-9a-f-]{36}$/);
      dicaId = equipe.url().split('/').pop()!;
      await equipe.getByRole('button', { name: 'Publicar' }).click();
      await expect(equipe.getByText('Publicada para os membros.')).toBeVisible();

      // Equipe: o treino em rascunho do seed vai ao ar.
      await equipe.goto(`/org/${id}/content`);
      await equipe.getByRole('link', { name: DRAFT }).click();
      await equipe.getByRole('button', { name: 'Publicar' }).click();
      await expect(equipe.getByText('Publicado para os membros.')).toBeVisible();

      // Membro: entra pela comunidade, vê a dica com a imagem e adota o treino.
      await page.goto(newInvitePath());
      await page.getByRole('button', { name: 'Aceitar e entrar' }).click();
      await page.waitForURL(/\/community\/[0-9a-f-]{36}$/);
      await page
        .getByRole('navigation', { name: 'Seções da comunidade' })
        .getByRole('link', { name: 'Planos e dicas' })
        .click();
      await page.waitForURL(/\/community\/[0-9a-f-]{36}\/content$/);

      await page.goto(`/community/${id}/content?tab=tips`);
      const artigo = page.getByRole('article').filter({ hasText: titulo });
      await expect(artigo.locator('strong')).toHaveText('5 minutos');
      await expect
        .poll(() => artigo.locator('img').evaluate((el: HTMLImageElement) => el.naturalWidth))
        .toBeGreaterThan(0);

      await page.goto(`/community/${id}/content`);
      await page.getByRole('link', { name: DRAFT }).click();
      await page.getByRole('button', { name: 'Adotar plano' }).click();
      await page.waitForURL(/\/workout\/plans\/[0-9a-f-]{36}$/);
      planoAdotado = page.url().split('/').pop()!;
      await expect(page.getByText('Rosca Scott')).toBeVisible();

      // Voltar ao plano da comunidade mostra "Abrir meu plano", não outra adoção.
      await page.goBack();
      await expect(page.getByRole('link', { name: 'Abrir meu plano' })).toBeVisible();
    } finally {
      if (planoAdotado) await page.request.delete(`/api/proxy/workout/plans/${planoAdotado}`);
      if (dicaId) {
        await equipe.goto(`/org/${id}/content/tips/${dicaId}`);
        await equipe.getByRole('button', { name: 'Apagar' }).click();
        await equipe.getByRole('dialog').getByRole('button', { name: 'Apagar' }).click();
        await equipe.waitForURL(/\/content$/);
      }
      await equipeCtx.close();
    }
  });
});

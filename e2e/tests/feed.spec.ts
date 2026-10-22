import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TEAM_STORAGE_STATE } from '../playwright.config';
import { COMMUNITY_SLUG, newInvitePath, purgeDemo } from './community';

/**
 * O mural da comunidade (Fase 8b), de ponta a ponta: o demo entra na
 * comunidade, publica com apelido e imagem, reage, comenta e denuncia; a dona
 * remove o post dele pelo mural, e ele passa a ver o aviso; a dona restaura
 * pela Moderação e trata a denúncia do seed. No fim o demo apaga o post, sai
 * da comunidade, e o seed refaz o mural.
 */
const ROOT = resolve(__dirname, '../..');

// PNG de 1×1, o menor que o `sharp` aceita.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function groupId(page: Page): Promise<string> {
  const grupos = (await (await page.request.get('/api/proxy/groups')).json()) as Array<{
    id: string;
    slug: string;
  }>;
  return grupos.find((g) => g.slug === COMMUNITY_SLUG)!.id;
}

test.describe('mural da comunidade', () => {
  test.skip(({ isMobile }) => !isMobile, 'fluxos rodam uma vez, no celular');

  test.afterAll(() => {
    purgeDemo();
    execSync('pnpm -s db:seed:demo', { cwd: ROOT, stdio: 'ignore' });
  });

  test('o membro publica com imagem, comenta e denuncia; a dona remove, restaura e trata a fila', async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(180_000);
    const texto = `Treino de hoje feito! E2E ${Date.now() % 100000}`;
    const donaCtx = await browser.newContext({
      ...info.project.use,
      storageState: TEAM_STORAGE_STATE,
    });
    const dona = await donaCtx.newPage();
    const id = await groupId(dona);

    try {
      // Membro: entra, e a comunidade já abre no Mural.
      await page.goto(newInvitePath());
      await page.getByRole('button', { name: 'Aceitar e entrar' }).click();
      await page.waitForURL(/\/community\/[0-9a-f-]{36}$/);
      await expect(
        page
          .getByRole('navigation', { name: 'Seções da comunidade' })
          .getByRole('link', { name: 'Mural' }),
      ).toHaveAttribute('aria-current', 'page');
      await expect(page.getByText('Fixado pela equipe').first()).toBeVisible();

      // Publica com imagem; o apelido é pedido na primeira vez.
      await page.getByLabel('O que você quer contar para a comunidade?').fill(texto);
      await page.locator('form[aria-label="Novo post"] input[type="file"]').setInputFiles({
        name: 'treino.png',
        mimeType: 'image/png',
        buffer: PNG,
      });
      await expect(page.getByRole('img', { name: 'Foto 1' })).toBeVisible();
      await page.getByLabel('Seu apelido no mural').fill('Demo E2E');
      await page.getByRole('button', { name: 'Publicar' }).click();
      await expect(page.getByText('Publicado no mural.')).toBeVisible();
      const meu = page.getByRole('article', { name: 'Post de Demo E2E' });
      await expect(meu.getByText(texto)).toBeVisible();
      await expect(meu.getByRole('img', { name: 'Imagem 1 do post de Demo E2E' })).toBeVisible();

      // Reage e comenta no post fixado da equipe.
      const fixado = page.getByRole('article').filter({ hasText: 'Fixado pela equipe' }).first();
      await fixado.getByRole('button', { name: /^Força/ }).click();
      await expect(fixado.getByRole('button', { name: /^Força/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await fixado.getByRole('button', { name: /Comentar|comentário/ }).click();
      await fixado.getByLabel('Escreva um comentário').fill('Bora, equipe!');
      await fixado.getByRole('button', { name: 'Enviar' }).click();
      await expect(
        fixado.getByRole('list', { name: 'Comentários' }).getByText('Bora, equipe!'),
      ).toBeVisible();

      // Denuncia o post de propaganda do seed.
      const spam = page.getByRole('article').filter({ hasText: 'chama no direct' });
      await spam.getByRole('button', { name: /^Mais ações do post/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Denunciar' }).click();
      const denuncia = page.getByRole('dialog', { name: 'Denunciar post' });
      await denuncia.getByRole('radio', { name: 'Spam ou propaganda' }).check();
      await denuncia.getByRole('button', { name: 'Denunciar' }).click();
      await expect(page.getByText(/ninguém fica sabendo que foi você/)).toBeVisible();

      // Dona: remove o post do demo pelo mural (o caminho antigo, que os avisos
      // usam, redireciona para a raiz da comunidade).
      await dona.goto(`/community/${id}/feed`);
      await dona.waitForURL(new RegExp(`/community/${id}$`));
      const doDemo = dona.getByRole('article', { name: 'Post de Demo E2E' });
      await doDemo.getByRole('button', { name: 'Mais ações do post de Demo E2E' }).click();
      await dona.getByRole('dialog').getByRole('button', { name: 'Remover do mural' }).click();
      await dona.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
      await expect(dona.getByText(/Post removido do mural/)).toBeVisible();
      await expect(doDemo).toHaveCount(0);

      // O demo ainda vê o próprio post, com o aviso.
      await page.reload();
      await expect(meu.getByText('Removido pela equipe. Só você vê este post.')).toBeVisible();

      // Moderação: a denúncia do demo está na fila, sem o nome dele; restaura o post.
      await dona.goto(`/org/${id}/moderation`);
      const fila = dona.getByRole('list', { name: 'Denúncias abertas' });
      const item = fila.getByRole('listitem').filter({ hasText: 'chama no direct' });
      await expect(item.getByText(/denúncias?: spam ou propaganda/)).toBeVisible();
      await expect(fila.getByText('Demo E2E')).toHaveCount(0);
      await item.getByRole('button', { name: 'Remover' }).click();
      await expect(dona.getByText('Removido do mural.')).toBeVisible();
      const removidos = dona.getByRole('list', { name: 'Posts removidos' });
      await removidos
        .getByRole('listitem')
        .filter({ hasText: texto })
        .getByRole('button', { name: 'Restaurar' })
        .click();
      await expect(dona.getByText('Post de volta ao mural.')).toBeVisible();

      // O demo vê o post de volta e apaga.
      await page.reload();
      await expect(meu.getByText('Removido pela equipe', { exact: false })).toHaveCount(0);
      await meu.getByRole('button', { name: 'Mais ações do post de Demo E2E' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Apagar post' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Apagar' }).click();
      await expect(page.getByText('Post apagado.')).toBeVisible();
      await expect(meu).toHaveCount(0);
    } finally {
      await donaCtx.close();
    }
  });
});

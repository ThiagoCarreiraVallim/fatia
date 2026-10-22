import { expect, test } from '@playwright/test';

/**
 * Perfil → Notificações (Fase 8c) na web: o celular que o app cadastrou
 * aparece e sai pela tela, e a escolha de um tipo fica gravada. O cadastro do
 * aparelho é feito pela API, como o app faria; nenhum aviso sai (PUSH_ENABLED
 * desligado no dev). No fim tudo volta como estava.
 */
const TOKEN = `ExponentPushToken[e2e-${Date.now()}]`;

test.describe('notificações', () => {
  test.skip(({ isMobile }) => !isMobile, 'fluxos rodam uma vez, no celular');

  test.afterEach(async ({ page }) => {
    await page.request.put('/api/proxy/users/me/notifications', { data: { FEED: true } });
    const devices = (await (
      await page.request.get('/api/proxy/users/me/devices')
    ).json()) as Array<{
      id: string;
    }>;
    for (const d of devices) await page.request.delete(`/api/proxy/users/me/devices/${d.id}`);
  });

  test('o celular cadastrado aparece e sai; desligar um tipo fica gravado', async ({ page }) => {
    const r = await page.request.post('/api/proxy/users/me/devices', {
      data: { token: TOKEN, platform: 'ANDROID' },
    });
    expect(r.ok()).toBe(true);

    await page.goto('/profile/notifications');
    const comentarios = page.getByRole('switch', { name: /Comentários/ });
    await expect(comentarios).toBeChecked();
    await comentarios.click();
    await expect(comentarios).not.toBeChecked();

    await page.reload();
    await expect(page.getByRole('switch', { name: /Comentários/ })).not.toBeChecked();

    await page.getByRole('button', { name: 'Parar avisos no Android · usado hoje' }).click();
    await expect(page.getByText(/Nenhum ainda/)).toBeVisible();
  });
});

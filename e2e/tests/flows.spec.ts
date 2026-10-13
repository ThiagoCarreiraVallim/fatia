import { expect, test } from '@playwright/test';

/**
 * Fluxos de registro de ponta a ponta, na stack real (ADR 029).
 *
 * Cada fluxo desfaz o que criou, para não sujar o seed do usuário demo que as
 * fotos do `screens.spec.ts` usam. Rodam só no projeto `mobile`: o fluxo é o
 * mesmo no desktop, e rodar duas vezes só dobraria os registros temporários.
 */
test.skip(({ isMobile }) => !isMobile, 'fluxo roda uma vez, no celular');

/** `yyyy-MM-dd` de N dias atrás no fuso do navegador do teste. */
function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

test('refeição lançada em dia passado fica naquele dia', async ({ page }) => {
  // Fora dos 30 dias do seed: o dia começa vazio e o placeholder existe.
  const dia = diasAtras(45);
  const nome = `E2E sopa ${Date.now()}`;

  await page.goto(`/nutrition?date=${dia}`);
  await page.getByRole('button', { name: 'Registrar Lanche' }).click();
  await page.getByRole('button', { name: /inserir manualmente/i }).click();
  await page.getByLabel('Nome').fill(nome);
  await page.getByLabel('Gramas').fill('250');
  await page.getByRole('button', { name: /^adicionar$/i }).click();

  // O bug gravava em hoje: o item sumia da tela do dia escolhido.
  await expect(page.getByText(nome)).toBeVisible();
  await page.reload();
  await expect(page.getByText(nome)).toBeVisible();

  // Remover pede confirmação; cancelar mantém.
  await page.getByRole('button', { name: 'Remover refeição' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText(nome)).toBeVisible();

  await page.getByRole('button', { name: 'Remover refeição' }).click();
  await dialog.getByRole('button', { name: 'Remover' }).click();
  await expect(page.getByText(nome)).toHaveCount(0);
});

test('adicionar exercício no treino livre não registra série', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'INICIAR TREINO LIVRE' }).click();
  await expect(page.getByRole('heading', { name: 'Treino em andamento' })).toBeVisible();

  try {
    await page.getByRole('button', { name: 'Adicionar exercício' }).click();
    await page.getByPlaceholder(/supino, corrida/).fill('supino');
    const escolhido = page
      .getByRole('dialog')
      .getByRole('button', { name: /supino/i })
      .first();
    const nome = (await escolhido.locator('p').first().textContent())?.trim() ?? '';
    await escolhido.click();

    // Aparece em foco, pronto para a primeira série real...
    await expect(page.getByRole('heading', { name: nome })).toBeVisible();
    await expect(page.getByText('EM ANDAMENTO', { exact: true })).toBeVisible();

    // ...e nada foi gravado na sessão.
    const res = await page.request.get('/api/proxy/workout/sessions/active');
    expect(res.ok()).toBe(true);
    const sessao = (await res.json()) as { sets: unknown[] };
    expect(sessao.sets).toHaveLength(0);
  } finally {
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Sim, cancelar treino' }).click();
    await expect(page.getByRole('button', { name: 'INICIAR TREINO LIVRE' })).toBeVisible();
  }
});

import { expect, type Page, test } from '@playwright/test';

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

/** O "+" global: abre o menu Registrar e escolhe o registro. */
async function registrarPeloMais(page: Page, item: string) {
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: item }).click();
}

/**
 * Rede de segurança dos fluxos: apaga as refeições do dia que têm o item do
 * teste. Uma sobra num dia antigo some o placeholder e quebra a rodada seguinte.
 */
async function apagarRefeicoesCom(page: Page, dia: string, nome: string) {
  const res = await page.request.get(`/api/proxy/nutrition/meals?date=${dia}`);
  if (!res.ok()) return;
  const meals = (await res.json()) as { id: string; items: { foodName: string }[] }[];
  for (const meal of meals.filter((m) => m.items.some((i) => i.foodName === nome))) {
    await page.request.delete(`/api/proxy/nutrition/meals/${meal.id}`);
  }
}

test('refeição lançada em dia passado fica naquele dia', async ({ page }) => {
  // Fora dos 30 dias do seed: o dia começa vazio e o placeholder existe.
  const dia = diasAtras(45);
  const nome = `E2E sopa ${Date.now()}`;
  try {
    await registrarEApagarNoDia(page, dia, nome);
  } finally {
    await apagarRefeicoesCom(page, dia, nome);
  }
});

async function registrarEApagarNoDia(page: Page, dia: string, nome: string) {
  await page.goto(`/nutrition?date=${dia}`);
  await page.getByRole('button', { name: 'Registrar Lanche' }).click();
  await page.getByRole('button', { name: /só desta vez/i }).click();
  await page.getByLabel('Nome').fill(nome);
  await page.getByLabel('Gramas').fill('250');
  await page.getByRole('button', { name: /^adicionar$/i }).click();
  // O drawer fica aberto para o próximo item; "Concluir" fecha.
  await expect(page.getByRole('status')).toContainText(`${nome} adicionado`);
  await page.getByRole('button', { name: /^concluir/i }).click();

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
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "13 out", como a lista de registros recentes mostra o dia. */
function diaMes(iso: string): string {
  return `${iso.slice(8, 10)} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
}

test('água, peso e passos registrados ontem ficam ontem', async ({ page }) => {
  const ontem = diaMes(diasAtras(1));
  const drawer = page.getByRole('dialog');
  await page.goto('/');

  /**
   * Abre o drawer pelo "+", volta um dia pela seta, registra e confere pela lista ao
   * reabrir (o dia voltou a hoje); depois apaga pela própria lista, para não
   * sujar o seed. O valor é incomum para não confundir com o do seed.
   */
  async function registrarOntem(opts: {
    item: string;
    campo: string | RegExp;
    valor: string;
    salvar: string;
    titulo: string;
  }) {
    await registrarPeloMais(page, opts.item);
    await expect(drawer.getByRole('button', { name: 'Próximo dia' })).toBeDisabled();
    await drawer.getByRole('button', { name: 'Dia anterior' }).click();
    await expect(drawer.getByText('ontem', { exact: true })).toBeVisible();
    await drawer.getByLabel(opts.campo).fill(opts.valor);
    await drawer.getByRole('button', { name: opts.salvar }).click();
    await expect(drawer).toHaveCount(0);

    await registrarPeloMais(page, opts.item);
    await expect(drawer.getByText('hoje', { exact: true })).toBeVisible();
    // A água põe a hora depois do dia: o nome do botão continua após a data.
    const linha = `${opts.titulo}, ${ontem}`;
    const editar = drawer.getByRole('button', { name: `Editar registro de ${linha}` });
    await expect(editar).toBeVisible();
    await drawer.getByRole('button', { name: `Apagar registro de ${linha}` }).click();
    await drawer.getByRole('button', { name: 'Apagar', exact: true }).click();
    await expect(editar).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  }

  await registrarOntem({
    item: 'Água',
    campo: /quantidade personalizada/i,
    valor: '333',
    salvar: 'Adicionar em ontem',
    titulo: '333 mL',
  });
  await registrarOntem({
    item: 'Peso',
    campo: 'Peso (kg)',
    valor: '77.7',
    salvar: 'Salvar em ontem',
    titulo: '77,7 kg',
  });
  await registrarOntem({
    item: 'Passos',
    campo: /^Passos$/,
    valor: '4321',
    salvar: 'Salvar em ontem',
    titulo: '4.321 passos',
  });
});

test('refeição pelo "+" atualiza o dashboard sem recarregar', async ({ page }) => {
  const nome = `E2E lanche ${Date.now()}`;
  await page.goto('/');
  const kcal = page.getByText('KCAL', { exact: true }).locator('xpath=following-sibling::span');
  await expect(kcal).toBeVisible();
  const antes = Number((await kcal.textContent())?.split('/')[0]);
  // O dia de hoje no fuso do navegador (o do perfil), não no do processo de teste.
  const hoje = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));

  try {
    await registrarPeloMais(page, 'Refeição');
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: /só desta vez/i }).click();
    await drawer.getByLabel('Nome').fill(nome);
    await drawer.getByLabel('Gramas').fill('100');
    await drawer.getByLabel(/^kcal$/i).fill('123');
    await drawer.getByRole('button', { name: /^adicionar$/i }).click();
    await expect(drawer.getByRole('status')).toContainText(`${nome} adicionado`);
    await drawer.getByRole('button', { name: /^concluir/i }).click();

    // Antes o card de macros só mudava com um refetch: sem reload aqui.
    await expect(kcal).toHaveText(new RegExp(`^${antes + 123}/`));
  } finally {
    // Limpa pelo nome: o dia de hoje do demo tem as refeições do seed.
    await apagarRefeicoesCom(page, hoje, nome);
  }
});

test('treino pelo "+" começa um livre e depois o retoma', async ({ page }) => {
  await page.goto('/');
  await registrarPeloMais(page, 'Começar treino livre');
  await expect(page).toHaveURL(/\/workout$/);
  await expect(page.getByRole('heading', { name: 'Treino em andamento' })).toBeVisible();

  try {
    // Com a sessão aberta, o "+" não cria outra.
    await registrarPeloMais(page, 'Continuar treino');
    await expect(page.getByRole('heading', { name: 'Treino em andamento' })).toBeVisible();
    const res = await page.request.get('/api/proxy/workout/sessions?limit=5');
    const abertas = ((await res.json()) as { completedAt: string | null }[]).filter(
      (s) => s.completedAt === null,
    );
    expect(abertas).toHaveLength(1);
  } finally {
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Sim, cancelar treino' }).click();
    await expect(page.getByRole('button', { name: 'INICIAR TREINO LIVRE' })).toBeVisible();
  }
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

test('atalhos: favoritar e adicionar dois recentes sem fechar o drawer', async ({ page }) => {
  // Dia vazio, mas dentro dos 60 dias de histórico: os recentes do seed aparecem.
  const dia = diasAtras(46);
  await page.goto(`/nutrition?date=${dia}`);
  await page.getByRole('button', { name: 'Registrar Almoço' }).click();

  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('Recentes')).toBeVisible();
  const recentes = drawer.getByRole('list', { name: 'Recentes' }).getByRole('listitem');
  const [primeiro, segundo] = await Promise.all([
    recentes.nth(0).getByRole('paragraph').first().textContent(),
    recentes.nth(1).getByRole('paragraph').first().textContent(),
  ]);

  // Favoritar sobe o alimento para "Favoritos"; desfavoritar devolve.
  await drawer.getByRole('button', { name: `Favoritar ${primeiro}` }).click();
  await expect(drawer.getByRole('button', { name: `Desfavoritar ${primeiro}` })).toBeVisible();
  await drawer.getByRole('button', { name: `Desfavoritar ${primeiro}` }).click();
  await expect(drawer.getByRole('button', { name: `Favoritar ${primeiro}` })).toBeVisible();

  for (const nome of [primeiro, segundo]) {
    await drawer.getByRole('button', { name: new RegExp(`^${escapeRegex(nome!)}`) }).click();
    await expect(drawer.getByLabel(/Quantidade/)).not.toHaveValue('100');
    await drawer.getByRole('button', { name: /^adicionar$/i }).click();
    await expect(drawer.getByRole('status')).toContainText(`${nome} adicionado`);
  }
  await drawer.getByRole('button', { name: /^concluir · 2 itens/i }).click();
  await expect(drawer).toBeHidden();

  // Os dois na MESMA refeição: um "Remover refeição" só, que leva os dois.
  await expect(page.getByRole('button', { name: `Remover ${primeiro}` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Remover ${segundo}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover refeição' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Remover refeição' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await expect(page.getByRole('button', { name: 'Remover refeição' })).toHaveCount(0);
  // Do servidor, não do cache: o teste não pode deixar refeição para trás no demo.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Registrar Jantar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover refeição' })).toHaveCount(0);
});

test('medida caseira: 2 colheres de sopa de arroz viram 50 g na refeição', async ({ page }) => {
  const dia = diasAtras(47);
  await page.goto(`/nutrition?date=${dia}`);
  await page.getByRole('button', { name: 'Registrar Jantar' }).click();

  const drawer = page.getByRole('dialog');
  await drawer.getByPlaceholder(/Ex\.: arroz/).fill('arroz tipo 1 cozido');
  await drawer
    .getByRole('button', { name: /^Arroz, tipo 1, cozido/ })
    .first()
    .click();

  // A medida do catálogo (medidas-caseiras.json): colher de sopa = 25 g.
  await drawer.getByRole('radio', { name: /colher de sopa/ }).click();
  await drawer.getByRole('button', { name: 'Mais' }).click();
  await drawer.getByRole('button', { name: 'Mais' }).click();
  await expect(drawer.getByText('= 50 g')).toBeVisible();
  await drawer.getByRole('button', { name: /^adicionar$/i }).click();
  await expect(drawer.getByRole('status')).toContainText('Arroz, tipo 1, cozido adicionado');
  await drawer.getByRole('button', { name: /^concluir · 1 item/i }).click();
  await expect(drawer).toBeHidden();

  await expect(page.getByText(/2 × colher de sopa \(50 g\)/)).toBeVisible();

  await page.getByRole('button', { name: 'Remover refeição' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await expect(page.getByRole('button', { name: 'Remover refeição' })).toHaveCount(0);
  // Do servidor, não do cache: o teste não pode deixar refeição para trás no demo.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Registrar Jantar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover refeição' })).toHaveCount(0);
});

test('copiar refeição para outro dia e registrar pela refeição salva', async ({ page }) => {
  const origem = diasAtras(48);
  const destino = diasAtras(49);
  const nome = `E2E ${Date.now()}`;

  // Uma refeição de um item, no dia de origem.
  await page.goto(`/nutrition?date=${origem}`);
  await page.getByRole('button', { name: 'Registrar Jantar' }).click();
  let drawer = page.getByRole('dialog');
  await drawer.getByPlaceholder(/Ex\.: arroz/).fill('banana prata');
  await drawer
    .getByRole('button', { name: /^Banana, prata, crua/ })
    .first()
    .click();
  await drawer.getByRole('button', { name: /^adicionar$/i }).click();
  await drawer.getByRole('button', { name: /^concluir · 1 item/i }).click();
  await expect(drawer).toBeHidden();

  // Copia para o dia de destino e salva como refeição salva.
  await page.getByRole('button', { name: 'Mais ações de Jantar' }).click();
  drawer = page.getByRole('dialog');
  await drawer.getByLabel('Dia de destino').fill(destino);
  await drawer.getByRole('button', { name: /^Copiar para / }).click();
  await expect(drawer.getByRole('status')).toContainText('Copiada para');
  // Copiar de novo não duplica: a API recusa e a tela diz por quê.
  await drawer.getByRole('button', { name: /^Copiar para / }).click();
  await expect(drawer.getByRole('alert')).toContainText('já foi copiada');
  await drawer.getByLabel('Nome da refeição salva').fill(nome);
  await drawer.getByRole('button', { name: 'Salvar refeição' }).click();
  await expect(drawer.getByText(`"${nome}" salva`)).toBeVisible();
  await drawer.getByRole('link', { name: /^Ver / }).click();
  await expect(page).toHaveURL(new RegExp(`date=${destino}`));
  await expect(page.getByText(/Banana, prata, crua/)).toBeVisible();

  // No destino, um lanche pela refeição salva: duas refeições no dia.
  await page.getByRole('button', { name: 'Registrar Lanche' }).click();
  drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: new RegExp(`^${escapeRegex(nome)}`) }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Remover refeição' })).toHaveCount(2);

  // Limpeza: refeição salva, as duas do destino e a da origem.
  await page.getByRole('button', { name: 'Registrar Café da manhã' }).click();
  drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: `Apagar ${nome}` }).click();
  await drawer.getByRole('button', { name: `Confirmar apagar ${nome}` }).click();
  await expect(drawer.getByRole('button', { name: `Apagar ${nome}` })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  for (const dia of [destino, origem]) {
    await page.goto(`/nutrition?date=${dia}`);
    // Contar antes de o dia carregar daria zero e pularia a limpeza.
    await expect(page.getByRole('button', { name: 'Registrar Café da manhã' })).toBeVisible();
    const remover = page.getByRole('button', { name: 'Remover refeição' });
    while ((await remover.count()) > 0) {
      const antes = await remover.count();
      await remover.first().click();
      await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
      await expect(remover).toHaveCount(antes - 1);
    }
    await page.reload();
    await expect(page.getByRole('button', { name: 'Registrar Jantar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remover refeição' })).toHaveCount(0);
  }
});

test('alimento próprio: cria pela busca, registra por porção e apaga sem perder o histórico', async ({
  page,
}) => {
  const dia = diasAtras(50);
  const nome = `E2E Granola ${Date.now()}`;

  await page.goto(`/nutrition?date=${dia}`);
  await page.getByRole('button', { name: 'Registrar Café da manhã' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByPlaceholder(/Ex\.: arroz/).fill(nome);
  await drawer.getByRole('button', { name: `Criar "${nome}"` }).click();

  // O rótulo como vem no pacote: porção de 40 g.
  await expect(drawer.getByLabel('Nome')).toHaveValue(nome);
  await drawer.getByLabel('Tamanho da porção (g)').fill('40');
  await drawer.getByLabel('Calorias (kcal)').fill('180');
  await drawer.getByLabel('Proteína (g)').fill('4');
  await drawer.getByLabel('Carboidrato (g)').fill('24');
  await drawer.getByLabel('Gordura (g)').fill('7,2');
  await expect(drawer.getByText(/Fica guardado como 450 kcal/)).toBeVisible();
  await drawer.getByRole('button', { name: 'Salvar e escolher quantidade' }).click();

  await drawer.getByRole('radio', { name: /porção · 40 g/ }).click();
  await drawer.getByRole('button', { name: /^adicionar$/i }).click();
  await drawer.getByRole('button', { name: /^concluir · 1 item/i }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: `Remover ${nome}` })).toBeVisible();
  await expect(page.getByText(/porção \(40 g\) · 180 kcal/)).toBeVisible();

  // Em Meus alimentos: apagar pede confirmação.
  await page.goto('/nutrition/foods');
  await page.getByRole('button', { name: `Editar ${nome}` }).click();
  await expect(page.getByLabel('Calorias (kcal)')).toHaveValue('450');
  await page.getByRole('button', { name: 'Apagar alimento' }).click();
  await page.getByRole('button', { name: 'Apagar', exact: true }).click();
  await expect(page.getByRole('button', { name: `Editar ${nome}` })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: `Editar ${nome}` })).toHaveCount(0);

  // A refeição guarda o nome e os valores: o histórico não muda.
  await page.goto(`/nutrition?date=${dia}`);
  await expect(page.getByRole('button', { name: `Remover ${nome}` })).toBeVisible();
  await expect(page.getByText(/180 kcal/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Remover refeição' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await expect(page.getByRole('button', { name: 'Remover refeição' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Registrar Jantar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover refeição' })).toHaveCount(0);
});

test('código de barras: lê pelo código digitado, guarda em Meus alimentos e registra a porção', async ({
  page,
}) => {
  const dia = diasAtras(52);
  const nome = `E2E Biscoito ${Date.now()}`;
  // O Open Food Facts fica de fora: a resposta da API é fixa, com um nome único.
  await page.route('**/api/proxy/nutrition/foods/barcode/**', (route) =>
    route.fulfill({
      json: {
        status: 'ok',
        product: {
          barcode: '7890000000017',
          name: nome,
          brand: null,
          basis: '100g',
          kcalPer100g: 400,
          proteinPer100g: 6,
          carbsPer100g: 70,
          fatPer100g: 10,
          servingSize: 30,
          servingLabel: '30 g',
        },
        attribution: {
          source: 'Open Food Facts',
          license: 'ODbL 1.0',
          url: 'https://world.openfoodfacts.org/product/7890000000017',
        },
      },
    }),
  );

  await page.goto(`/nutrition?date=${dia}`);
  await page.getByRole('button', { name: 'Registrar Café da manhã' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: 'Ler código de barras' }).click();
  await drawer.getByLabel('Digitar o código').fill('7890000000017');
  await drawer.getByRole('button', { name: 'Buscar' }).click();

  await expect(drawer.getByText(nome)).toBeVisible();
  await expect(drawer.getByRole('radio', { name: '1 porção (30 g)' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(drawer.getByText('Total: 120 kcal · P 1,8 · C 21 · G 3')).toBeVisible();
  await drawer.getByLabel('Guardar em Meus alimentos').check();
  await drawer.getByRole('button', { name: /^adicionar$/i }).click();
  await drawer.getByRole('button', { name: /^concluir · 1 item/i }).click();
  await expect(drawer).toBeHidden();

  // Guardado, o item entra ligado ao alimento, na medida "porção" do rótulo.
  await expect(page.getByRole('button', { name: `Remover ${nome}` })).toBeVisible();
  await expect(page.getByText(/porção \(30 g\) · 120 kcal/)).toBeVisible();

  // E aparece em Meus alimentos — a próxima vez é pela busca.
  await page.goto('/nutrition/foods');
  await page.getByRole('button', { name: `Editar ${nome}` }).click();
  await expect(page.getByLabel('Calorias (kcal)')).toHaveValue('400');
  await page.getByRole('button', { name: 'Apagar alimento' }).click();
  await page.getByRole('button', { name: 'Apagar', exact: true }).click();
  await expect(page.getByRole('button', { name: `Editar ${nome}` })).toHaveCount(0);

  await page.goto(`/nutrition?date=${dia}`);
  await expect(page.getByRole('button', { name: `Remover ${nome}` })).toBeVisible();
  await page.getByRole('button', { name: 'Remover refeição' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await expect(page.getByRole('button', { name: 'Remover refeição' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Registrar Jantar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover refeição' })).toHaveCount(0);
});

test('código de barras desconhecido leva ao cadastro à mão', async ({ page }) => {
  await page.route('**/api/proxy/nutrition/foods/barcode/**', (route) =>
    route.fulfill({
      status: 404,
      json: { statusCode: 404, message: 'Barcode not found' },
    }),
  );

  await page.goto(`/nutrition?date=${diasAtras(52)}`);
  await page.getByRole('button', { name: 'Registrar Café da manhã' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: 'Ler código de barras' }).click();
  await drawer.getByLabel('Digitar o código').fill('7890000000024');
  await drawer.getByRole('button', { name: 'Buscar' }).click();

  await expect(drawer.getByRole('alert')).toHaveText(
    'Esse código não está no Open Food Facts. Cadastre o produto pelo rótulo.',
  );
  await drawer.getByRole('button', { name: 'Cadastrar à mão' }).click();
  await expect(drawer.getByLabel('Tamanho da porção (g)')).toBeVisible();
});

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('recalcular metas pelo assistente salva a sugestão e volta às metas', async ({ page }) => {
  // O que o fluxo muda no demo, para devolver no fim: perfil, metas e pesagens.
  const perfil = await (await page.request.get('/api/proxy/users/me')).json();
  const metas = await (await page.request.get('/api/proxy/nutrition/goals')).json();
  const pesagens = (await (await page.request.get('/api/proxy/weight-logs')).json()) as {
    logs: { id: string }[];
  };
  const pesagensAntes = new Set(pesagens.logs.map((l) => l.id));

  try {
    await page.goto('/nutrition/goals');
    await page.getByRole('link', { name: /Recalcular com meus dados/ }).click();
    await expect(page).toHaveURL(/\/onboarding\?refazer=1$/);

    await page.getByRole('radio', { name: /Manter o peso/ }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('radio', { name: 'Masculino' }).click();
    await page.getByLabel('Data de nascimento').fill('1990-05-20');
    await page.getByLabel('Altura (cm)').fill('180');
    await page.getByLabel('Peso (kg)').fill('80');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('radio', { name: /^Leve/ }).click();
    await page.getByRole('button', { name: 'Calcular minhas metas' }).click();

    // 36 anos: 10·80 + 6,25·180 − 5·36 + 5 = 1750; × 1,375 = 2406 kcal/dia.
    await expect(page.getByText('2.406')).toBeVisible();
    await expect(page.getByLabel('Calorias: mínimo')).toHaveValue('2300');
    await page.getByRole('button', { name: 'Usar estas metas' }).click();

    await expect(page).toHaveURL(/\/nutrition\/goals$/);
    await expect(page.locator('#kcalMin')).toHaveValue('2300');
    await expect(page.locator('#kcalMax')).toHaveValue('2550');
  } finally {
    await page.request.patch('/api/proxy/users/me', {
      data: {
        heightCm: perfil.heightCm,
        sex: perfil.sex,
        birthDate: perfil.birthDate?.slice(0, 10),
        activityLevel: perfil.activityLevel,
        objective: perfil.objective,
      },
    });
    if (metas) {
      const corpo = { ...metas };
      delete corpo.userId;
      delete corpo.updatedAt;
      await page.request.put('/api/proxy/nutrition/goals', { data: corpo });
    }
    const depois = (await (await page.request.get('/api/proxy/weight-logs')).json()) as {
      logs: { id: string }[];
    };
    for (const log of depois.logs.filter((l) => !pesagensAntes.has(l.id))) {
      await page.request.delete(`/api/proxy/weight-logs/${log.id}`);
    }
  }
});

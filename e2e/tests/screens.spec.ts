import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Locator, type Page, test } from '@playwright/test';
import { TEAM_STORAGE_STATE } from '../playwright.config';
import { COMMUNITY_SLUG, grantSeatToDemo, newInvitePath, purgeDemo } from './community';

/**
 * `pnpm ui:snap <etapa>` (ADR 029): fotografa cada tela do PWA, em celular e
 * desktop, para comparar antes/depois de uma mudança de UI.
 *
 * Não é teste de regressão (não compara pixels nem falha por diferença): é o
 * registro visual que a revisão olha. A comparação lado a lado é o
 * `pnpm ui:compare <etapa-a> <etapa-b>`.
 *
 * Rotas dinâmicas são descobertas pela própria UI (primeiro link da lista),
 * então dependem do seed de demonstração que o `auth.setup.ts` roda.
 */
const STAGE = process.env.UI_STAGE ?? 'adhoc';

function shotPath(page: Page, name: string) {
  const project = test.info().project.name;
  const dir = resolve(__dirname, '..', 'screenshots', STAGE, project);
  mkdirSync(dir, { recursive: true });
  return resolve(dir, `${name}.png`);
}

async function settle(page: Page) {
  // Com teto: sem ele a espera ia até o fim do teste. Na rodada completa a aba
  // de exercícios da comunidade (Fase 7b) às vezes nunca fica ociosa no `next
  // dev`, sem nenhuma requisição aberta; isolada, fica em 60 ms.
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  // `networkidle` não basta com a API ocupada: a foto saía só com skeletons.
  await page
    .locator('.animate-pulse')
    .first()
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => undefined);
  // Transições de drawer.
  await page.waitForTimeout(600);
}

async function snap(page: Page, name: string, fullPage = true) {
  await settle(page);
  await page.screenshot({ path: shotPath(page, name), fullPage, animations: 'disabled' });
}

async function visit(page: Page, path: string, name: string) {
  await page.goto(path);
  await snap(page, name);
}

/**
 * Espera o controle aparecer. `networkidle` sai antes do React Query terminar
 * no dev server, e checar `isVisible()` na hora pulava o drawer em silêncio.
 */
async function appears(locator: Locator): Promise<boolean> {
  return locator
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
}

/** Primeiro href da página que casa com o prefixo, ou null. */
async function firstHref(page: Page, prefix: string): Promise<string | null> {
  const link = page.locator(`a[href^="${prefix}"]`).first();
  return (await link.count()) > 0 ? link.getAttribute('href') : null;
}

const STATIC_ROUTES: Array<[string, string]> = [
  ['/', '01-dashboard'],
  ['/nutrition', '10-nutricao'],
  ['/nutrition/goals', '11-nutricao-metas'],
  ['/nutrition/nutrient-targets', '12-nutricao-nutrientes'],
  ['/workout', '20-treino'],
  ['/workout/plans', '21-treino-planos'],
  ['/workout/history', '23-treino-historico'],
  ['/progress', '30-progresso'],
  ['/progress/records', '31-progresso-recordes'],
  ['/goals', '40-metas'],
  ['/community', '41-comunidade'],
  ['/profile', '50-perfil'],
  ['/profile/connect', '51-perfil-conectar-ia'],
  ['/plan', '52-plano'],
  ['/chat', '60-chat'],
  ['/students', '70-pro-alunos'],
  ['/privacy', '90-privacidade'],
  ['/terms', '91-termos'],
];

test.describe('telas', () => {
  for (const [path, name] of STATIC_ROUTES) {
    test(name, async ({ page }) => visit(page, path, name));
  }

  test('rotas dinâmicas de treino', async ({ page }) => {
    await page.goto('/workout/plans');
    await settle(page);
    const plan = await firstHref(page, '/workout/plans/');
    if (plan) await visit(page, plan, '22-treino-plano-detalhe');

    await page.goto('/workout/history');
    await settle(page);
    const session = await firstHref(page, '/workout/session/');
    if (session) await visit(page, session, '24-treino-sessao-detalhe');

    await page.goto('/workout');
    await settle(page);
    const quick = await firstHref(page, '/workout/quick/');
    if (quick) await visit(page, quick, '25-treino-rapido');
  });
});

test.describe('drawers de registro', () => {
  /** Abre o "+" global e escolhe o registro. Falso se o "+" não apareceu. */
  async function registrar(page: Page, item: string | RegExp): Promise<boolean> {
    const mais = page.getByRole('button', { name: 'Registrar', exact: true });
    if (!(await appears(mais))) return false;
    await mais.click();
    await page.getByRole('dialog').getByRole('button', { name: item }).click();
    return true;
  }

  test('dashboard: menu do "+"', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await snap(page, '26-dashboard-botao-registrar', false);
    const mais = page.getByRole('button', { name: 'Registrar', exact: true });
    if (!(await appears(mais))) return;
    await mais.click();
    await appears(page.getByRole('dialog').getByRole('button', { name: /treino/i }));
    await snap(page, '27-registrar-menu', false);
  });

  test('menu "Mais" (celular) e barra lateral (desktop)', async ({ page, isMobile }) => {
    await page.goto('/progress');
    await settle(page);
    if (!isMobile) {
      await snap(page, '36-barra-lateral', false);
      return;
    }
    const mais = page.getByRole('button', { name: 'Mais', exact: true });
    if (!(await appears(mais))) return;
    await mais.click();
    await appears(page.getByRole('dialog', { name: 'Menu' }));
    await snap(page, '35-menu-mais', false);
  });

  test('dashboard: água e peso', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    for (const [item, name] of [
      ['Água', '02-dashboard-drawer-agua'],
      ['Peso', '03-dashboard-drawer-peso'],
    ] as const) {
      if (!(await registrar(page, item))) continue;
      await snap(page, name, false);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });

  test('dashboard: água em ontem', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    if (!(await registrar(page, 'Água'))) return;
    // Só olha: volta um dia e fotografa, sem registrar nada.
    await page.getByRole('dialog').getByRole('button', { name: 'Dia anterior' }).click();
    await snap(page, '24-registrar-agua-ontem', false);
  });

  test('nutrição: busca de alimento', async ({ page }) => {
    await page.goto('/nutrition');
    await settle(page);
    const add = page.getByRole('button', { name: 'Adicionar item' }).first();
    if (!(await appears(add))) return;
    await add.click();
    // Atalhos (favoritos e recentes) carregam depois do drawer abrir.
    await appears(page.getByText('Recentes'));
    await snap(page, '13-nutricao-drawer-busca', false);
    const search = page.getByRole('textbox').first();
    if (await appears(search)) {
      await search.fill('arroz');
      await page.waitForTimeout(800);
      await snap(page, '14-nutricao-drawer-busca-resultado', false);
      // O alimento escolhido: onde se diz quanto comeu (gramas ou medida caseira).
      const arroz = page.getByRole('button', { name: /^Arroz, tipo 1, cozido/ }).first();
      if (await appears(arroz)) {
        await arroz.click();
        await page.waitForTimeout(500);
        await snap(page, '15-nutricao-drawer-alimento', false);
        const colher = page.getByRole('radio', { name: /colher de sopa/ });
        if (await appears(colher)) {
          await colher.click();
          await page.getByRole('button', { name: 'Mais' }).click();
          await page.waitForTimeout(300);
          await snap(page, '16-nutricao-drawer-medida', false);
        }
      }
    }
  });
});

test.describe('copiar e refeições salvas', () => {
  test('nutrição: ações da refeição, copiar dia e refeições salvas', async ({ page }) => {
    await page.goto('/nutrition');
    await settle(page);
    const mais = page.getByRole('button', { name: /^Mais ações de / }).first();
    if (!(await appears(mais))) return;
    await mais.click();
    await snap(page, '17-nutricao-acoes-refeicao', false);

    // Salva uma refeição só para a foto da seção, e apaga no fim.
    const nome = `Foto ${test.info().project.name}`;
    const drawer = page.getByRole('dialog');
    await drawer.getByLabel('Nome da refeição salva').fill(nome);
    await drawer.getByRole('button', { name: 'Salvar refeição' }).click();
    await appears(drawer.getByText(/salva\. Ela aparece/));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    const copiarDia = page.getByRole('button', { name: 'Copiar dia' });
    if (await appears(copiarDia)) {
      await copiarDia.click();
      await snap(page, '18-nutricao-copiar-dia', false);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    const registrar = page.getByRole('button', { name: /^Registrar / }).first();
    if (await appears(registrar)) {
      await registrar.click();
      await appears(page.getByText('Refeições salvas'));
      await snap(page, '19-nutricao-drawer-salvas', false);
    }
    // Limpeza pela própria UI, para não sobrar refeição salva no demo.
    const apagar = page.getByRole('button', { name: `Apagar ${nome}` });
    if (await appears(apagar)) {
      await apagar.click();
      await page.getByRole('button', { name: `Confirmar apagar ${nome}` }).click();
      await apagar.waitFor({ state: 'detached' }).catch(() => undefined);
    }
  });
});

test.describe('alimento personalizado', () => {
  test('nutrição: cadastro pelo drawer e Meus alimentos', async ({ page }) => {
    await page.goto('/nutrition');
    await settle(page);
    const registrar = page.getByRole('button', { name: /^Registrar / }).first();
    if (await appears(registrar)) {
      await registrar.click();
      const drawer = page.getByRole('dialog');
      await drawer.getByPlaceholder(/Ex\.: arroz/).fill('Granola da casa');
      const criar = drawer.getByRole('button', { name: 'Criar "Granola da casa"' });
      if (await appears(criar)) {
        await criar.click();
        // Preenche sem salvar: a foto não deixa alimento no demo.
        await drawer.getByLabel('Tamanho da porção (g)').fill('40');
        await drawer.getByLabel('Calorias (kcal)').fill('180');
        await drawer.getByLabel('Proteína (g)').fill('4');
        await drawer.getByLabel('Carboidrato (g)').fill('24');
        await drawer.getByLabel('Gordura (g)').fill('7,2');
        await snap(page, '20-nutricao-criar-alimento', false);
      }
      await page.keyboard.press('Escape');
    }

    await page.goto('/nutrition/foods');
    await settle(page);
    await snap(page, '21-meus-alimentos');
  });
});

test.describe('código de barras', () => {
  test('nutrição: leitor no drawer e produto lido', async ({ page }) => {
    // Resposta fixa: a foto não depende do Open Food Facts estar no ar.
    await page.route('**/api/proxy/nutrition/foods/barcode/**', (route) =>
      route.fulfill({
        json: {
          status: 'ok',
          product: {
            barcode: '7891000100103',
            name: 'Leite Condensado',
            brand: 'Moça',
            basis: '100g',
            kcalPer100g: 325,
            proteinPer100g: 7,
            carbsPer100g: 55,
            fatPer100g: 8,
            servingSize: 20,
            servingLabel: '20 g',
          },
          attribution: {
            source: 'Open Food Facts',
            license: 'ODbL 1.0',
            url: 'https://world.openfoodfacts.org/product/7891000100103',
          },
        },
      }),
    );
    await page.goto('/nutrition');
    await settle(page);
    const registrar = page.getByRole('button', { name: /^Registrar / }).first();
    if (!(await appears(registrar))) return;
    await registrar.click();
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Ler código de barras' }).click();
    // Sem câmera no navegador de teste: aparece o aviso, com o campo do código.
    await drawer.getByLabel('Digitar o código').waitFor();
    await settle(page);
    await snap(page, '22-nutricao-ler-codigo', false);

    await drawer.getByLabel('Digitar o código').fill('7891000100103');
    await drawer.getByRole('button', { name: 'Buscar' }).click();
    await drawer.getByText('Leite Condensado (Moça)').waitFor();
    // Não adiciona: a foto não deixa refeição no demo.
    await snap(page, '23-nutricao-produto-lido', false);
    await page.keyboard.press('Escape');
  });
});

test.describe('assistente de primeira vez', () => {
  // Pelo "refazer", que não depende de conta nova: o demo já tem perfil, então
  // os campos vêm preenchidos. Cancela no fim: nada é gravado.
  test('objetivo e metas sugeridas', async ({ page }) => {
    await page.goto('/onboarding?refazer=1');
    await appears(page.getByRole('radio', { name: /Perder peso/ }));
    await snap(page, '28-onboarding-objetivo', false);
    await page.getByRole('radio', { name: /Perder peso/ }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await appears(page.getByLabel('Altura (cm)'));
    await page.getByRole('button', { name: 'Continuar' }).click();
    const calcular = page.getByRole('button', { name: 'Calcular minhas metas' });
    if (!(await appears(calcular))) return;
    if (!(await page.getByRole('radio', { checked: true }).count())) {
      await page.getByRole('radio', { name: /Moderado/ }).click();
    }
    await calcular.click();
    if (!(await appears(page.getByRole('button', { name: 'Usar estas metas' })))) return;
    await snap(page, '29-onboarding-metas');
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });
});

/** O plano como a API devolve (ADR 024); as fotos simulam os estados. */
const PLANO_FREE = {
  tier: 'FREE',
  source: null,
  reason: 'sem_assinatura',
  degraded: false,
  status: null,
  interval: null,
  currentPeriodEnd: null,
  graceEndsAt: null,
  cancelAtPeriodEnd: false,
  paymentUrl: null,
  manageUrl: null,
  requiresPlan: true,
  webCheckout: true,
  prices: { monthlyCents: 1990, yearlyCents: 17900 },
};

test.describe('plano PRO', () => {
  test('Meu plano: Free, aguardando pagamento e PRO', async ({ page }) => {
    let plano: Record<string, unknown> = PLANO_FREE;
    await page.route('**/api/proxy/billing/plan', (route) => route.fulfill({ json: plano }));
    await page.goto('/plan?recurso=chat');
    await appears(page.getByLabel('CPF'));
    await snap(page, '37-plano-free');

    plano = {
      ...PLANO_FREE,
      source: 'ASAAS',
      reason: 'pendente',
      status: 'PENDING',
      interval: 'YEARLY',
      paymentUrl: 'https://sandbox.asaas.com/i/exemplo',
    };
    await page.reload();
    await appears(page.getByText(/aguardando a confirmação/i));
    await snap(page, '38-plano-pagamento');

    const fim = new Date(Date.now() + 30 * 86_400_000).toISOString();
    plano = {
      ...PLANO_FREE,
      tier: 'PRO',
      source: 'ASAAS',
      reason: 'ativa',
      status: 'ACTIVE',
      interval: 'YEARLY',
      currentPeriodEnd: fim,
    };
    await page.reload();
    await appears(page.getByRole('button', { name: 'Cancelar assinatura' }));
    await snap(page, '39-plano-pro');
  });

  test('chat no Free: upsell no lugar da conversa', async ({ page }) => {
    await page.route('**/api/proxy/chat/availability', (route) =>
      route.fulfill({
        json: {
          available: true,
          photos: true,
          dictation: true,
          allowed: false,
          reason: 'plan_required',
        },
      }),
    );
    await page.goto('/chat');
    await appears(page.getByRole('heading', { name: /faz parte do PRO/ }));
    await snap(page, '41-chat-upsell', false);
  });
});

test.describe('comunidade', () => {
  // O demo entra por convite e sai pelo `--purge`: as fotos do resto do app
  // continuam com o demo fora da Academia Demo.
  test.beforeEach(() => purgeDemo());
  test.afterEach(() => purgeDemo());

  test('convite, minhas comunidades, detalhe e o PRO pela comunidade', async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(180_000);
    const convite = newInvitePath();

    const anonimo = await browser.newContext({
      ...info.project.use,
      storageState: { cookies: [], origins: [] },
    });
    const fora = await anonimo.newPage();
    await fora.goto(convite);
    await appears(fora.getByRole('link', { name: 'Entrar para aceitar' }));
    await snap(fora, '43-convite-deslogado');
    await anonimo.close();

    await page.goto(convite);
    await appears(page.getByRole('button', { name: 'Aceitar e entrar' }));
    await page.getByRole('checkbox', { name: /Treino/ }).click();
    await page.getByRole('checkbox', { name: /Metas/ }).click();
    await snap(page, '44-convite-consentimento');

    await page.getByRole('button', { name: 'Aceitar e entrar' }).click();
    await page.waitForURL(/\/community\/[0-9a-f-]{36}$/);
    await appears(page.getByRole('heading', { name: 'O que eu compartilho' }));
    grantSeatToDemo();
    await page.reload();
    await appears(page.getByText('A comunidade paga seu PRO'));
    await snap(page, '45-comunidade-detalhe');

    await visit(page, '/community', '42-comunidades');
    await visit(page, '/plan', '46-plano-assento');

    // Planos e dicas da comunidade, do lado do membro (Fase 7a).
    const id = (await page.request.get('/api/proxy/groups').then((r) => r.json())).find(
      (g: { slug: string }) => g.slug === COMMUNITY_SLUG,
    ).id as string;
    await page.goto(`/community/${id}/content`);
    await appears(page.getByRole('link', { name: /Corpo inteiro para começar/ }));
    await snap(page, '93-comunidade-planos');
    await page.goto(`/community/${id}/content?tab=tips`);
    await appears(page.getByRole('heading', { name: 'Água antes do treino' }));
    await snap(page, '94-comunidade-dicas');
    await page.goto(`/community/${id}/content`);
    await page.getByRole('link', { name: /Cutting 1.800 kcal/ }).click();
    await page.getByRole('button', { name: 'Adotar plano' }).click();
    await appears(page.getByRole('checkbox', { name: /Trocar minhas metas/ }));
    await snap(page, '95-adotar-nutricao');

    // Catálogo da comunidade, do lado do membro (Fase 7b).
    await page.goto(`/community/${id}/content?tab=exercises`);
    await appears(page.getByRole('button', { name: /Leg press 45° da casa/ }));
    await snap(page, '98-comunidade-exercicios');
    await page.getByRole('button', { name: /Supino Máquina/ }).click();
    await appears(page.getByRole('region', { name: 'Tutorial de Academia Demo' }));
    await snap(page, '99-exercicio-tutorial');

    // O agente da comunidade no chat (Fase 7c): com o assento pago por ela, a
    // conversa nova já começa com o agente dela marcado.
    await page.goto('/chat');
    await appears(page.getByRole('radio', { name: /Treinador Demo/ }));
    await snap(page, '101-chat-agente');
  });
});

test.describe('painel da comunidade', () => {
  // A conta da equipe, dona da Academia Demo. Só olha: nada muda aqui, e o que
  // muda (fluxos) fica em `panel.spec.ts`, que desfaz o que fez.
  test.use({ storageState: TEAM_STORAGE_STATE });

  test('visão geral, membros, membro, convites, lote, assentos, configurações e criar', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const grupos = (await (await page.request.get('/api/proxy/groups')).json()) as Array<{
      id: string;
      slug: string;
    }>;
    const id = grupos.find((g) => g.slug === COMMUNITY_SLUG)!.id;

    await page.goto(`/org/${id}`);
    await appears(page.getByText('Membros ativos'));
    await appears(page.getByLabel(/: \d+$/).first());
    await snap(page, '80-painel-visao-geral');

    await page.goto(`/org/${id}/members`);
    await appears(page.getByText('Lara Mendes'));
    await snap(page, '81-painel-membros');

    await page
      .getByRole('link', { name: /Ver dados/ })
      .first()
      .click();
    await appears(page.getByRole('navigation', { name: 'Categorias autorizadas' }));
    await snap(page, '82-painel-membro');

    await page.goto(`/org/${id}/invites`);
    await appears(page.getByRole('button', { name: 'Criar link' }));
    await snap(page, '83-painel-convites');
    await page
      .getByLabel(/E-mails \(um por linha/)
      .fill('email\nana@exemplo.com\nbia@exemplo.com\nana@exemplo.com\nsem-arroba');
    // Preencher rola a página; a foto inteira com a barra fixa no meio confunde.
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, '84-painel-convite-lote');

    await page.goto(`/org/${id}/seats`);
    await appears(page.getByText(/em uso/));
    await snap(page, '85-painel-assentos');

    await page.goto(`/org/${id}/settings`);
    await appears(page.getByText(COMMUNITY_SLUG));
    await snap(page, '86-painel-configuracoes');

    await visit(page, '/community/new', '87-criar-comunidade');

    // Planos e dicas, pela equipe (Fase 7a).
    await page.goto(`/org/${id}/content`);
    await appears(page.getByRole('link', { name: /Braços \(rascunho\)/ }));
    await snap(page, '88-painel-planos');
    await page.getByRole('link', { name: /Corpo inteiro para começar/ }).click();
    await appears(page.getByRole('list', { name: 'Exercícios publicados' }));
    await snap(page, '89-painel-plano');
    await page.goto(`/org/${id}/content`);
    await page.getByRole('tab', { name: 'Dicas' }).click();
    await page.getByRole('link', { name: /Aquecimento de 5 minutos/ }).click();
    await page.getByRole('button', { name: 'Ver prévia' }).click();
    await appears(page.getByLabel('Prévia da dica'));
    await snap(page, '92-painel-dica');

    // Catálogo de exercícios, pela equipe (Fase 7b).
    await page.goto(`/org/${id}/exercises`);
    await appears(page.getByRole('link', { name: /Leg press 45° da casa/ }));
    await snap(page, '96-painel-exercicios');
    await page.getByRole('link', { name: /Leg press 45° da casa/ }).click();
    await appears(page.getByLabel('Como executar'));
    await snap(page, '97-painel-exercicio');

    // O agente da comunidade, pelo dono (Fase 7c).
    await page.goto(`/org/${id}/agent`);
    await appears(page.getByLabel('Orientações', { exact: true }));
    await snap(page, '100-painel-agente');
  });

  test('desafios: o painel e, como participante, a lista e o ranking (Fase 8a)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const grupos = (await (await page.request.get('/api/proxy/groups')).json()) as Array<{
      id: string;
      slug: string;
    }>;
    const id = grupos.find((g) => g.slug === COMMUNITY_SLUG)!.id;
    await page.goto(`/org/${id}/challenges`);
    await appears(page.getByText('Semana ativa'));
    await snap(page, '102-painel-desafios');
    await page.getByRole('button', { name: 'Novo desafio' }).click();
    await appears(page.getByRole('radio', { name: /Calorias na meta/ }));
    await snap(page, '103-painel-desafio-novo');
    await page.goto(`/community/${id}/challenges`);
    await appears(page.getByRole('link', { name: /Maratona de treinos/ }));
    await snap(page, '104-desafios');
    await page.getByRole('link', { name: /Semana ativa/ }).click();
    await appears(page.getByRole('list', { name: 'Ranking' }));
    await snap(page, '105-desafio-ranking');
    await page.goto(`/community/${id}/challenges`);
    await page.getByRole('link', { name: /Maratona de treinos/ }).click();
    await appears(page.getByRole('list', { name: 'Ranking' }));
    await snap(page, '106-desafio-encerrado');
  });
});

test('login (sem sessão)', async ({ browser }, info) => {
  const context = await browser.newContext({
    ...info.project.use,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto('/login');
  await snap(page, '00-login');
  await page.getByRole('link', { name: 'Entrar' }).click();
  await page.locator('input[name="identifier"]').waitFor();
  await snap(page, '00-login-logto');
  await context.close();
});

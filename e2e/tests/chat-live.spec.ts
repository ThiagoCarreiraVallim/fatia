import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * A resposta do chat desacoplada da tela (ADR 035), sem gastar modelo: as rotas
 * do chat são dubladas no navegador. O que se prova é o comportamento da tela —
 * sair do chat no meio de uma resposta não a perde, o aviso acompanha a pessoa
 * pelo app, e reabrir uma conversa que ainda responde volta a acompanhá-la. O
 * lado do servidor (turno que não para quando o cliente sai, `live` com cursor,
 * `stop`) tem teste de integração em `apps/api/src/chat/__tests__`.
 */

const CONVERSA = '7b1e2d3c-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const PERGUNTA = 'quanto de proteína eu comi hoje?';
const RESPOSTA = 'Hoje você comeu 92 g de proteína.';

const quadro = (id: number, event: string, data: unknown) =>
  `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const respostaInteira = [
  quadro(1, 'start', { conversationId: CONVERSA, runId: 'run-e2e' }),
  quadro(2, 'messages', [
    { type: 'AIMessageChunk', content: RESPOSTA, id: 'ai-e2e' },
    { langgraph_node: 'agente' },
  ]),
  quadro(3, 'done', { status: 'completed', duration_ms: 3200, ttft_ms: 900 }),
].join('');

function linha(role: 'user' | 'assistant', content: string, id: string) {
  return {
    id,
    role,
    content,
    tools: null,
    metadata: role === 'assistant' ? { status: 'completed' } : null,
    runId: role === 'assistant' ? 'run-e2e' : null,
    review: null,
    createdAt: '2026-10-18T12:00:00Z',
  };
}

async function dublarChat(page: Page, conversa: () => Record<string, unknown> | null) {
  await page.route('**/api/proxy/chat/availability', (route) =>
    route.fulfill({
      json: { available: true, photos: false, dictation: false, allowed: true, reason: 'ok' },
    }),
  );
  await page.route('**/api/proxy/chat/quota', (route) =>
    route.fulfill({
      json: {
        spentMicros: 0,
        limitMicros: null,
        usedRatio: null,
        resetsAt: '2026-10-19T03:00:00.000Z',
        allowed: true,
      },
    }),
  );
  await page.route('**/api/proxy/chat/conversations', (route) =>
    route.fulfill({
      json: conversa()
        ? [
            {
              id: CONVERSA,
              title: 'Proteína',
              createdAt: '2026-10-18T12:00:00Z',
              updatedAt: '2026-10-18T12:00:00Z',
            },
          ]
        : [],
    }),
  );
  await page.route(`**/api/proxy/chat/conversations/${CONVERSA}`, (route) => {
    const atual = conversa();
    return atual
      ? route.fulfill({ json: atual })
      : route.fulfill({ status: 404, json: { message: 'Conversa não encontrada.' } });
  });
}

const sse = (route: Route, body: string) =>
  route.fulfill({ status: 200, contentType: 'text/event-stream', body });

test.describe('chat: a resposta continua fora da tela (ADR 035)', () => {
  test.skip(({ isMobile }) => !isMobile, 'fluxos rodam uma vez, no celular');

  test('sair do chat no meio da resposta não a perde: o aviso acompanha, e ela está lá na volta', async ({
    page,
  }) => {
    let gravada: Record<string, unknown> | null = null;
    await dublarChat(page, () => gravada);
    let liberarResposta!: () => void;
    const respostaLiberada = new Promise<void>((r) => (liberarResposta = r));
    await page.route('**/api/proxy/chat', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      // O agente "pensa" até o teste liberar: é a janela em que a pessoa sai.
      await respostaLiberada;
      gravada = {
        id: CONVERSA,
        title: 'Proteína',
        createdAt: '2026-10-18T12:00:00Z',
        updatedAt: '2026-10-18T12:00:01Z',
        running: false,
        messages: [linha('user', PERGUNTA, 'm1'), linha('assistant', RESPOSTA, 'm2')],
      };
      await sse(route, respostaInteira);
    });

    await page.goto(`/chat/${CONVERSA}`);
    const campo = page.getByRole('textbox', { name: 'Mensagem para o Fatia' });
    await expect(campo).toBeEnabled();
    await campo.fill(PERGUNTA);
    await page.getByRole('button', { name: 'Enviar mensagem' }).click();
    await expect(page.getByRole('button', { name: 'Parar resposta' })).toBeVisible();

    // Navegação do próprio app (sem recarregar): o runtime mora no layout. Treino,
    // e não Nutrição: no dev o selo do Next cobre o canto esquerdo da barra.
    await page.getByRole('link', { name: 'Treino' }).click();
    await expect(page).toHaveURL(/\/workout/);
    const aviso = page.getByRole('status').filter({ hasText: 'Respondendo…' });
    await expect(aviso).toBeVisible();

    liberarResposta();
    await expect(page.getByText('Resposta pronta')).toBeVisible();
    await expect(aviso).toBeHidden();

    await page.getByRole('button', { name: 'Abrir' }).click();
    await expect(page).toHaveURL(new RegExp(`/chat/${CONVERSA}$`));
    await expect(page.getByText(RESPOSTA)).toBeVisible();
  });

  test('reabrir uma conversa que ainda responde no servidor volta a acompanhá-la pelo live', async ({
    page,
  }) => {
    await dublarChat(page, () => ({
      id: CONVERSA,
      title: 'Proteína',
      createdAt: '2026-10-18T12:00:00Z',
      updatedAt: '2026-10-18T12:00:00Z',
      running: true,
      messages: [linha('user', PERGUNTA, 'm1')],
    }));
    const cursores: string[] = [];
    await page.route(`**/api/proxy/chat/conversations/${CONVERSA}/live**`, async (route) => {
      cursores.push(new URL(route.request().url()).searchParams.get('after') ?? '');
      await sse(route, respostaInteira);
    });
    let turnosNovos = 0;
    await page.route('**/api/proxy/chat', (route) => {
      if (route.request().method() === 'POST') turnosNovos += 1;
      return route.fallback();
    });

    await page.goto(`/chat/${CONVERSA}`);

    await expect(page.getByText(PERGUNTA)).toBeVisible();
    await expect(page.getByText(RESPOSTA)).toBeVisible();
    expect(cursores).toEqual(['0']);
    // A mesma resposta, vista de novo — nenhuma pergunta foi reenviada.
    expect(turnosNovos).toBe(0);
  });
});

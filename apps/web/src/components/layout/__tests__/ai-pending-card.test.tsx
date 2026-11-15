import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ChatStreamFrame } from '@fatia/api-client';
import { AiPendingCard } from '../ai-pending-card';

/** "Fatia · esperando você" (prancha `Al-H6c8`): aprovar fora da conversa, ADR 039 §6. */

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));

const toast = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    previewChatAction: vi.fn(),
    streamChat: vi.fn(),
    undoWrite: vi.fn(),
  };
});

import {
  getConversation,
  listConversations,
  previewChatAction,
  streamChat,
  undoWrite,
} from '@fatia/api-client';

const INTERRUPT = {
  id: 'int-42',
  value: {
    kind: 'confirm' as const,
    prompt: 'Confere o almoço antes de eu gravar?',
    actions: [
      {
        kind: 'confirm' as const,
        toolCallId: 'call-9',
        tool: 'log_meal',
        title: 'Registrar refeição',
        prompt: 'Registrar?',
        arguments: { mealType: 'LUNCH' },
      },
    ],
  },
};

function conversation() {
  return {
    id: 'c1',
    title: 'Registro do almoço',
    createdAt: '',
    updatedAt: '',
    messages: [
      {
        id: 'm1',
        role: 'assistant' as const,
        content: '',
        tools: null,
        metadata: { status: 'interrupted' as const, interrupt: INTERRUPT },
        runId: null,
        review: null,
        createdAt: '',
      },
    ],
  };
}

async function* frames(list: ChatStreamFrame[]) {
  for (const f of list) yield f;
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AiPendingCard enabled bottom={100} />
    </QueryClientProvider>,
  );
}

describe('AiPendingCard', () => {
  beforeEach(() => {
    vi.mocked(listConversations).mockResolvedValue([
      { id: 'c1', title: 'Registro do almoço', createdAt: '', updatedAt: '', state: 'waiting' },
    ]);
    vi.mocked(getConversation).mockResolvedValue(conversation());
    vi.mocked(previewChatAction).mockResolvedValue({
      valida: true,
      linhas: [
        { rotulo: 'Almoço · hoje, 12:40', valor: '≈ 410 kcal' },
        { rotulo: 'Frango grelhado', valor: '150 g' },
      ],
    });
    vi.mocked(streamChat).mockImplementation(() =>
      frames([{ event: 'done', data: { status: 'completed' } }]),
    );
  });

  afterEach(() => vi.clearAllMocks());

  it('mostra a prévia inteira e "Gravar assim" manda o resume com o interruptId certo', async () => {
    renderCard();
    expect(await screen.findByText('Frango grelhado')).toBeVisible();
    expect(listConversations).toHaveBeenCalledWith({ state: 'waiting', limit: 1 });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Gravar assim' }));

    await waitFor(() => expect(streamChat).toHaveBeenCalledOnce());
    expect(vi.mocked(streamChat).mock.calls[0]![0]).toEqual({
      conversationId: 'c1',
      resume: { interruptId: 'int-42', value: { approvals: { 'call-9': true } } },
    });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Gravado: Registrar refeição', expect.anything()),
    );
  });

  it('gravou a refeição: "Almoço gravado" com "Desfazer", que apaga o registro criado', async () => {
    vi.mocked(undoWrite).mockResolvedValue(undefined);
    vi.mocked(streamChat).mockImplementation(() =>
      frames([
        {
          event: 'updates',
          data: {
            ferramentas: {
              messages: [
                {
                  type: 'tool',
                  name: 'log_meal',
                  tool_call_id: 'call-9',
                  status: 'success',
                  content: JSON.stringify({ id: 'meal-77', mealType: 'LUNCH' }),
                },
              ],
            },
          },
        },
        { event: 'done', data: { status: 'completed' } },
      ]),
    );
    renderCard();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Gravar assim' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'Almoço gravado',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Desfazer' }) }),
      ),
    );
    const options = toast.mock.calls.find((c) => c[0] === 'Almoço gravado')![1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();
    expect(undoWrite).toHaveBeenCalledWith({
      tool: 'log_meal',
      id: 'meal-77',
      message: 'Almoço gravado',
    });
  });

  it('"Responder" abre a conversa', async () => {
    renderCard();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Responder' }));
    expect(nav.push).toHaveBeenCalledWith('/chat/c1');
  });

  it('prévia que não cabe vira "Abrir conversa", sem aprovar daqui (ADR 039 §6)', async () => {
    vi.mocked(previewChatAction).mockResolvedValue({
      valida: true,
      linhas: Array.from({ length: 9 }, (_, i) => ({ rotulo: `item ${i}`, valor: '1' })),
    });
    renderCard();
    expect(await screen.findByRole('button', { name: 'Abrir conversa' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Gravar assim' })).toBeNull();
  });

  it('a conversa mudou desde a pausa (409): avisa e só deixa abrir a conversa', async () => {
    vi.mocked(streamChat).mockImplementation(() =>
      frames([
        { event: 'error', data: { code: 'CHAT_RESUME_MISMATCH' } },
        { event: 'done', data: { status: 'error' } },
      ]),
    );
    renderCard();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Gravar assim' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Abrir conversa' })).toBeVisible();
    expect(toast).not.toHaveBeenCalled();
  });

  it('"Lembrar depois" esconde o cartão', async () => {
    renderCard();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Lembrar depois' }));
    expect(screen.queryByRole('status', { name: 'Fatia esperando você' })).toBeNull();
  });
});

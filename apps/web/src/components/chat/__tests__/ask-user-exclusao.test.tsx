import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ChatActionPreview, ChatInterruptValue } from '@fatia/api-client';

const previewChatAction = vi.fn<(tool: string, args: unknown) => Promise<ChatActionPreview>>();
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    previewChatAction: (t: string, a: unknown) => previewChatAction(t, a),
    getAiConsent: vi.fn(async () => ({})),
  };
});
const { AskUser } = await import('../ask-user');

describe('cartão de exclusão (#490, ADR 051)', () => {
  it('cartão de exclusão sem o nome do registro (prévia falhou) não deixa aprovar', async () => {
    previewChatAction.mockRejectedValue(new Error('fora do ar'));
    const pausa: ChatInterruptValue = {
      kind: 'confirm',
      prompt: 'Excluir refeição',
      actions: [
        {
          kind: 'confirm',
          toolCallId: 'd1',
          tool: 'delete_meal',
          title: 'Excluir refeição',
          prompt: 'Excluir refeição',
          arguments: { id: '11111111-2222-4333-8444-555555555555' },
        },
      ],
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AskUser pausa={pausa} ocupado={false} onResponder={vi.fn()} />
      </QueryClientProvider>,
    );
    await screen.findByText(/Não consegui mostrar o que vai ser excluído/, {}, { timeout: 5000 });
    const gravar = screen.queryByRole('button', { name: 'Excluir' });
    // ADR 051: a pessoa confirma o registro NOMEADO pelo servidor. Sem nome, não há o que confirmar.
    expect(gravar === null || (gravar as HTMLButtonElement).disabled).toBe(true);
  });

  it('cartão de exclusão não chama apagar de "Gravar"', async () => {
    previewChatAction.mockResolvedValue({
      valida: true,
      linhas: [{ rotulo: 'Refeição', valor: 'Almoço de 25/09, 12:30' }],
    });
    const pausa: ChatInterruptValue = {
      kind: 'confirm',
      prompt: 'Excluir refeição',
      actions: [
        {
          kind: 'confirm',
          toolCallId: 'd2',
          tool: 'delete_meal',
          title: 'Excluir refeição',
          prompt: 'Excluir refeição',
          arguments: { id: '11111111-2222-4333-8444-555555555555' },
        },
      ],
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AskUser pausa={pausa} ocupado={false} onResponder={vi.fn()} />
      </QueryClientProvider>,
    );
    await screen.findByText('Almoço de 25/09, 12:30');
    expect(screen.queryByText('Confere antes de gravar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gravar' })).toBeNull();
    expect(screen.getByText('Confere antes de excluir')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Excluir' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

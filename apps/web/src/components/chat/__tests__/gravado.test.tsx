import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ChatArtifact } from '@fatia/api-client';

const undoAutoWrite = vi.fn(async (_id: string) => ({ undone: true as const }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, undoAutoWrite };
});

const { Artefato } = await import('../artefato');

const gravado = (extra: { undoable?: boolean; autoWriteId?: string }): ChatArtifact => ({
  kind: 'saved',
  toolCallId: 'c1',
  label: 'Gravado',
  at: '2026-11-17T12:00:00Z',
  lines: [{ label: 'Quantidade', after: '300 ml' }],
  ...extra,
});

function desenhar(artefato: ChatArtifact) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Artefato artefato={artefato} ferramenta="Registrar água" />
    </QueryClientProvider>,
  );
}

/** O "Gravado" da gravação automática (#385, ADR 039): o Desfazer chama a API pelo id. */
describe('Gravado com Desfazer', () => {
  it('desfaz pela API com o id da gravação', async () => {
    desenhar(gravado({ undoable: true, autoWriteId: 'w1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));

    await waitFor(() => expect(screen.getByText(/Desfeito/)).toBeInTheDocument());
    expect(undoAutoWrite).toHaveBeenCalledWith('w1');
  });

  it('sem id não há botão: nada a desfazer', () => {
    desenhar(gravado({ undoable: true }));
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
  });
});

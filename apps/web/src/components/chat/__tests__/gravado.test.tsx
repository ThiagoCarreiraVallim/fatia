import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AutoWriteState, ChatArtifact } from '@fatia/api-client';

const undoAutoWrite = vi.fn(async (_id: string) => ({ undone: true as const }));
const getAutoWriteStatus = vi.fn(async (_id: string) => ({ state: 'active' as AutoWriteState }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, undoAutoWrite, getAutoWriteStatus };
});

const { Artefato } = await import('../artefato');
const { ApiError } = await import('@fatia/api-client');

const gravado = (extra: {
  undoable?: boolean;
  autoWriteId?: string;
  lines?: { label: string; before?: string; after: string }[];
}): ChatArtifact => ({
  kind: 'saved',
  toolCallId: 'c1',
  label: 'Gravado',
  at: '2026-11-17T12:00:00Z',
  lines: [{ label: 'Quantidade', after: '300 ml' }],
  ...extra,
});

afterEach(() => {
  undoAutoWrite.mockReset().mockImplementation(async () => ({ undone: true as const }));
  getAutoWriteStatus.mockReset().mockImplementation(async () => ({ state: 'active' }));
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

  const recusa = (code: string) => new ApiError('x', 409, { code, message: 'x' });

  it.each([
    ['AUTO_WRITE_CHANGED', /mudou depois/],
    ['AUTO_WRITE_EXPIRED', /prazo do Desfazer/],
    ['AUTO_WRITE_UNDONE', /Desfeito/],
  ])('a recusa %s explica o motivo e tira o botão', async (code, texto) => {
    undoAutoWrite.mockRejectedValueOnce(recusa(code));
    desenhar(gravado({ undoable: true, autoWriteId: 'w1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));

    await waitFor(() => expect(screen.getByText(texto)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
  });

  it('falha de rede avisa e deixa tentar de novo', async () => {
    undoAutoWrite.mockRejectedValueOnce(new TypeError('rede'));
    desenhar(gravado({ undoable: true, autoWriteId: 'w1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));

    await waitFor(() => expect(screen.getByText(/Tente de novo/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(screen.getByText(/Desfeito/)).toBeInTheDocument());
    expect(undoAutoWrite).toHaveBeenCalledTimes(2);
  });

  it('recarregado, mostra "Desfeito" pelo estado do servidor, sem botão', async () => {
    getAutoWriteStatus.mockResolvedValueOnce({ state: 'undone' });
    desenhar(gravado({ undoable: true, autoWriteId: 'w1' }));

    await waitFor(() => expect(screen.getByText(/Desfeito/)).toBeInTheDocument());
    expect(getAutoWriteStatus).toHaveBeenCalledWith('w1');
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
  });

  it('recarregado depois do prazo, diz que venceu', async () => {
    getAutoWriteStatus.mockResolvedValueOnce({ state: 'expired' });
    desenhar(gravado({ undoable: true, autoWriteId: 'w1' }));

    await waitFor(() => expect(screen.getByText(/prazo do Desfazer/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
  });

  it('numa alteração, mostra antes → depois', () => {
    desenhar(
      gravado({
        undoable: true,
        autoWriteId: 'w1',
        lines: [{ label: 'Peso', before: '80 kg', after: '79,5 kg' }],
      }),
    );
    const linha = screen.getByText('Peso').parentElement as HTMLElement;
    expect(linha.textContent).toContain('80 kg → 79,5 kg');
  });
});

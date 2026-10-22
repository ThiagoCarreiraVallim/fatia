import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/** O aviso de resposta chegando fora do chat, e o "Resposta pronta" no fim (ADR 035). */

let rodando = true;
vi.mock('@assistant-ui/react', () => ({
  useAuiState: (seletor: (s: { thread: { isRunning: boolean } }) => boolean) =>
    seletor({ thread: { isRunning: rodando } }),
}));
const toastMock = vi.fn();
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const { RespostaEmSegundoPlano } = await import('../resposta-em-segundo-plano');
const CONVERSA = '3f1c9a52-6b1e-4d8a-9c2f-0a5e7b3d1c44';

describe('RespostaEmSegundoPlano', () => {
  it('enquanto responde, mostra o aviso com o atalho para a conversa', () => {
    rodando = true;
    render(<RespostaEmSegundoPlano conversa={CONVERSA} />);

    const aviso = screen.getByRole('status');
    expect(aviso).toHaveTextContent('Respondendo…');
    expect(aviso).toHaveAttribute('href', `/chat/${CONVERSA}`);
  });

  it('quando termina, troca o aviso por "Resposta pronta"', () => {
    rodando = true;
    const { rerender } = render(<RespostaEmSegundoPlano conversa={CONVERSA} />);
    rodando = false;
    rerender(<RespostaEmSegundoPlano conversa={CONVERSA} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith('Resposta pronta', expect.anything());
  });

  it('sem resposta em curso, não mostra nada nem avisa', () => {
    rodando = false;
    toastMock.mockClear();
    render(<RespostaEmSegundoPlano conversa={CONVERSA} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });
});

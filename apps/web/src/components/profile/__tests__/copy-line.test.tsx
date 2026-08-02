import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyLine } from '../copy-line';

/**
 * O botão de copiar do fluxo de conexão (issue #164).
 *
 * Copiar é o caminho principal da tela: digitar um endereço à mão no celular é a origem mais
 * provável de "não conectou". O que este spec protege é o caminho de falha — `navigator.clipboard`
 * **não existe** fora de contexto seguro (http em rede local, comum num app self-hosted) e
 * `writeText` rejeita quando o navegador nega permissão. Sem tratamento, o clique não faz nada e
 * não diz nada: o usuário acha que copiou, cola vazio no Claude, e o erro aparece do outro lado.
 */

const VALUE = 'https://api.exemplo.test/mcp';

/**
 * Substitui a área de transferência **depois** de `userEvent.setup()`: o próprio user-event
 * instala um stub de `navigator.clipboard` ao iniciar, e stubar antes dele é stubar para nada —
 * o teste passaria verde exercitando o clipboard do user-event, não o nosso caminho de falha.
 */
function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

describe('CopyLine', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copia o valor e confirma', async () => {
    const writeText = vi.fn(async () => {});
    const user = userEvent.setup();
    stubClipboard(writeText);

    render(<CopyLine value={VALUE} copyLabel="Copiar endereço do Fatia" />);
    await user.click(screen.getByRole('button', { name: 'Copiar endereço do Fatia' }));

    expect(writeText).toHaveBeenCalledWith(VALUE);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('avisa quando o navegador recusa, em vez de falhar calado', async () => {
    const user = userEvent.setup();
    stubClipboard(async () => {
      throw new Error('NotAllowedError');
    });

    render(<CopyLine value={VALUE} copyLabel="Copiar endereço do Fatia" />);
    await user.click(screen.getByRole('button', { name: 'Copiar endereço do Fatia' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Selecione o texto acima/);
    });
  });

  it('mostra o endereço inteiro quando copiar falha', async () => {
    const user = userEvent.setup();
    stubClipboard(async () => {
      throw new Error('NotAllowedError');
    });

    // Com o botão fora de ação, ler o valor na tela é o único caminho que sobra. `truncate` corta
    // o endereço com reticências: quem tentasse digitar copiaria um endereço pela metade.
    const { container } = render(<CopyLine value={VALUE} copyLabel="Copiar endereço do Fatia" />);
    const code = container.querySelector('code');
    expect(code).toHaveClass('truncate');

    await user.click(screen.getByRole('button', { name: 'Copiar endereço do Fatia' }));

    await waitFor(() => expect(container.querySelector('code')).not.toHaveClass('truncate'));
    expect(container.querySelector('code')).toHaveTextContent(VALUE);
  });
});

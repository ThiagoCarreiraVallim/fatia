import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const deleteMe = vi.fn();
const mine = vi.fn();
vi.mock('@fatia/api-client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@fatia/api-client')>();
  return {
    ...real,
    usersApi: { ...real.usersApi, deleteMe: (c: string) => deleteMe(c) },
    groupsApi: { ...real.groupsApi, mine: () => mine() },
  };
});

import { DELETE_ACCOUNT_CONFIRMATION } from '@fatia/api-client';
import { AccountSection } from '../account-section';

/**
 * Apagar a conta é irreversível: o botão final só libera com a frase exata, e é
 * ela — aparada — que vai para a API (que confere de novo). Trocar senha não tem
 * tela própria: é o "esqueci minha senha" do Logto.
 */
function renderSection() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AccountSection />
    </QueryClientProvider>,
  );
}

describe('AccountSection', () => {
  beforeEach(() => {
    deleteMe.mockReset();
    mine.mockReset().mockResolvedValue([]);
  });

  it('a conta dona de comunidade avisa que ela some junto', async () => {
    const user = userEvent.setup();
    mine.mockResolvedValue([
      { id: 'g1', name: 'Academia Demo', role: 'OWNER', status: 'ACTIVE' },
      { id: 'g2', name: 'Corrida', role: 'MEMBER', status: 'ACTIVE' },
    ]);
    renderSection();
    expect(mine).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /apagar minha conta/i }));
    expect(
      await screen.findByText(/Academia Demo.*é apagada junto, com a cobrança dos assentos/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Corrida/)).not.toBeInTheDocument();
  });

  it('trocar senha leva ao fluxo de redefinição do Logto', () => {
    renderSection();
    expect(screen.getByRole('link', { name: /trocar senha/i })).toHaveAttribute(
      'href',
      '/api/logto/sign-in?tela=senha',
    );
  });

  it('só apaga com a frase de confirmação exata', async () => {
    const user = userEvent.setup();
    deleteMe.mockResolvedValue({ deleted: true, message: 'ok' });
    renderSection();

    await user.click(screen.getByRole('button', { name: /apagar minha conta/i }));
    const confirmar = screen.getAllByRole('button', { name: /apagar minha conta/i }).at(-1)!;
    expect(confirmar).toBeDisabled();

    await user.type(screen.getByLabelText(/para confirmar/i), 'deletar minha conta');
    expect(confirmar).toBeDisabled();

    await user.clear(screen.getByLabelText(/para confirmar/i));
    await user.type(screen.getByLabelText(/para confirmar/i), ` ${DELETE_ACCOUNT_CONFIRMATION} `);
    expect(confirmar).toBeEnabled();

    await user.click(confirmar);
    expect(deleteMe).toHaveBeenCalledWith(DELETE_ACCOUNT_CONFIRMATION);
  });
});

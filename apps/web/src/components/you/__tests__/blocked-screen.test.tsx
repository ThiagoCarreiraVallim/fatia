import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, blocksApi: { list: vi.fn(), unblock: vi.fn() } };
});

import { blocksApi } from '@fatia/api-client';
import { BlockedScreen } from '../blocked-screen';

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BlockedScreen />
    </QueryClientProvider>,
  );
}

describe('Você > Conta > Pessoas bloqueadas (#394)', () => {
  afterEach(() => vi.clearAllMocks());

  it('lista quem foi bloqueado e desbloqueia depois de confirmar', async () => {
    const user = userEvent.setup();
    vi.mocked(blocksApi.list).mockResolvedValue([
      { id: 'b1', label: 'Gabi', groupName: 'Academia Demo', createdAt: new Date().toISOString() },
    ]);
    vi.mocked(blocksApi.unblock).mockResolvedValue({ unblocked: true });
    renderScreen();
    const lista = await screen.findByRole('list', { name: 'Pessoas bloqueadas' });
    expect(within(lista).getByText('Gabi')).toBeInTheDocument();
    expect(within(lista).getByText(/Academia Demo/)).toBeInTheDocument();
    await user.click(within(lista).getByRole('button', { name: 'Desbloquear' }));
    const confirma = screen.getByRole('dialog', { name: 'Desbloquear Gabi?' });
    await user.click(within(confirma).getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(blocksApi.unblock).toHaveBeenCalledWith('b1'));
  });

  it('ninguém bloqueado: diz como bloquear', async () => {
    vi.mocked(blocksApi.list).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Ninguém bloqueado')).toBeInTheDocument();
  });
});

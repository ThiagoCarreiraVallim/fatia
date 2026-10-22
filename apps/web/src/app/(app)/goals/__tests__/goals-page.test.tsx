import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GoalsPage from '../page';

/**
 * Metas: remover pede confirmação (como no app), a falha ao carregar não se
 * passa por "nenhuma meta" e o progresso é anunciado.
 */

const goalsApi = vi.hoisted(() => ({ list: vi.fn(), complete: vi.fn(), delete: vi.fn() }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, goalsApi };
});
vi.mock('@/components/goals/new-goal-drawer', () => ({ NewGoalDrawer: () => null }));

function goal(id: string, title: string, progressPercent: number) {
  return {
    id,
    title,
    description: null,
    kind: 'custom',
    status: 'active',
    unit: 'x',
    currentValue: 1,
    targetValue: 4,
    progressPercent,
    deadline: null,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GoalsPage />
    </QueryClientProvider>,
  );
}

describe('Metas', () => {
  afterEach(() => vi.clearAllMocks());

  it('remover pergunta antes e só apaga ao confirmar', async () => {
    goalsApi.list.mockResolvedValue([goal('g1', 'Correr 5 km', 40), goal('g2', 'Ler', 25)]);
    goalsApi.delete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Remover meta Ler' }));
    expect(goalsApi.delete).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Apagar "Ler"? Essa ação não pode ser desfeita.');

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(goalsApi.delete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remover meta Ler' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(goalsApi.delete).toHaveBeenCalledWith('g2'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('anuncia o progresso de cada meta', async () => {
    goalsApi.list.mockResolvedValue([goal('g1', 'Correr 5 km', 40), goal('g2', 'Ler', 25)]);
    renderPage();
    expect(
      await screen.findByRole('progressbar', { name: 'Correr 5 km: 40% concluído' }),
    ).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByRole('progressbar', { name: 'Ler: 25% concluído' })).toBeInTheDocument();
  });

  it('a falha ao carregar não vira "Nenhuma meta ativa" e oferece tentar de novo', async () => {
    goalsApi.list.mockRejectedValueOnce(new Error('fora do ar')).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar suas metas.');
    expect(screen.queryByText('Nenhuma meta ativa')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Nenhuma meta ativa')).toBeInTheDocument();
  });
});

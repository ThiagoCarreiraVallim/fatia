import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NutrientTarget } from '@fatia/api-client';
import NutrientTargetsPage from '../page';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    nutritionApi: {
      nutrientTargets: vi.fn(),
      upsertNutrientTarget: vi.fn(),
      deleteNutrientTarget: vi.fn(),
    },
  };
});

import { nutritionApi } from '@fatia/api-client';

const nutrientTargets = vi.mocked(nutritionApi.nutrientTargets);
const deleteNutrientTarget = vi.mocked(nutritionApi.deleteNutrientTarget);

const sodio = {
  id: 't1',
  nutrientKey: 'sodium_mg',
  label: 'Sódio',
  unit: 'mg',
  min: null,
  max: 2000,
} as NutrientTarget;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NutrientTargetsPage />
    </QueryClientProvider>,
  );
}

describe('NutrientTargetsPage', () => {
  beforeEach(() => {
    nutrientTargets.mockReset().mockResolvedValue([sodio]);
    deleteNutrientTarget.mockReset().mockResolvedValue(undefined as never);
  });

  it('remover pede confirmação e só apaga ao confirmar', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Remover Sódio' }));
    expect(deleteNutrientTarget).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('A meta de Sódio será apagada.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(deleteNutrientTarget).toHaveBeenCalledWith('sodium_mg'));
  });

  it('falha ao carregar mostra o motivo e tenta de novo', async () => {
    nutrientTargets.mockReset().mockRejectedValueOnce(new Error('Sem conexão.'));
    nutrientTargets.mockResolvedValue([sodio]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.');
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Sódio', { selector: 'p' })).toBeInTheDocument();
  });

  it('o nutriente escolhido aparece marcado', async () => {
    nutrientTargets.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Fibra' }));

    expect(screen.getByRole('button', { name: 'Fibra' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sódio' })).toHaveAttribute('aria-pressed', 'false');
  });
});

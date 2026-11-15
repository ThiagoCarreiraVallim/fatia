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
      nutrientSummary: vi.fn(),
    },
  };
});

import { nutritionApi } from '@fatia/api-client';

const nutrientTargets = vi.mocked(nutritionApi.nutrientTargets);
const deleteNutrientTarget = vi.mocked(nutritionApi.deleteNutrientTarget);
const upsertNutrientTarget = vi.mocked(nutritionApi.upsertNutrientTarget);
const nutrientSummary = vi.mocked(nutritionApi.nutrientSummary);

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
    upsertNutrientTarget.mockReset().mockResolvedValue({} as never);
    nutrientSummary.mockReset().mockResolvedValue({
      date: '2026-11-15',
      nutrients: [
        {
          nutrientKey: 'sodium_mg',
          label: 'Sódio',
          unit: 'mg',
          min: null,
          max: 2000,
          total: 1240,
          status: 'ok',
        },
      ],
    });
  });

  it('cada meta mostra o tipo, o valor de hoje e o status', async () => {
    renderPage();
    const row = await screen.findByRole('group', { name: 'Sódio' });
    expect(within(row).getByText('máx')).toBeInTheDocument();
    expect(await within(row).findByText('1.240 mg')).toBeInTheDocument();
    expect(within(row).getByText('de 2.000 mg')).toBeInTheDocument();
    expect(within(row).getByText('dentro do limite')).toBeInTheDocument();
    expect(within(row).queryByText('seu')).not.toBeInTheDocument();
  });

  it('nutriente que a pessoa criou leva o selo "seu"', async () => {
    nutrientTargets.mockResolvedValue([
      {
        ...sodio,
        id: 't2',
        nutrientKey: 'omega_3_g',
        label: 'Ômega 3',
        unit: 'g',
        max: null,
        min: 1,
      },
    ]);
    renderPage();
    const row = await screen.findByRole('group', { name: 'Ômega 3' });
    expect(within(row).getByText('seu')).toBeInTheDocument();
  });

  it('Outro: nome e unidade, sem digitar chave; vírgula decimal', async () => {
    nutrientTargets.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Outro' }));
    expect(screen.queryByLabelText('Chave')).not.toBeInTheDocument();
    expect(screen.getByText(/Os alimentos da base não trazem esse valor/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nome do nutriente'), 'Ômega 3');
    await user.click(screen.getByRole('radio', { name: 'g' }));
    await user.type(screen.getByLabelText(/Mínimo/), '1,5');
    await user.click(screen.getByRole('button', { name: /Adicionar Ômega 3/ }));

    await waitFor(() =>
      expect(upsertNutrientTarget).toHaveBeenCalledWith({
        nutrientKey: 'omega_3_g',
        label: 'Ômega 3',
        unit: 'g',
        min: 1.5,
        max: undefined,
      }),
    );
  });

  it('mínimo acima do máximo avisa e não salva', async () => {
    nutrientTargets.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Fibra' }));
    const min = screen.getByLabelText(/Mínimo/);
    await user.clear(min);
    await user.type(min, '30');
    await user.type(screen.getByLabelText(/Máximo/), '25');

    expect(screen.getByRole('alert')).toHaveTextContent('O mínimo (30) passa do máximo (25).');
    expect(screen.getByRole('button', { name: /Adicionar Fibra/ })).toBeDisabled();
    expect(upsertNutrientTarget).not.toHaveBeenCalled();
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

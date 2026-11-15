import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomFoodForm } from '../custom-food-form';
import { emptyCustomFoodForm } from '@fatia/api-client';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, nutritionApi: { nutrientTargets: vi.fn() } };
});

import { nutritionApi } from '@fatia/api-client';

const nutrientTargets = vi.mocked(nutritionApi.nutrientTargets);

function renderForm(props: Partial<Parameters<typeof CustomFoodForm>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <CustomFoodForm
        initial={emptyCustomFoodForm('Granola')}
        submitLabel="Salvar e registrar"
        pending={false}
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSubmit, onCancel };
}

describe('CustomFoodForm (Al-N11)', () => {
  beforeEach(() => {
    nutrientTargets.mockReset();
    nutrientTargets.mockResolvedValue([
      {
        id: 't1',
        nutrientKey: 'magnesium_mg',
        label: 'Magnésio',
        unit: 'mg',
        target: 400,
        direction: 'MIN',
      },
    ] as never);
  });

  async function fillServing(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/tamanho da porção/i), '40');
    await user.type(screen.getByLabelText(/calorias/i), '180');
    await user.type(screen.getByLabelText(/proteína/i), '4');
    await user.type(screen.getByLabelText(/carboidrato/i), '28');
    await user.type(screen.getByLabelText(/gordura/i), '6');
  }

  it('micronutrientes: a meta da pessoa vem primeiro e a porção vira 100 g', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await fillServing(user);
    await user.click(screen.getByRole('button', { name: /micronutrientes/i }));
    expect(await screen.findByText('sua meta')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/magnésio/i), '20');
    await user.type(screen.getByLabelText(/^fibra/i), '3,2');
    await user.click(screen.getByRole('button', { name: 'Salvar e registrar' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ nutrients: { magnesium_mg: 50, fiber_g: 8 } }),
    );
  });

  it('nutriente inválido aponta o erro e não envia', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await fillServing(user);
    await user.click(screen.getByRole('button', { name: /micronutrientes/i }));
    await user.type(screen.getByLabelText(/^fibra/i), 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar e registrar' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^fibra/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('vincular código de barras é escolha explícita e valida os números', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await fillServing(user);
    expect(screen.queryByLabelText(/código de barras \(/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /vincular a um código de barras/i }));
    await user.type(screen.getByLabelText(/código de barras \(/i), '123');
    await user.click(screen.getByRole('button', { name: 'Salvar e registrar' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('O código tem de 8 a 14 números.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/código de barras \(/i));
    await user.type(screen.getByLabelText(/código de barras \(/i), '7891000100103');
    await user.click(screen.getByRole('button', { name: 'Salvar e registrar' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ barcode: '7891000100103' }));
  });

  it('"Só salvar" envia pelo outro caminho', async () => {
    const user = userEvent.setup();
    const saveOnly = vi.fn();
    const { onSubmit } = renderForm({ saveOnly: { label: 'Só salvar', onSubmit: saveOnly } });
    await fillServing(user);
    await user.click(screen.getByRole('button', { name: 'Só salvar' }));
    expect(saveOnly).toHaveBeenCalledWith(expect.objectContaining({ name: 'Granola' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('mostra a conta por 100 g ao vivo', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillServing(user);
    expect(screen.getByText(/100 g/, { selector: 'p.rounded-lg' })).toBeInTheDocument();
  });
});

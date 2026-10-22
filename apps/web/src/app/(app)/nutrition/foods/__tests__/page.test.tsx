import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Food } from '@fatia/api-client';
import CustomFoodsPage from '../page';

vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <section aria-label="drawer">{children}</section> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DrawerClose: Passthrough,
  };
});

const params = { atual: new URLSearchParams() };
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => params.atual,
  useRouter: () => ({ replace }),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    nutritionApi: {
      customFoods: vi.fn(),
      createCustomFood: vi.fn(),
      updateCustomFood: vi.fn(),
      deleteCustomFood: vi.fn(),
    },
  };
});

import { nutritionApi } from '@fatia/api-client';

const customFoods = vi.mocked(nutritionApi.customFoods);
const createCustomFood = vi.mocked(nutritionApi.createCustomFood);
const updateCustomFood = vi.mocked(nutritionApi.updateCustomFood);
const deleteCustomFood = vi.mocked(nutritionApi.deleteCustomFood);

const granola: Food = {
  id: 7,
  name: 'Granola',
  source: 'CUSTOM',
  groupId: null,
  kcalPer100g: 450,
  proteinPer100g: 10,
  carbsPer100g: 60,
  fatPer100g: 18,
  createdByUserId: 'eu',
  portions: [],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomFoodsPage />
    </QueryClientProvider>,
  );
}

describe('Meus alimentos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    params.atual = new URLSearchParams();
    customFoods.mockResolvedValue([granola]);
  });

  it('lista os alimentos com os valores por 100 g', async () => {
    renderPage();
    const lista = await screen.findByRole('list', { name: 'Meus alimentos' });
    expect(within(lista).getByText('Granola')).toBeInTheDocument();
    expect(within(lista).getByText('450 kcal · P 10 · C 60 · G 18 por 100 g')).toBeInTheDocument();
  });

  it('carregando diz que está carregando', () => {
    customFoods.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('lista vazia explica e oferece cadastrar', async () => {
    customFoods.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Nenhum alimento cadastrado ainda.')).toBeInTheDocument();
  });

  it('edita por 100 g, sem a escolha de porção', async () => {
    updateCustomFood.mockResolvedValue({ ...granola, name: 'Granola caseira' });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Editar Granola' }));
    expect(screen.getByRole('heading', { name: 'Editar alimento' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Por porção' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Calorias (kcal)')).toHaveValue('450');

    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), 'Granola caseira');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(updateCustomFood).toHaveBeenCalledWith(7, {
        name: 'Granola caseira',
        kcalPer100g: 450,
        proteinPer100g: 10,
        carbsPer100g: 60,
        fatPer100g: 18,
      }),
    );
    await waitFor(() => expect(screen.queryByLabelText('drawer')).not.toBeInTheDocument());
  });

  it('apagar pede confirmação e avisa que o histórico fica', async () => {
    deleteCustomFood.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Editar Granola' }));
    await user.click(screen.getByRole('button', { name: 'Apagar alimento' }));
    expect(deleteCustomFood).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(
      'As refeições já registradas continuam com o nome e os valores.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(deleteCustomFood).toHaveBeenCalledWith(7));
  });

  it('?novo=1 abre o cadastro, e fechar limpa o endereço', async () => {
    params.atual = new URLSearchParams('novo=1');
    createCustomFood.mockResolvedValue(granola);
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('heading', { name: 'Novo alimento' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nome'), 'Granola');
    await user.type(screen.getByLabelText('Tamanho da porção (g)'), '40');
    await user.type(screen.getByLabelText('Calorias (kcal)'), '180');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(createCustomFood).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Granola',
          kcalPer100g: 450,
          portions: [{ label: 'porção', grams: 40 }],
        }),
      ),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/nutrition/foods'));
  });
});

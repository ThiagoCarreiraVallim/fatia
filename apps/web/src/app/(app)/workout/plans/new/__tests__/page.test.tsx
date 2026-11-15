import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Exercise, WorkoutPlan } from '@fatia/api-client';
import NewPlanPage from '../page';

/** Novo plano (Al-T19, #378). */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DrawerClose: Passthrough,
  };
});

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      createPlan: vi.fn(),
      addPlanExercises: vi.fn(),
      searchExercises: vi.fn(),
    },
    groupsApi: { mine: vi.fn().mockResolvedValue([]) },
  };
});

import { workoutApi } from '@fatia/api-client';

const createPlan = vi.mocked(workoutApi.createPlan);
const addMany = vi.mocked(workoutApi.addPlanExercises);
const search = vi.mocked(workoutApi.searchExercises);

const ex = (id: number, name: string, muscleGroup = 'costas'): Exercise =>
  ({ id, name, muscleGroup, source: 'SEED', equipment: 'máquina' }) as Exercise;

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NewPlanPage />
    </QueryClientProvider>,
  );
}

describe('Novo plano', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.mockResolvedValue([ex(1, 'Puxada frente'), ex(2, 'Rosca martelo', 'braço')]);
  });

  it('cria com nome e exercícios numa ida e abre o plano', async () => {
    createPlan.mockResolvedValue({
      id: 'novo',
      name: 'Costas',
      exercises: [],
    } as unknown as WorkoutPlan);
    addMany.mockResolvedValue({ id: 'novo' } as WorkoutPlan);
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText('Nenhum exercício ainda')).toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'Criar plano' });
    expect(create).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: 'Nome do plano' }), 'Costas');
    await user.click(screen.getByRole('button', { name: 'Adicionar exercício' }));
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Puxada frente' }));
    await user.click(screen.getByRole('checkbox', { name: 'Rosca martelo' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar 2 exercícios' }));

    expect(screen.getByText('2 · 6 séries · ~13 min')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover Rosca martelo' }));
    expect(screen.queryByText('Rosca martelo')).toBeNull();

    await user.click(create);
    await waitFor(() => expect(createPlan).toHaveBeenCalledWith({ name: 'Costas' }));
    await waitFor(() => expect(addMany).toHaveBeenCalledWith('novo', [1]));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout/plans/novo'));
    expect(createPlan).toHaveBeenCalledTimes(1);
  });

  it('começar de um modelo leva aos planos prontos das comunidades', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Começar de um modelo/ })).toHaveAttribute(
      'href',
      '/community',
    );
  });
});

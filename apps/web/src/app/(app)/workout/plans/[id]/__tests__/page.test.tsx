import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { WorkoutPlan, WorkoutPlanExercise } from '@fatia/api-client';
import PlanDetailPage from '../page';

/**
 * A regressão que a #183 existe para evitar mora aqui, na tela — não no
 * api-client. Reordenar por dois PATCH voltaria a passar num teste de unidade
 * do cliente HTTP; o que pega é contar requisições a partir do clique.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'plan-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mesmo motivo do teste do FoodSearchDrawer: o `vaul` não monta no jsdom.
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
      getPlan: vi.fn(),
      updatePlan: vi.fn(),
      deletePlan: vi.fn(),
      updatePlanExercise: vi.fn(),
      removePlanExercise: vi.fn(),
      reorderPlanExercises: vi.fn(),
      startSession: vi.fn(),
      getPersonalRecord: vi.fn(),
      getExercise: vi.fn(),
      searchExercises: vi.fn(),
      addPlanExercise: vi.fn(),
    },
  };
});

import { workoutApi } from '@fatia/api-client';

const getPlan = vi.mocked(workoutApi.getPlan);
const reorderPlanExercises = vi.mocked(workoutApi.reorderPlanExercises);
const getPersonalRecord = vi.mocked(workoutApi.getPersonalRecord);

/** Promessa controlada pelo teste — segura a mutation "em voo". */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function planExercise(id: string, name: string, order: number): WorkoutPlanExercise {
  return {
    id,
    planId: 'plan-1',
    exerciseId: order,
    order,
    targetSets: 3,
    targetReps: '8-12',
    exercise: {
      id: order,
      name,
      muscleGroup: 'peito',
      source: 'SEED',
      createdByUserId: null,
      primaryMuscles: [],
      secondaryMuscles: [],
      equipment: null,
      level: null,
      mechanic: null,
      instructions: [],
      youtubeVideoId: null,
      youtubeVideoIdPt: null,
    },
  };
}

/**
 * `order` com buracos (1, 5, 9) de propósito: `addPlanExercise` usa `max + 1` e
 * remover não renumera, então plano real tem buraco. Se alguém trocar o `order`
 * do vizinho por `index`, estes testes quebram.
 */
function plan(
  exercises = [
    planExercise('pe-a', 'Supino', 1),
    planExercise('pe-b', 'Crucifixo', 5),
    planExercise('pe-c', 'Crossover', 9),
  ],
): WorkoutPlan {
  return { id: 'plan-1', userId: 'user-1', name: 'Peito', exercises };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PlanDetailPage />
    </QueryClientProvider>,
  );
}

async function renderLoadedPage() {
  getPersonalRecord.mockResolvedValue(null);
  getPlan.mockResolvedValue(plan());
  const user = userEvent.setup();
  renderPage();
  await screen.findByRole('button', { name: /mover crucifixo para baixo/i });
  return user;
}

describe('PlanDetailPage — reordenação', () => {
  it('reordena com uma requisição só, mandando o `order` do vizinho', async () => {
    const user = await renderLoadedPage();
    reorderPlanExercises.mockResolvedValue(plan());

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));

    await waitFor(() => expect(reorderPlanExercises).toHaveBeenCalledTimes(1));
    expect(reorderPlanExercises).toHaveBeenCalledWith('plan-1', [
      { id: 'pe-b', order: 9 },
      { id: 'pe-c', order: 5 },
    ]);
  });

  it('recusa o segundo clique enquanto a primeira troca não respondeu', async () => {
    const user = await renderLoadedPage();
    const pending = deferred<WorkoutPlan>();
    reorderPlanExercises.mockReturnValue(pending.promise);

    const down = screen.getByRole('button', { name: /mover crucifixo para baixo/i });
    await user.click(down);
    await waitFor(() => expect(down).toBeDisabled());

    // Segundo clique sobre o mesmo snapshot. Sem a trava ele gravaria uma troca
    // sobreposta e deixaria dois exercícios com o mesmo `order`.
    await user.click(down);
    await user.click(screen.getByRole('button', { name: /mover supino para baixo/i }));

    expect(reorderPlanExercises).toHaveBeenCalledTimes(1);

    pending.resolve(plan());
    await waitFor(() => expect(down).toBeEnabled());
  });

  it('mostra a nova ordem sem refazer a busca do plano', async () => {
    const user = await renderLoadedPage();
    expect(getPlan).toHaveBeenCalledTimes(1);
    reorderPlanExercises.mockResolvedValue(
      plan([
        planExercise('pe-a', 'Supino', 1),
        planExercise('pe-c', 'Crossover', 5),
        planExercise('pe-b', 'Crucifixo', 9),
      ]),
    );

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));

    // Crucifixo caiu para o fim: o botão "para baixo" dele fica desabilitado.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mover crucifixo para baixo/i })).toBeDisabled(),
    );
    expect(getPlan).toHaveBeenCalledTimes(1);
  });

  it('avisa quando a API recusa o movimento, e a lista continua como estava', async () => {
    const user = await renderLoadedPage();
    reorderPlanExercises.mockRejectedValue(new Error('Plan not found'));

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/não foi possível mover o exercício/i);
    expect(alert).toHaveTextContent(/plan not found/i);
    // Crucifixo continua no meio — o botão "para baixo" segue disponível.
    expect(screen.getByRole('button', { name: /mover crucifixo para baixo/i })).toBeEnabled();
  });

  it('mantém as bordas travadas: o primeiro não sobe e o último não desce', async () => {
    await renderLoadedPage();

    expect(screen.getByRole('button', { name: /mover supino para cima/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /mover crossover para baixo/i })).toBeDisabled();
    expect(reorderPlanExercises).not.toHaveBeenCalled();
  });
});

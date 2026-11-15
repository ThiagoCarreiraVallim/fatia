import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import type { Exercise, WorkoutPlan } from '@fatia/api-client';
import { AddExerciseDrawer } from '../add-exercise-drawer';
import { ExerciseDetailDrawer } from '../exercise-detail-drawer';

/** Al-T8 / Al-T8b (seleção múltipla, favoritos) e a estrela do Al-T9 (#378). */

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
      searchExercises: vi.fn(),
      addPlanExercises: vi.fn(),
      setExerciseFavorite: vi.fn(),
      cloneExercise: vi.fn(),
    },
    groupsApi: { mine: vi.fn().mockResolvedValue([]) },
  };
});

import { workoutApi } from '@fatia/api-client';

const search = vi.mocked(workoutApi.searchExercises);
const addMany = vi.mocked(workoutApi.addPlanExercises);
const setFavorite = vi.mocked(workoutApi.setExerciseFavorite);

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const ex = (id: number, name: string, p: Partial<Exercise> = {}): Exercise => ({
  id,
  name,
  muscleGroup: 'peito',
  source: 'SEED',
  createdByUserId: null,
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  equipment: 'barra',
  level: null,
  mechanic: null,
  instructions: [],
  youtubeVideoId: null,
  youtubeVideoIdPt: null,
  ...p,
});

afterEach(() => vi.clearAllMocks());

describe('Adicionar exercício ao plano (Al-T8)', () => {
  it('marca vários, diz quantos vão entrar e manda tudo numa requisição só', async () => {
    search.mockResolvedValue([ex(1, 'Supino reto'), ex(2, 'Crucifixo'), ex(3, 'Crossover')]);
    addMany.mockResolvedValue({ id: 'p' } as WorkoutPlan);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <AddExerciseDrawer
        open
        onOpenChange={onOpenChange}
        planId="p"
        planName="Push"
        existingExerciseIds={new Set()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Adicionar ao Push' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getByRole('button', { name: 'Selecione os exercícios' })).toBeDisabled();

    await user.click(await screen.findByRole('checkbox', { name: 'Supino reto' }));
    await user.click(screen.getByRole('checkbox', { name: 'Crossover' }));
    const done = screen.getByRole('button', { name: 'Adicionar 2 exercícios' });
    await user.click(done);

    await waitFor(() => expect(addMany).toHaveBeenCalledWith('p', [1, 3]));
    expect(addMany).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('a seleção sobrevive à troca de aba', async () => {
    search.mockImplementation(async (_q, group) =>
      group === 'costas' ? [ex(5, 'Remada', { muscleGroup: 'costas' })] : [ex(1, 'Supino reto')],
    );
    const user = userEvent.setup();
    renderWithClient(
      <AddExerciseDrawer open onOpenChange={vi.fn()} planId="p" existingExerciseIds={new Set()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Supino reto' }));
    await user.click(screen.getByRole('button', { name: 'Costas' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Remada' }));
    expect(screen.getByRole('button', { name: 'Adicionar 2 exercícios' })).toBeEnabled();
    expect(search).toHaveBeenLastCalledWith(undefined, 'costas', {});
  });

  it('Favoritos vazio explica como favoritar (Al-T8b)', async () => {
    search.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithClient(
      <AddExerciseDrawer open onOpenChange={vi.fn()} planId="p" existingExerciseIds={new Set()} />,
    );
    expect(await screen.findByText('Nenhum favorito ainda')).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith(undefined, undefined, { favoritesOnly: true });
    await user.click(screen.getByRole('button', { name: 'Ver todos os exercícios' }));
    await waitFor(() => expect(search).toHaveBeenLastCalledWith(undefined, undefined, {}));
  });

  it('busca sem resultado diz o termo', async () => {
    search.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithClient(
      <AddExerciseDrawer open onOpenChange={vi.fn()} planId="p" existingExerciseIds={new Set()} />,
    );
    await user.type(screen.getByRole('textbox', { name: 'Buscar exercício' }), 'zzz');
    expect(await screen.findByText('Nada com “zzz”')).toBeInTheDocument();
  });

  it('exercício que já está no plano aparece marcado e não entra de novo', async () => {
    search.mockResolvedValue([ex(1, 'Supino reto'), ex(2, 'Crucifixo')]);
    const user = userEvent.setup();
    renderWithClient(
      <AddExerciseDrawer
        open
        onOpenChange={vi.fn()}
        planId="p"
        existingExerciseIds={new Set([1])}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    expect(await screen.findByText('já no plano')).toBeInTheDocument();
    const inPlan = screen.getByRole('checkbox', { name: 'Supino reto' });
    expect(inPlan).toBeDisabled();
    await user.click(inPlan);
    expect(screen.getByRole('button', { name: 'Selecione os exercícios' })).toBeDisabled();
  });
});

describe('estrela do Como fazer (Al-T9)', () => {
  it('favorita e desfaz, com o estado no botão', async () => {
    setFavorite.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithClient(
      <ExerciseDetailDrawer open onOpenChange={vi.fn()} exercise={ex(7, 'Supino reto')} />,
    );
    const star = screen.getByRole('button', { name: 'Favoritar Supino reto' });
    expect(star).toHaveAttribute('aria-pressed', 'false');
    await user.click(star);
    await waitFor(() => expect(setFavorite).toHaveBeenCalledWith(7, true));
    expect(star).toHaveAttribute('aria-pressed', 'true');
    await user.click(star);
    await waitFor(() => expect(setFavorite).toHaveBeenLastCalledWith(7, false));
    expect(star).toHaveAttribute('aria-pressed', 'false');
  });

  it('volta atrás quando a API recusa', async () => {
    setFavorite.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderWithClient(
      <ExerciseDetailDrawer
        open
        onOpenChange={vi.fn()}
        exercise={ex(7, 'Supino reto', { favorite: true })}
      />,
    );
    const star = screen.getByRole('button', { name: 'Favoritar Supino reto' });
    expect(star).toHaveAttribute('aria-pressed', 'true');
    await user.click(star);
    await waitFor(() => expect(star).toHaveAttribute('aria-pressed', 'true'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível');
  });
});

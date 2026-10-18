import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import type { Exercise, MyGroup } from '@fatia/api-client';
import { AddExerciseDrawer } from '../add-exercise-drawer';
import { ExerciseDetailDrawer } from '../exercise-detail-drawer';

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
    workoutApi: { searchExercises: vi.fn(), cloneExercise: vi.fn(), addPlanExercise: vi.fn() },
    groupsApi: { mine: vi.fn() },
  };
});

import { groupsApi, workoutApi } from '@fatia/api-client';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const supino = (p: Partial<Exercise> = {}): Exercise => ({
  id: 7,
  name: 'Supino reto',
  muscleGroup: 'peito',
  source: 'SEED',
  createdByUserId: null,
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: 'barra',
  level: null,
  mechanic: null,
  instructions: [],
  youtubeVideoId: 'yt123',
  youtubeVideoIdPt: null,
  ...p,
});

describe('detalhe do exercício com o tutorial da comunidade', () => {
  it('o vídeo da comunidade toma o lugar do YouTube, com as fotos e as dicas', () => {
    renderWithClient(
      <ExerciseDetailDrawer
        open
        onOpenChange={vi.fn()}
        exercise={supino({
          community: {
            groupId: 'g1',
            groupName: 'Academia Demo',
            video: {
              id: 'v',
              kind: 'VIDEO',
              url: 'https://bucket/v.mp4?sig',
              width: null,
              height: null,
            },
            photos: [
              { id: 'f', kind: 'IMAGE', url: 'https://bucket/f.webp?sig', width: 10, height: 10 },
            ],
            tips: 'Escápulas **juntas**.',
          },
        })}
      />,
    );
    const tutorial = screen.getByRole('region', { name: 'Tutorial de Academia Demo' });
    expect(tutorial.querySelector('video')).toHaveAttribute('src', 'https://bucket/v.mp4?sig');
    expect(tutorial.querySelector('strong')).toHaveTextContent('juntas');
    expect(screen.getByRole('img', { name: 'Supino reto, foto 1' })).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('sem tutorial da comunidade, segue o vídeo de sempre', () => {
    renderWithClient(<ExerciseDetailDrawer open onOpenChange={vi.fn()} exercise={supino()} />);
    expect(document.querySelector('iframe')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/yt123',
    );
    expect(screen.queryByRole('region', { name: /Tutorial de/ })).toBeNull();
  });
});

describe('"Na minha academia" no seletor de exercício', () => {
  afterEach(() => vi.clearAllMocks());

  it('quem está numa comunidade filtra, e o exercício dela vem marcado', async () => {
    vi.mocked(groupsApi.mine).mockResolvedValue([{ id: 'g1', status: 'ACTIVE' } as MyGroup]);
    vi.mocked(workoutApi.searchExercises).mockResolvedValue([
      supino({ id: 9, name: 'Leg da casa', communityName: 'Academia Demo' }),
    ]);
    const user = userEvent.setup();
    renderWithClient(
      <AddExerciseDrawer
        open
        onOpenChange={vi.fn()}
        existingExerciseIds={new Set()}
        onAdd={vi.fn()}
      />,
    );

    expect(await screen.findByText('Academia Demo')).toBeInTheDocument();
    await user.click(await screen.findByRole('checkbox', { name: 'Na minha academia' }));
    await waitFor(() =>
      expect(workoutApi.searchExercises).toHaveBeenLastCalledWith(undefined, undefined, {
        onlyMyGym: true,
      }),
    );
  });

  it('quem não está em comunidade nenhuma não vê o filtro', async () => {
    vi.mocked(groupsApi.mine).mockResolvedValue([]);
    vi.mocked(workoutApi.searchExercises).mockResolvedValue([supino()]);
    renderWithClient(
      <AddExerciseDrawer
        open
        onOpenChange={vi.fn()}
        existingExerciseIds={new Set()}
        onAdd={vi.fn()}
      />,
    );
    expect(await screen.findByText('Supino reto')).toBeInTheDocument();
    await waitFor(() => expect(groupsApi.mine).toHaveBeenCalled());
    expect(screen.queryByRole('checkbox', { name: 'Na minha academia' })).toBeNull();
  });
});

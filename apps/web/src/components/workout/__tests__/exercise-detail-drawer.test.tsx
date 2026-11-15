import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Exercise } from '@fatia/api-client';
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
vi.mock('../muscle-diagram', () => ({
  MuscleDiagram: ({ primaryMuscles }: { primaryMuscles: string[] }) => (
    <div role="img" aria-label={`Diagrama: ${primaryMuscles.join(', ')}`} />
  ),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: { ...actual.workoutApi, getExerciseStats: vi.fn(), cloneExercise: vi.fn() },
  };
});

import { workoutApi } from '@fatia/api-client';
const getExerciseStats = vi.mocked(workoutApi.getExerciseStats);

const SUPINO: Exercise = {
  id: 7,
  name: 'Supino reto',
  muscleGroup: 'peito',
  source: 'SEED',
  createdByUserId: null,
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps', 'shoulders'],
  equipment: 'barra',
  level: 'intermediate',
  mechanic: 'compound',
  instructions: ['Deite no banco.', 'Desça a barra até o peito.'],
  youtubeVideoId: 'yt123',
  youtubeVideoIdPt: null,
  community: {
    groupId: 'g',
    groupName: 'Academia Sol',
    video: null,
    photos: [],
    tips: 'Escápulas juntas.',
  },
};

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExerciseDetailDrawer open onOpenChange={() => undefined} exercise={SUPINO} />
    </QueryClientProvider>,
  );
}

describe('Como fazer (#377, prancha Al-T9)', () => {
  it('vídeo no topo, nome, grupo e aparelho · nível · mecânica', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog');
    const frame = within(dialog).getByTitle('Vídeo: Supino reto');
    const heading = within(dialog).getByRole('heading', { name: 'Supino reto' });
    // O vídeo vem antes do nome.
    expect(frame.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialog).getByText('Peito')).toBeInTheDocument();
    expect(within(dialog).getByText('barra · Intermediário · Composto')).toBeInTheDocument();
  });

  it('Passos: as instruções e a dica da comunidade', () => {
    renderDrawer();
    expect(screen.getByRole('radio', { name: 'Passos' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Desça a barra até o peito.')).toBeInTheDocument();
    expect(screen.getByText('Dica da Academia Sol')).toBeInTheDocument();
    expect(screen.getByText('Escápulas juntas.')).toBeInTheDocument();
  });

  it('Músculos: o diagrama e quem trabalha e quem ajuda, em português', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('radio', { name: 'Músculos' }));
    expect(screen.getByRole('img', { name: 'Diagrama: chest' })).toBeInTheDocument();
    expect(screen.getByText('peito')).toBeInTheDocument();
    expect(screen.getByText('tríceps, ombros')).toBeInTheDocument();
  });

  it('Seu histórico: recorde com data, última vez e máximo estimado', async () => {
    getExerciseStats.mockResolvedValue({
      exerciseId: 7,
      isCardio: false,
      record: {
        weightKg: 80,
        reps: 5,
        distanceMeters: null,
        durationSeconds: null,
        date: '2026-10-02',
      },
      last: {
        date: '2026-11-10',
        sets: 4,
        best: { weightKg: 75, reps: 8, distanceMeters: null, durationSeconds: null },
        feeling: 3,
      },
      estimated1RM: 93.3,
    });
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('radio', { name: 'Seu histórico' }));

    // `formatBestSet` (api-client) escreve a carga sempre com uma casa: "80,0".
    expect(await screen.findByText('80 × 5')).toBeInTheDocument();
    expect(screen.getByText('2 de out. de 2026')).toBeInTheDocument();
    expect(screen.getByText('10 de nov. de 2026 · 4 séries · 75 × 8')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Puxado' })).toBeInTheDocument();
    expect(screen.getByText('93,3 kg')).toBeInTheDocument();
    expect(getExerciseStats).toHaveBeenCalledWith(7);
  });
});

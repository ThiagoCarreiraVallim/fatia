import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Exercise } from '@fatia/api-client';
import { ExerciseHeading } from '../exercise-title';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, workoutApi: { ...actual.workoutApi, getExercise: vi.fn() } };
});
// O "Como fazer" tem testes próprios; aqui só importa o topo da sessão.
vi.mock('../exercise-detail-drawer', () => ({ ExerciseDetailDrawer: () => null }));
vi.mock('../muscle-diagram', () => ({
  MuscleDiagram: ({ primaryMuscles }: { primaryMuscles: string[] }) => (
    <div role="img" aria-label={`Músculos: ${primaryMuscles.join(', ')}`} />
  ),
}));

import { workoutApi } from '@fatia/api-client';
const getExercise = vi.mocked(workoutApi.getExercise);

const base: Exercise = {
  id: 9,
  name: 'Leg press',
  muscleGroup: 'pernas',
  source: 'SEED',
  createdByUserId: null,
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: ['glutes'],
  equipment: 'máquina',
  level: null,
  mechanic: null,
  instructions: [],
  youtubeVideoId: null,
  youtubeVideoIdPt: null,
};

function renderMedia() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExerciseHeading exerciseId={9} exerciseName="Leg press" />
    </QueryClientProvider>,
  );
}

/**
 * O topo do exercício na sessão (pranchas Al-T3 e Al-T3d): o vídeo quando há,
 * e sem vídeo o boneco dos músculos ao lado do nome. Era o `ExerciseMedia`.
 */
describe('ExerciseHeading — vídeo e músculos na sessão (#377)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('YouTube em português primeiro, embutido', async () => {
    getExercise.mockResolvedValue({ ...base, youtubeVideoId: 'en1', youtubeVideoIdPt: 'pt1' });
    renderMedia();
    const frame = await screen.findByTitle('Vídeo: Leg press');
    expect(frame.getAttribute('src')).toContain('/embed/pt1');
    // Com vídeo, o boneco sai: o vídeo já mostra o movimento.
    expect(screen.queryByRole('img', { name: /^Músculos/ })).toBeNull();
  });

  it('vídeo da comunidade com a URL assinada; erro pede uma URL nova', async () => {
    getExercise.mockResolvedValue({
      ...base,
      community: {
        groupId: 'g',
        groupName: 'Academia Sol',
        video: {
          id: 'v',
          kind: 'VIDEO',
          url: 'https://cdn/x.mp4?sig=1',
          width: null,
          height: null,
        },
        photos: [],
        tips: null,
      },
    });
    renderMedia();
    const video = await screen.findByLabelText('Vídeo: Leg press');
    expect(video).toHaveAttribute('src', 'https://cdn/x.mp4?sig=1');
    fireEvent.error(video);
    await waitFor(() => expect(getExercise).toHaveBeenCalledTimes(2));
  });

  it('sem vídeo: grupo, aparelho, nome, dica da comunidade e o boneco dos músculos', async () => {
    getExercise.mockResolvedValue({
      ...base,
      community: {
        groupId: 'g',
        groupName: 'Academia Sol',
        video: null,
        photos: [],
        tips: 'Pés na largura do quadril.',
      },
    });
    renderMedia();
    expect(await screen.findByText('máquina')).toBeInTheDocument();
    expect(screen.getByText('Pernas')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Leg press' })).toBeInTheDocument();
    expect(
      screen.getByText('Dica da Academia Sol: Pés na largura do quadril.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Como fazer Leg press' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Músculos: quadriceps' })).toBeInTheDocument();
  });
});

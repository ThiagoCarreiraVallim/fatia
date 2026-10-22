import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WorkoutPlanExercise } from '@fatia/api-client';
import { ExerciseDetailCard } from '../exercise-detail-card';
import { MuscleDiagram } from '../muscle-diagram';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: { ...actual.workoutApi, getPersonalRecord: vi.fn().mockResolvedValue(null) },
  };
});

/** O que o app diz ao leitor de tela e o PWA não dizia. */
describe('rótulos acessíveis do detalhe do exercício', () => {
  it('o diagrama diz quais músculos estão pintados, em português', () => {
    render(
      <MuscleDiagram primaryMuscles={['chest']} secondaryMuscles={['triceps', 'shoulders']} />,
    );

    expect(
      screen.getByRole('img', {
        name: 'Diagrama muscular. Músculos principais: peito. secundários: tríceps, ombros.',
      }),
    ).toBeInTheDocument();
  });

  it('séries e repetições do plano nomeiam o exercício', () => {
    const item = {
      id: 'pe-1',
      planId: 'p',
      exerciseId: 1,
      order: 1,
      targetSets: 3,
      targetReps: '8-12',
      exercise: {
        id: 1,
        name: 'Supino',
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
    } as unknown as WorkoutPlanExercise;

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ExerciseDetailCard mode="plan" item={item} />
      </QueryClientProvider>,
    );

    // Numa lista de N exercícios, N campos "Séries" idênticos não dizem a quem
    // usa leitor de tela de qual exercício é o campo sob o foco.
    expect(screen.getByRole('textbox', { name: 'Séries de Supino' })).toHaveValue('3');
    expect(screen.getByRole('textbox', { name: 'Repetições de Supino' })).toHaveValue('8-12');
  });
});

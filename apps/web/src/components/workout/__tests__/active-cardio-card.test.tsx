import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ExerciseGroup } from '@fatia/api-client';
import { ActiveCardioCard } from '../active-cardio-card';

// A referência da última vez é só rótulo aqui; sem o dublê, a query iria à rede.
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: { ...actual.workoutApi, getLastSet: vi.fn().mockResolvedValue(null) },
  };
});

const RUN: ExerciseGroup = {
  exerciseId: 7,
  exerciseName: 'Corrida',
  isCardio: true,
  sets: [],
  isPlanned: false,
};

async function typeDuration(text: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ActiveCardioCard sessionId="s1" group={RUN} onFinishExercise={() => undefined} />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: '0:00' }));
  const field = screen.getByLabelText('Duração (mm:ss)');
  await userEvent.clear(field);
  await userEvent.type(field, `${text}{Enter}`);
}

/** A mesma leitura de duração do app (`parseClock`). */
describe('ActiveCardioCard — duração digitada', () => {
  it.each(['1:75:00', '1a', '1:75'])('recusa %p e volta ao valor anterior', async (text) => {
    await typeDuration(text);
    expect(screen.getByRole('button', { name: '0:00' })).toBeInTheDocument();
  });

  it('aceita h:mm:ss', async () => {
    await typeDuration('1:02:03');
    expect(screen.getByRole('button', { name: '1:02:03' })).toBeInTheDocument();
  });
});

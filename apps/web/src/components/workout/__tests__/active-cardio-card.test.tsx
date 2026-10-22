import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ExerciseGroup } from '@fatia/api-client';
import { ActiveCardioCard } from '../active-cardio-card';

const CORRIDA: ExerciseGroup = {
  exerciseId: 7,
  exerciseName: 'Corrida',
  isCardio: true,
  sets: [],
  isPlanned: false,
};

async function digitarDuracao(texto: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ActiveCardioCard sessionId="s1" group={CORRIDA} onFinishExercise={() => undefined} />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: '0:00' }));
  const campo = screen.getByLabelText('Duração (mm:ss)');
  await userEvent.clear(campo);
  await userEvent.type(campo, `${texto}{Enter}`);
}

/** A mesma leitura de duração do app (`parseClock`). */
describe('ActiveCardioCard — duração digitada', () => {
  it.each(['1:75:00', '1a', '1:75'])('recusa %p e volta ao valor anterior', async (texto) => {
    await digitarDuracao(texto);
    expect(screen.getByRole('button', { name: '0:00' })).toBeInTheDocument();
  });

  it('aceita h:mm:ss', async () => {
    await digitarDuracao('1:02:03');
    expect(screen.getByRole('button', { name: '1:02:03' })).toBeInTheDocument();
  });
});

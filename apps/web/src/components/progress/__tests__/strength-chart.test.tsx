import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Exercise, PersonalRecordEntry } from '@fatia/api-client';

// O seletor de exercício abre um drawer do vaul, que arrasta portal e animação
// para dentro do jsdom sem acrescentar nada ao que se testa aqui: o que importa
// é o que o gráfico faz com a escolha, não como ela é feita. O dublê expõe um
// botão que devolve um exercício fixo.
const PICKED: Exercise = {
  id: 99,
  name: 'Agachamento livre',
  muscleGroup: 'pernas',
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
};

vi.mock('../exercise-picker-drawer', () => ({
  ExercisePickerDrawer: ({ open, onPick }: { open: boolean; onPick: (e: Exercise) => void }) =>
    open ? (
      <button type="button" onClick={() => onPick(PICKED)}>
        escolher agachamento
      </button>
    ) : null,
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: { ...actual.workoutApi, listPersonalRecords: vi.fn() },
    progressApi: { ...actual.progressApi, strength: vi.fn() },
  };
});

import { progressApi, workoutApi } from '@fatia/api-client';
import { StrengthChart } from '../strength-chart';

const listPersonalRecords = vi.mocked(workoutApi.listPersonalRecords);
const strength = vi.mocked(progressApi.strength);

function record(
  partial: Partial<PersonalRecordEntry> & { exerciseId: number },
): PersonalRecordEntry {
  return {
    exerciseName: `Exercício ${partial.exerciseId}`,
    muscleGroup: 'peito',
    type: 'strength',
    maxWeightKg: 80,
    repsAtMax: 5,
    estimated1RM: 90,
    maxDistanceMeters: null,
    bestDurationSeconds: null,
    achievedAt: null,
    lastPerformedAt: null,
    totalSets: 10,
    ...partial,
  };
}

function renderChart() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StrengthChart days={30} />
    </QueryClientProvider>,
  );
  return client;
}

describe('StrengthChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    strength.mockResolvedValue({
      exercise: { id: 0, name: '' },
      metric: 'max_weight',
      points: [],
      startValue: null,
      currentValue: null,
      deltaPercent: null,
    });
  });

  it('pré-seleciona o exercício de força mais recente e consulta o progresso dele', async () => {
    listPersonalRecords.mockResolvedValue([
      record({ exerciseId: 1, exerciseName: 'Supino reto' }),
      record({ exerciseId: 2, exerciseName: 'Remada curvada' }),
    ]);
    renderChart();

    await waitFor(() => expect(screen.getByText('Supino reto')).toBeInTheDocument());
    // Não basta o rótulo: é a query que prova que o exercício virou o assunto do
    // gráfico. `toBe` no id, e não `toContain` no nome, para a asserção
    // distinguir "Supino reto" de "Supino reto inclinado".
    await waitFor(() => expect(strength).toHaveBeenCalled());
    expect(strength.mock.calls[0][0]).toBe(1);
  });

  it('ignora recorde de cardio na pré-seleção', async () => {
    listPersonalRecords.mockResolvedValue([
      record({ exerciseId: 7, exerciseName: 'Corrida', type: 'cardio', muscleGroup: 'cardio' }),
      record({ exerciseId: 8, exerciseName: 'Levantamento terra' }),
    ]);
    renderChart();

    await waitFor(() => expect(screen.getByText('Levantamento terra')).toBeInTheDocument());
    expect(strength.mock.calls[0][0]).toBe(8);
  });

  it('a escolha manual ganha da pré-seleção e sobrevive à revalidação dos recordes', async () => {
    listPersonalRecords.mockResolvedValue([record({ exerciseId: 1, exerciseName: 'Supino reto' })]);
    const user = userEvent.setup();
    const client = renderChart();

    await waitFor(() => expect(screen.getByText('Supino reto')).toBeInTheDocument());
    // Com um exercício ativo, o botão do seletor mostra o nome dele.
    await user.click(screen.getByRole('button', { name: 'Supino reto' }));
    await user.click(screen.getByRole('button', { name: 'escolher agachamento' }));
    await waitFor(() => expect(screen.getByText('Agachamento livre')).toBeInTheDocument());

    // Chega uma resposta nova com outra cabeça de lista. A escolha da pessoa não
    // pode ser atropelada por ela.
    listPersonalRecords.mockResolvedValue([
      record({ exerciseId: 5, exerciseName: 'Desenvolvimento militar' }),
    ]);
    await client.invalidateQueries({ queryKey: ['workout', 'records'] });

    await waitFor(() => expect(listPersonalRecords).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Agachamento livre')).toBeInTheDocument();
    expect(screen.queryByText('Desenvolvimento militar')).not.toBeInTheDocument();
    expect(strength.mock.calls.at(-1)?.[0]).toBe(99);
  });

  it('sem escolha manual, a revalidação dos recordes atualiza a pré-seleção', async () => {
    // O que a pré-seleção promete é "o exercício de força treinado mais
    // recentemente". Antes da #187 ela era copiada para dentro de um `useState`
    // por efeito e travava no primeiro recorde que chegasse: quem logasse uma
    // série de outro exercício e voltasse para a tela continuava vendo o gráfico
    // do exercício antigo até recarregar o app.
    listPersonalRecords.mockResolvedValue([record({ exerciseId: 1, exerciseName: 'Supino reto' })]);
    const client = renderChart();

    await waitFor(() => expect(screen.getByText('Supino reto')).toBeInTheDocument());

    listPersonalRecords.mockResolvedValue([
      record({ exerciseId: 5, exerciseName: 'Desenvolvimento militar' }),
    ]);
    await client.invalidateQueries({ queryKey: ['workout', 'records'] });

    await waitFor(() => expect(screen.getByText('Desenvolvimento militar')).toBeInTheDocument());
    expect(screen.queryByText('Supino reto')).not.toBeInTheDocument();
    expect(strength.mock.calls.at(-1)?.[0]).toBe(5);
  });
});

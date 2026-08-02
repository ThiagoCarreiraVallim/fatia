import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ExerciseGroup, SessionSet } from '@fatia/api-client';
import { ActiveExerciseCard } from '../active-exercise-card';

// O modal de RPE só aparece depois de registrar uma série e arrasta o vaul
// junto; nada disso interessa ao valor de partida dos campos.
vi.mock('../rpe-modal', () => ({ RpeModal: () => null }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      ...actual.workoutApi,
      getLastSet: vi.fn(),
      getPersonalRecord: vi.fn(),
      logSet: vi.fn(),
      updateSet: vi.fn(),
      deleteSet: vi.fn(),
    },
  };
});

import { workoutApi } from '@fatia/api-client';

const getLastSet = vi.mocked(workoutApi.getLastSet);
const getPersonalRecord = vi.mocked(workoutApi.getPersonalRecord);
const logSet = vi.mocked(workoutApi.logSet);

const SESSION_ID = 'sessao-de-hoje';
const STARTED_AT = '2026-08-01T18:00:00.000Z';

function makeSet(partial: Partial<SessionSet> = {}): SessionSet {
  return {
    id: 'set-1',
    sessionId: SESSION_ID,
    exerciseId: 1,
    setNumber: 1,
    weightKg: null,
    reps: null,
    rpe: null,
    durationSeconds: null,
    distanceMeters: null,
    avgHeartRate: null,
    kcalBurned: null,
    notes: null,
    exercise: {
      id: 1,
      name: 'Supino reto',
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
    ...partial,
  };
}

function makeGroup(partial: Partial<ExerciseGroup> = {}): ExerciseGroup {
  return {
    exerciseId: 1,
    exerciseName: 'Supino reto',
    isCardio: false,
    sets: [],
    isPlanned: true,
    targetSets: 3,
    targetReps: '8-12',
    ...partial,
  };
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderCard(group: ExerciseGroup = makeGroup(), client: QueryClient = makeClient()) {
  return render(
    <QueryClientProvider client={client}>
      <ActiveExerciseCard
        sessionId={SESSION_ID}
        sessionStartedAt={STARTED_AT}
        group={group}
        onFinishExercise={() => undefined}
      />
    </QueryClientProvider>,
  );
}

/**
 * Valor do campo, exato.
 *
 * Nada de `toHaveTextContent('0')` aqui: com string ele casa **substring**, e
 * `'100'.includes('0')` é verdadeiro — a asserção passaria justamente no caso
 * da #190, com o campo exibindo o recorde de 100 kg. Comparar o `textContent`
 * com `toBe` é o que faz o teste ter opinião sobre o número.
 */
function fieldValue(label: string): string | null {
  return screen.getByRole('button', { name: `Editar ${label}` }).textContent;
}

const weightValue = () => fieldValue('CARGA (KG)');
const repsValue = () => fieldValue('REPETIÇÕES');

describe('ActiveExerciseCard', () => {
  beforeEach(() => {
    getLastSet.mockResolvedValue(null);
    getPersonalRecord.mockResolvedValue(null);
  });

  it('não pré-preenche a primeira série com o recorde pessoal', async () => {
    // O caso do #190: quem nunca fez o exercício fora desta sessão via o campo
    // abrir com a maior carga da vida dele.
    getPersonalRecord.mockResolvedValue({
      weightKg: 100,
      reps: 3,
      sessionDate: '2026-01-10T10:00:00.000Z',
    });
    renderCard();

    // O recorde continua visível como referência — é por ele que se sabe que a
    // query já respondeu e que, mesmo assim, o campo não o adotou.
    expect(await screen.findByText('🏆 Recorde: 100kg')).toBeInTheDocument();
    expect(weightValue()).toBe('0');
    expect(repsValue()).toBe('8');
  });

  it('aplica a referência que já está em cache na primeira pintura', () => {
    // Sair da tela do treino e voltar dentro do `gcTime` (5 min, o padrão) traz
    // o `last-set` do cache **antes** do primeiro render. Não há chegada
    // assíncrona para disparar o palpite: a passagem de montagem é a única
    // chance de aplicá-lo, e `weight` nasce de `lastSet?.weightKg ?? 0` = 0.
    //
    // É a armadilha da #187 no sítio mais caro do diff: semear o estado
    // anterior do ajuste durante o render com o palpite atual — a forma natural
    // de escrever a conversão — mata essa passagem, e o campo abre em 0 no lugar
    // da carga da sessão passada. Sem `await` de propósito: o que se afirma aqui
    // é o valor da **primeira** pintura.
    const reference = makeSet({ id: 'antigo', weightKg: 62.5, reps: 10 });
    getLastSet.mockResolvedValue(reference);
    const client = makeClient();
    client.setQueryData(['workout', 'last-set', 1, STARTED_AT], reference);

    renderCard(makeGroup(), client);

    expect(weightValue()).toBe('62.5');
    expect(repsValue()).toBe('10');
  });

  it('recorta o histórico no início da sessão em vez de filtrar no cliente', async () => {
    renderCard();
    await waitFor(() => expect(getLastSet).toHaveBeenCalledWith(1, STARTED_AT));
  });

  it('parte da última série do exercício na sessão anterior', async () => {
    getLastSet.mockResolvedValue(makeSet({ id: 'antigo', weightKg: 62.5, reps: 10 }));
    getPersonalRecord.mockResolvedValue({
      weightKg: 100,
      reps: 3,
      sessionDate: '2026-01-10T10:00:00.000Z',
    });
    renderCard();

    await waitFor(() => expect(weightValue()).toBe('62.5'));
    expect(repsValue()).toBe('10');
    expect(screen.getByText('Anterior: 62.5kg')).toBeInTheDocument();
    expect(screen.queryByText(/Recorde/)).not.toBeInTheDocument();
  });

  it('mantém carga 0 vinda de exercício de peso corporal', async () => {
    getLastSet.mockResolvedValue(makeSet({ id: 'antigo', weightKg: 0, reps: 12 }));
    renderCard();

    await waitFor(() => expect(repsValue()).toBe('12'));
    expect(weightValue()).toBe('0');
    expect(screen.getByText('Anterior: 0kg')).toBeInTheDocument();
  });

  it('registra carga 0 em vez de engoli-la como campo vazio', async () => {
    getLastSet.mockResolvedValue(makeSet({ id: 'antigo', weightKg: 0, reps: 12 }));
    logSet.mockResolvedValue(makeSet({ weightKg: 0, reps: 12 }));
    const user = userEvent.setup();
    renderCard();

    await waitFor(() => expect(repsValue()).toBe('12'));
    await user.click(screen.getByRole('button', { name: /concluir série/i }));

    await waitFor(() => expect(logSet).toHaveBeenCalledTimes(1));
    expect(logSet.mock.calls[0][1]).toMatchObject({ exerciseId: 1, weightKg: 0, reps: 12 });
  });

  it('herda a série anterior da própria sessão nas séries seguintes', async () => {
    getLastSet.mockResolvedValue(makeSet({ id: 'antigo', weightKg: 62.5, reps: 10 }));
    const group = makeGroup({ sets: [makeSet({ id: 'set-1', weightKg: 70, reps: 8 })] });
    renderCard(group);

    // A referência da sessão anterior chega e é ignorada pelo campo: quem manda
    // é a série já feita hoje.
    await waitFor(() => expect(screen.getByText('Anterior: 62.5kg')).toBeInTheDocument());
    expect(weightValue()).toBe('70');
    expect(repsValue()).toBe('8');
  });

  it('não sobrescreve o que a pessoa digitou quando a referência chega depois', async () => {
    let resolveLastSet: (set: SessionSet | null) => void = () => undefined;
    getLastSet.mockReturnValue(
      new Promise<SessionSet | null>((resolve) => {
        resolveLastSet = resolve;
      }),
    );
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getAllByRole('button', { name: 'Aumentar' })[0]);
    expect(weightValue()).toBe('1');

    resolveLastSet(makeSet({ id: 'antigo', weightKg: 62.5, reps: 10 }));

    await waitFor(() => expect(screen.getByText('Anterior: 62.5kg')).toBeInTheDocument());
    expect(weightValue()).toBe('1');
  });
});

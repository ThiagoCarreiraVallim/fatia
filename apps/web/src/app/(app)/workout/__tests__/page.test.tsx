import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SessionSet, WorkoutSession } from '@fatia/api-client';
import type { ReactNode } from 'react';
import WorkoutPage from '../page';

/**
 * A troca de exercício dentro da sessão, pela página de verdade.
 *
 * O alvo é o `key` do card: sem ele o React reaproveita a instância ao trocar o
 * foco, e o `touched` do exercício anterior sobrevive — o palpite da sessão
 * anterior (#190) deixa de rodar em todos os exercícios seguintes e o campo
 * abre com a carga do exercício errado. Testar pelo card isolado não pegaria
 * isso: quem monta (ou não) o `key` é a página.
 */

// Fora do caminho: modais e cards vizinhos não participam da troca de foco. O
// de RPE vira um marcador, porque o que importa é ele seguir aberto quando o
// card que o pediu desmonta.
vi.mock('@/components/workout/rpe-modal', () => ({
  RpeModal: ({ open, set }: { open: boolean; set: { id: string } | null }) =>
    open ? <p>RPE pedido para {set?.id}</p> : null,
}));
vi.mock('@/components/workout/exercise-search-drawer', () => ({
  ExerciseSearchDrawer: () => null,
}));
vi.mock('@/components/workout/finish-session-modal', () => ({ FinishSessionModal: () => null }));
vi.mock('@/components/workout/cancel-session-modal', () => ({ CancelSessionModal: () => null }));
// O card de leitura em si fica de fora; só o pé dele (as ações da lista) interessa.
vi.mock('@/components/workout/exercise-detail-card', () => ({
  ExerciseDetailCard: ({ footer }: { footer?: ReactNode }) => <div>{footer}</div>,
}));
vi.mock('@/components/workout/block-timeline', () => ({ BlockTimeline: () => null }));
// O embla consulta `matchMedia`, que o jsdom não tem; o carrossel não é o alvo.
vi.mock('@/components/ui/carousel', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Carousel: Passthrough, CarouselContent: Passthrough, CarouselItem: Passthrough };
});
// Mesmo dublê do `edit-height-drawer.test.tsx`: o vaul chama `setPointerCapture`,
// que o jsdom não implementa, e aqui só importa o que a confirmação diz e faz.
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
vi.mock('@/components/workout/active-cardio-card', () => ({ ActiveCardioCard: () => null }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      ...actual.workoutApi,
      getActiveSession: vi.fn(),
      getLastSet: vi.fn(),
      getPersonalRecord: vi.fn(),
      logSet: vi.fn(),
      getPrescription: vi.fn(),
      updateSession: vi.fn(),
      deleteSet: vi.fn(),
      listPlans: vi.fn(),
    },
  };
});

import { workoutApi } from '@fatia/api-client';

const getActiveSession = vi.mocked(workoutApi.getActiveSession);
const getLastSet = vi.mocked(workoutApi.getLastSet);
const getPersonalRecord = vi.mocked(workoutApi.getPersonalRecord);
const getPrescription = vi.mocked(workoutApi.getPrescription);
const logSet = vi.mocked(workoutApi.logSet);
const updateSession = vi.mocked(workoutApi.updateSession);
const deleteSet = vi.mocked(workoutApi.deleteSet);
const listPlans = vi.mocked(workoutApi.listPlans);

const STARTED_AT = '2026-08-01T18:00:00.000Z';

function makeReferenceSet(exerciseId: number, weightKg: number): SessionSet {
  return {
    id: `ref-${exerciseId}`,
    sessionId: 'sessao-passada',
    exerciseId,
    setNumber: 1,
    weightKg,
    reps: 10,
    rpe: null,
    durationSeconds: null,
    distanceMeters: null,
    avgHeartRate: null,
    kcalBurned: null,
    notes: null,
    exercise: {
      id: exerciseId,
      name: `Exercício ${exerciseId}`,
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

const session: WorkoutSession = {
  id: 'sessao-de-hoje',
  userId: 'user-1',
  planId: null,
  startedAt: STARTED_AT,
  completedAt: null,
  notes: null,
  sets: [],
  plannedExercises: [
    {
      exerciseId: 1,
      exerciseName: 'Supino reto',
      muscleGroup: 'peito',
      order: 1,
      targetSets: 3,
      targetReps: '8-12',
    },
    {
      exerciseId: 2,
      exerciseName: 'Rosca direta',
      muscleGroup: 'braço',
      order: 2,
      targetSets: 3,
      targetReps: '10-12',
    },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkoutPage />
    </QueryClientProvider>,
  );
}

function weightValue(): string | null {
  return screen.getByRole('button', { name: /^Editar carga em quilos/ }).textContent;
}

describe('WorkoutPage — troca de exercício na sessão', () => {
  beforeEach(() => {
    getActiveSession.mockResolvedValue(session);
    getPersonalRecord.mockResolvedValue(null);
    getPrescription.mockResolvedValue({ status: 'insufficient_history' });
    // Supino a 60 kg da última vez; rosca direta a 20 kg.
    getLastSet.mockImplementation(async (exerciseId: number) =>
      exerciseId === 1 ? makeReferenceSet(1, 60) : makeReferenceSet(2, 20),
    );
  });

  it('recomeça o card no exercício seguinte em vez de arrastar a carga do anterior', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Supino reto' })).toBeInTheDocument();
    await waitFor(() => expect(weightValue()).toBe('60'));

    // Ajuste manual: é o que marca `touched` e, sem `key`, vaza para o próximo.
    await user.click(
      screen.getByRole('button', { name: 'Aumentar carga em quilos para Supino reto' }),
    );
    expect(weightValue()).toBe('61');

    await user.click(screen.getByRole('button', { name: /finalizar exercício/i }));

    expect(await screen.findByRole('heading', { name: 'Rosca direta' })).toBeInTheDocument();
    await waitFor(() => expect(weightValue()).toBe('20'));
    expect(screen.getByText('Anterior: 20 kg')).toBeInTheDocument();
  });

  it('o descanso e o RPE da última série sobrevivem à troca de exercício', async () => {
    // Supino com uma série só: registrá-la conclui o exercício e o foco passa
    // para a rosca. O card do supino desmonta — e com ele, até aqui, iam o
    // descanso recém-começado e o drawer de RPE da série que acabou de sair.
    const oneSet: WorkoutSession = {
      ...session,
      plannedExercises: session.plannedExercises!.map((p) =>
        p.exerciseId === 1 ? { ...p, targetSets: 1 } : p,
      ),
    };
    const logged: SessionSet = {
      ...makeReferenceSet(1, 60),
      id: 'serie-hoje',
      sessionId: session.id,
    };
    getActiveSession.mockResolvedValue(oneSet);
    logSet.mockImplementation(async () => {
      getActiveSession.mockResolvedValue({ ...oneSet, sets: [logged] });
      return logged;
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Supino reto' })).toBeInTheDocument();
    expect(screen.getByText('0/2 exercícios')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /concluir série/i }));

    expect(await screen.findByRole('heading', { name: 'Rosca direta' })).toBeInTheDocument();
    expect(screen.getByText('1/2 exercícios')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pular descanso' })).toBeInTheDocument();
    expect(screen.getByText('RPE pedido para serie-hoje')).toBeInTheDocument();
  });
});

/**
 * Fazer outro exercício agora, reordenar e tirar — só desta sessão. A lógica é
 * a do `active-session.tsx` do app; aqui o que se prova é o que a página manda
 * para a API e quem fica em foco.
 */
describe('WorkoutPage — arrumar a sessão em andamento', () => {
  const threeExercises: WorkoutSession = {
    ...session,
    plannedExercises: [
      ...(session.plannedExercises ?? []),
      {
        exerciseId: 3,
        exerciseName: 'Agachamento',
        muscleGroup: 'pernas',
        order: 3,
        targetSets: 3,
        targetReps: '8',
      },
    ],
  };

  function loggedSet(exerciseId: number, setNumber: number): SessionSet {
    return {
      ...makeReferenceSet(exerciseId, 20),
      id: `serie-${exerciseId}-${setNumber}`,
      sessionId: threeExercises.id,
      setNumber,
    };
  }

  function listOrder() {
    return screen
      .getAllByRole('button', { name: /^Tirar .* deste treino$/ })
      .map((b) => b.getAttribute('aria-label'));
  }

  beforeEach(() => {
    getActiveSession.mockResolvedValue(threeExercises);
    getPersonalRecord.mockResolvedValue(null);
    getLastSet.mockResolvedValue(null);
    updateSession.mockResolvedValue(threeExercises);
    deleteSet.mockResolvedValue(undefined);
  });

  it('"Fazer agora" traz o exercício para o foco, inclusive um pulado', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Supino reto' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fazer Agachamento agora' }));
    expect(await screen.findByRole('heading', { name: 'Agachamento' })).toBeInTheDocument();

    // Pula o agachamento: o foco volta ao primeiro aberto, o supino. Pula o
    // supino também, e o agachamento — pulado — ainda dá para trazer de volta.
    await user.click(screen.getByRole('button', { name: /finalizar exercício/i }));
    expect(await screen.findByRole('heading', { name: 'Supino reto' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /finalizar exercício/i }));
    expect(await screen.findByRole('heading', { name: 'Rosca direta' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fazer Agachamento agora' }));
    expect(await screen.findByRole('heading', { name: 'Agachamento' })).toBeInTheDocument();
  });

  it('exercício já concluído na lista mostra "✓ Concluído"', async () => {
    getActiveSession.mockResolvedValue({
      ...threeExercises,
      sets: [loggedSet(3, 1), loggedSet(3, 2), loggedSet(3, 3)],
    });
    renderPage();
    expect(await screen.findByText('✓ Concluído')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fazer Agachamento agora' })).toBeNull();
  });

  it('mover grava a ordem inteira, com o exercício em foco onde estava', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });

    await user.click(screen.getByRole('button', { name: 'Mover Rosca direta para baixo' }));
    await waitFor(() =>
      expect(updateSession).toHaveBeenCalledWith(threeExercises.id, { exerciseOrder: [1, 3, 2] }),
    );
  });

  it('com o foco no meio, mover os de baixo não tira o foco da posição dele', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });
    await user.click(screen.getByRole('button', { name: 'Fazer Rosca direta agora' }));
    await screen.findByRole('heading', { name: 'Rosca direta' });

    // Lista de baixo: supino, agachamento. Subir o agachamento troca os dois,
    // e a rosca continua na segunda posição.
    await user.click(screen.getByRole('button', { name: 'Mover Agachamento para cima' }));
    await waitFor(() =>
      expect(updateSession).toHaveBeenCalledWith(threeExercises.id, { exerciseOrder: [3, 2, 1] }),
    );
  });

  it('a ordem nova aparece na hora e volta se a API recusar', async () => {
    let reject!: (error: Error) => void;
    updateSession.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });
    expect(listOrder()).toEqual([
      'Tirar Rosca direta deste treino',
      'Tirar Agachamento deste treino',
    ]);

    await user.click(screen.getByRole('button', { name: 'Mover Rosca direta para baixo' }));
    await waitFor(() =>
      expect(listOrder()).toEqual([
        'Tirar Agachamento deste treino',
        'Tirar Rosca direta deste treino',
      ]),
    );

    // A releitura depois do erro fica pendurada: quem desfaz a troca tem de ser
    // o rollback, não a resposta do servidor.
    getActiveSession.mockReturnValue(new Promise(() => {}));
    reject(new Error('falhou'));
    await waitFor(() =>
      expect(listOrder()).toEqual([
        'Tirar Rosca direta deste treino',
        'Tirar Agachamento deste treino',
      ]),
    );
  });

  it('sem série registrada, a lixeira tira direto e marca o planejado como removido', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });

    await user.click(screen.getByRole('button', { name: 'Tirar Rosca direta deste treino' }));
    await waitFor(() =>
      expect(updateSession).toHaveBeenCalledWith(threeExercises.id, { removedExerciseIds: [2] }),
    );
    expect(deleteSet).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('com série registrada, confirma dizendo quantas vão embora antes de apagar', async () => {
    getActiveSession.mockResolvedValue({
      ...threeExercises,
      sets: [loggedSet(2, 1), loggedSet(2, 2)],
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });

    await user.click(screen.getByRole('button', { name: 'Tirar Rosca direta deste treino' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Tirar Rosca direta do treino?');
    expect(dialog).toHaveTextContent(
      'As 2 séries registradas serão apagadas. O plano não muda: ele volta no próximo treino.',
    );
    expect(updateSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Tirar do treino' }));
    await waitFor(() =>
      expect(updateSession).toHaveBeenCalledWith(threeExercises.id, { removedExerciseIds: [2] }),
    );
    expect(deleteSet.mock.calls).toEqual([
      [threeExercises.id, 'serie-2-1'],
      [threeExercises.id, 'serie-2-2'],
    ]);
  });
});

describe('WorkoutPage — sem sessão aberta', () => {
  it('mostra os planos primeiro e a periodização por último, como no app', async () => {
    getActiveSession.mockResolvedValue(null);
    listPlans.mockResolvedValue([]);
    renderPage();

    await screen.findByText('MEUS PLANOS');
    const nodes = [
      'MEUS PLANOS',
      'PERSONALIZAÇÃO',
      'INICIAR TREINO LIVRE',
      'TREINOS RÁPIDOS',
      'PERIODIZAÇÃO',
    ].map((label) => screen.getByText(label));
    for (let i = 1; i < nodes.length; i++) {
      expect(
        nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@fatia/api-client';
import type {
  SessionSet,
  WeeklyMuscleSummary,
  WorkoutPlan,
  WorkoutSession,
} from '@fatia/api-client';
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
// O vídeo busca o exercício inteiro; aqui só importa o fluxo da sessão.
vi.mock('@/components/workout/exercise-media', () => ({
  ExerciseVideo: () => null,
  exerciseVideo: () => null,
}));

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
      getWeeklyMuscleSummary: vi.fn(),
      getLastSession: vi.fn(),
      startSession: vi.fn(),
      getActiveBlock: vi.fn().mockResolvedValue(null),
    },
    planOffersApi: {
      ...actual.planOffersApi,
      list: vi.fn().mockResolvedValue({ pending: [], accepted: [] }),
    },
  };
});

import { planOffersApi, workoutApi } from '@fatia/api-client';

const getActiveSession = vi.mocked(workoutApi.getActiveSession);
const getLastSet = vi.mocked(workoutApi.getLastSet);
const getPersonalRecord = vi.mocked(workoutApi.getPersonalRecord);
const getPrescription = vi.mocked(workoutApi.getPrescription);
const logSet = vi.mocked(workoutApi.logSet);
const updateSession = vi.mocked(workoutApi.updateSession);
const deleteSet = vi.mocked(workoutApi.deleteSet);
const listPlans = vi.mocked(workoutApi.listPlans);
const getWeeklyMuscleSummary = vi.mocked(workoutApi.getWeeklyMuscleSummary);
const getLastSession = vi.mocked(workoutApi.getLastSession);
const startSession = vi.mocked(workoutApi.startSession);

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
    expect(weightValue()).toBe('62,5');

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
    await user.click(screen.getByRole('button', { name: /concluir série/i }));

    expect(await screen.findByRole('heading', { name: 'Rosca direta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pular descanso' })).toBeInTheDocument();
    expect(screen.getByText('RPE pedido para serie-hoje')).toBeInTheDocument();
  });
});

/**
 * Fazer outro exercício agora, reordenar e tirar — só desta sessão. Como na
 * prancha Al-T3 (e no app), não há lista embaixo do card: tudo passa pelo
 * "Treino atual" (Al-T17), aberto no "Todas ›". O que se prova é o que a página
 * manda para a API e quem fica em foco.
 */
describe('WorkoutPage — arrumar a sessão pelo Treino atual', () => {
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

  async function openSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /^Todas/ }));
    const title = await screen.findByRole('heading', { name: 'Treino atual' });
    return title.closest('[role="dialog"]') as HTMLElement;
  }

  function sheetOrder(sheet: HTMLElement) {
    return within(sheet)
      .getAllByRole('button', { name: /^Tirar .* do treino$/ })
      .map((b) => b.getAttribute('aria-label'));
  }

  beforeEach(() => {
    getActiveSession.mockResolvedValue(threeExercises);
    getPersonalRecord.mockResolvedValue(null);
    getLastSet.mockResolvedValue(null);
    updateSession.mockResolvedValue(threeExercises);
    deleteSet.mockResolvedValue(undefined);
  });

  it('a sessão não tem lista embaixo do card (prancha Al-T3)', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Supino reto' })).toBeInTheDocument();
    expect(screen.queryByText('PRÓXIMOS')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Fazer .* agora$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Adicionar exercício' })).toBeNull();
  });

  it('"Iniciar" traz o exercício para o foco, inclusive um pulado', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Supino reto' })).toBeInTheDocument();

    let sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Iniciar Agachamento' }));
    expect(await screen.findByRole('heading', { name: 'Agachamento' })).toBeInTheDocument();

    // Pula o agachamento: o foco volta ao primeiro aberto, o supino. Pula o
    // supino também, e o agachamento — pulado — ainda dá para trazer de volta.
    await user.click(screen.getByRole('button', { name: /finalizar exercício/i }));
    expect(await screen.findByRole('heading', { name: 'Supino reto' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /finalizar exercício/i }));
    expect(await screen.findByRole('heading', { name: 'Rosca direta' })).toBeInTheDocument();

    sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Iniciar Agachamento' }));
    expect(await screen.findByRole('heading', { name: 'Agachamento' })).toBeInTheDocument();
  });

  it('exercício já concluído mostra "✓ Feito" e não oferece começar', async () => {
    getActiveSession.mockResolvedValue({
      ...threeExercises,
      sets: [loggedSet(3, 1), loggedSet(3, 2), loggedSet(3, 3)],
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });

    const sheet = await openSheet(user);
    expect(within(sheet).getByText('✓ Feito')).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('button', { name: /^(Iniciar|Continuar) Agachamento$/ }),
    ).toBeNull();
  });

  it('mover grava a ordem inteira e não tira o foco de quem está nele', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });
    let sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Iniciar Rosca direta' }));
    await screen.findByRole('heading', { name: 'Rosca direta' });

    sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Subir Agachamento' }));
    await waitFor(() =>
      expect(updateSession).toHaveBeenCalledWith(threeExercises.id, { exerciseOrder: [1, 3, 2] }),
    );
    expect(screen.getByRole('heading', { name: 'Rosca direta' })).toBeInTheDocument();
  });

  it('a ordem nova aparece na hora e volta se a API recusar', async () => {
    let reject!: (error: Error) => void;
    updateSession.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });
    const sheet = await openSheet(user);
    expect(sheetOrder(sheet)).toEqual([
      'Tirar Supino reto do treino',
      'Tirar Rosca direta do treino',
      'Tirar Agachamento do treino',
    ]);

    await user.click(within(sheet).getByRole('button', { name: 'Descer Rosca direta' }));
    await waitFor(() =>
      expect(sheetOrder(sheet)).toEqual([
        'Tirar Supino reto do treino',
        'Tirar Agachamento do treino',
        'Tirar Rosca direta do treino',
      ]),
    );

    // A releitura depois do erro fica pendurada: quem desfaz a troca tem de ser
    // o rollback, não a resposta do servidor.
    getActiveSession.mockReturnValue(new Promise(() => {}));
    reject(new Error('falhou'));
    await waitFor(() =>
      expect(sheetOrder(sheet)).toEqual([
        'Tirar Supino reto do treino',
        'Tirar Rosca direta do treino',
        'Tirar Agachamento do treino',
      ]),
    );
  });

  it('sem série registrada, "Tirar do treino" tira direto e marca o planejado como removido', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });

    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Tirar Rosca direta do treino' }));
    await waitFor(() =>
      expect(updateSession).toHaveBeenCalledWith(threeExercises.id, { removedExerciseIds: [2] }),
    );
    expect(deleteSet).not.toHaveBeenCalled();
    expect(screen.queryByText('Tirar Rosca direta do treino?')).toBeNull();
  });

  it('com série registrada, confirma dizendo quantas vão embora antes de apagar', async () => {
    getActiveSession.mockResolvedValue({
      ...threeExercises,
      sets: [loggedSet(2, 1), loggedSet(2, 2)],
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });

    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Tirar Rosca direta do treino' }));
    // A confirmação abre por cima do Treino atual.
    const dialog = (await screen.findByText('Tirar Rosca direta do treino?')).closest(
      '[role="dialog"]',
    ) as HTMLElement;
    expect(dialog).toHaveTextContent(
      'As séries de hoje dele são apagadas. O plano não muda: ele volta no próximo treino.',
    );
    expect(updateSession).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Tirar do treino' }));
    await waitFor(() =>
      expect(updateSession).toHaveBeenCalledWith(threeExercises.id, { removedExerciseIds: [2] }),
    );
    expect(deleteSet.mock.calls).toEqual([
      [threeExercises.id, 'serie-2-1'],
      [threeExercises.id, 'serie-2-2'],
    ]);
  });
});

describe('WorkoutPage — sessão guiada (#377)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    getActiveSession.mockResolvedValue(session);
    getPersonalRecord.mockResolvedValue(null);
    getLastSet.mockResolvedValue(null);
    getPrescription.mockResolvedValue({ status: 'insufficient_history' });
  });

  it('cabeçalho com relógio, minimizar e finalizar; "exercício X de N" anda para os lados', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Supino reto' })).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Tempo de treino' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Minimizar treino' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Finalizar treino' })).toBeInTheDocument();

    expect(screen.getByText('Exercício 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exercício anterior' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Próximo exercício' }));
    expect(await screen.findByRole('heading', { name: 'Rosca direta' })).toBeInTheDocument();
    expect(screen.getByText('Exercício 2 de 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exercício anterior' }));
    expect(await screen.findByRole('heading', { name: 'Supino reto' })).toBeInTheDocument();
  });

  it('sem "passar sozinho", o fim do exercício pergunta qual vem agora', async () => {
    window.localStorage.setItem('fatia:workout:auto-advance', '0');
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });

    await user.click(screen.getByRole('button', { name: /finalizar exercício/i }));
    const picking = await screen.findByRole('region', { name: 'Qual o próximo?' });
    expect(
      within(picking).getByRole('button', { name: 'Adicionar exercício' }),
    ).toBeInTheDocument();
    expect(within(picking).getByRole('button', { name: 'Finalizar treino' })).toBeInTheDocument();
    const toggle = within(picking).getByRole('switch', {
      name: 'Passar sozinho para o próximo exercício',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(within(picking).getByRole('button', { name: 'Fazer Rosca direta' }));
    expect(await screen.findByRole('heading', { name: 'Rosca direta' })).toBeInTheDocument();
  });

  it('o "passar sozinho" fica guardado no aparelho', async () => {
    window.localStorage.setItem('fatia:workout:auto-advance', '0');
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });
    await user.click(screen.getByRole('button', { name: /finalizar exercício/i }));
    await user.click(
      await screen.findByRole('switch', { name: 'Passar sozinho para o próximo exercício' }),
    );
    expect(window.localStorage.getItem('fatia:workout:auto-advance')).toBe('1');
  });

  it('"Treino atual" lista os exercícios; "+ Série" copia a última com chave própria', async () => {
    getActiveSession.mockResolvedValue({
      ...session,
      sets: [{ ...makeReferenceSet(1, 50), id: 'serie-1', sessionId: session.id, reps: 9 }],
    });
    logSet.mockResolvedValue(makeReferenceSet(1, 50));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Supino reto' });

    await user.click(screen.getByRole('button', { name: /^Todas/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Treino atual' })).toBeInTheDocument();
    expect(within(sheet).getByText('Rosca direta')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Mais uma série de Supino reto' }));
    await waitFor(() => expect(logSet).toHaveBeenCalledTimes(1));
    expect(logSet.mock.calls[0]![1]).toMatchObject({ exerciseId: 1, weightKg: 50, reps: 9 });
    expect(logSet.mock.calls[0]![1].clientKey).toBeTruthy();

    expect(within(sheet).getByRole('button', { name: 'Voltar ao treino' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '+ Exercício' })).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Tirar Rosca direta do treino' }),
    ).toBeInTheDocument();
  });
});

const WEEK_DAYS = [
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14',
  '2026-11-15',
];

function weekSummary(): WeeklyMuscleSummary {
  return {
    from: '2026-11-09',
    target: 12,
    sets: [],
    rested: [],
    suggestedPlan: null,
    week: {
      start: '2026-11-09',
      days: WEEK_DAYS.map((date, i) => ({
        date,
        trained: i === 0 || i === 2 || i === 4,
        active: false,
        today: i === 6,
      })),
      done: 3,
      target: 4,
    },
  };
}

const PUSH: WorkoutPlan = {
  id: 'plano-push',
  userId: 'user-1',
  name: 'Push',
  exercises: [
    {
      exerciseId: 1,
      order: 1,
      targetSets: 4,
      targetReps: '8-12',
      exercise: { name: 'Supino reto', muscleGroup: 'peito' },
    },
    {
      exerciseId: 2,
      order: 2,
      targetSets: 3,
      targetReps: '10',
      exercise: { name: 'Desenvolvimento', muscleGroup: 'ombro' },
    },
    {
      exerciseId: 3,
      order: 3,
      targetSets: 3,
      targetReps: '10',
      exercise: { name: 'Crucifixo', muscleGroup: 'peito' },
    },
    {
      exerciseId: 4,
      order: 4,
      targetSets: 2,
      targetReps: '12',
      exercise: { name: 'Tríceps corda', muscleGroup: 'braço' },
    },
  ],
} as unknown as WorkoutPlan;

describe('WorkoutPage — início do Treino (#377)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveSession.mockResolvedValue(null);
    listPlans.mockResolvedValue([PUSH]);
    getWeeklyMuscleSummary.mockResolvedValue(weekSummary());
    getLastSession.mockResolvedValue(null);
  });

  it('a faixa da semana diz quantos treinos e marca os dias, com o de hoje', async () => {
    renderPage();
    const week = await screen.findByRole('region', { name: 'Semana' });
    expect(within(week).getByText('3 de 4 treinos')).toBeInTheDocument();
    const days = within(week).getAllByRole('listitem');
    expect(days).toHaveLength(7);
    expect(within(days[0]!).getByText('9')).toBeInTheDocument();
    // Dia treinado leva ao histórico; o de hoje fica marcado.
    expect(within(week).getByRole('link', { name: 'Dia 9, treinou' })).toHaveAttribute(
      'href',
      '/workout/history',
    );
    expect(days[6]).toHaveAttribute('aria-current', 'date');
  });

  it('cada plano vira um cartão (prancha Al-T1): contas, prévia dos exercícios e o plano no toque', async () => {
    renderPage();
    const plans = await screen.findByRole('region', { name: 'Seus planos' });
    expect(
      await within(plans).findByText('4 exercícios · 12 séries · ~31 min'),
    ).toBeInTheDocument();
    expect(within(plans).getByText('Supino, Desenvolvimento, Crucifixo…')).toBeInTheDocument();
    expect(within(plans).getByRole('link', { name: /^Push/ })).toHaveAttribute(
      'href',
      '/workout/plans/plano-push',
    );
    // O cartão não tem mais o "Começar": começar fica no card dos músculos e no plano.
    expect(within(plans).queryByRole('button', { name: /Começar/ })).toBeNull();
    expect(within(plans).getByRole('link', { name: 'Ver todos' })).toHaveAttribute(
      'href',
      '/workout/plans',
    );
    expect(within(plans).getByRole('link', { name: /Novo plano/ })).toHaveAttribute(
      'href',
      '/workout/plans',
    );
  });

  it('"Outros jeitos de treinar": livre e só cardio; os treinos rápidos vêm depois', async () => {
    startSession.mockResolvedValue(session);
    const user = userEvent.setup();
    renderPage();
    const other = await screen.findByRole('region', { name: 'Outros jeitos de treinar' });
    expect(within(other).getByRole('button', { name: /Só cardio/ })).toBeInTheDocument();
    expect(within(other).queryByText('Treinos rápidos')).toBeNull();
    expect(screen.getByRole('region', { name: 'Treinos rápidos' })).toBeInTheDocument();
    await user.click(within(other).getByRole('button', { name: /Livre/ }));
    await waitFor(() => expect(startSession).toHaveBeenCalledTimes(1));
    expect(startSession.mock.calls[0]![0].planId).toBeUndefined();
  });

  it('o bloco numa linha; o toque abre o detalhe', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByRole('button', { name: /Periodização em blocos/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
  });

  it('se já havia um treino aberto (409), abre esse em vez de dar erro', async () => {
    startSession.mockRejectedValue(
      new ApiError('aberta', 409, { activeSessionId: 'sessao-de-hoje' }),
    );
    getActiveSession.mockResolvedValueOnce(null).mockResolvedValue(session);
    getLastSet.mockResolvedValue(null);
    getPersonalRecord.mockResolvedValue(null);
    getPrescription.mockResolvedValue({ status: 'insufficient_history' });
    const user = userEvent.setup();
    renderPage();
    const other = await screen.findByRole('region', { name: 'Outros jeitos de treinar' });
    await user.click(within(other).getByRole('button', { name: /Livre/ }));
    expect(await screen.findByRole('heading', { name: 'Supino reto' })).toBeInTheDocument();
  });
});

describe('WorkoutPage — sem sessão aberta', () => {
  it('semana, planos, outros jeitos, o bloco e os treinos rápidos, como no app', async () => {
    getActiveSession.mockResolvedValue(null);
    listPlans.mockResolvedValue([]);
    getWeeklyMuscleSummary.mockResolvedValue(weekSummary());
    getLastSession.mockResolvedValue(null);
    renderPage();

    await screen.findByRole('heading', { name: 'Semana' });
    await screen.findByRole('region', { name: 'Periodização' });
    const nodes = [
      'Semana',
      'Seus planos',
      'Outros jeitos de treinar',
      'Periodização',
      'Treinos rápidos',
    ].map((label) => screen.getByRole('region', { name: label }));
    for (let i = 1; i < nodes.length; i++) {
      expect(
        nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('o plano recebido da equipe avisa acima da semana; a agenda fica no topo (#379)', async () => {
    getActiveSession.mockResolvedValue(null);
    listPlans.mockResolvedValue([]);
    getWeeklyMuscleSummary.mockResolvedValue(weekSummary());
    getLastSession.mockResolvedValue(null);
    vi.mocked(planOffersApi.list).mockResolvedValueOnce({
      pending: [
        {
          id: 'o1',
          versionId: 'v1',
          title: 'Inferior',
          version: 1,
          kind: 'new',
          status: 'PENDING',
          schedule: 'CALENDAR',
          authorName: 'Helena Personal',
          groupName: 'Academia Demo',
          sentAt: '2026-08-01T12:00:00.000Z',
          planId: null,
          href: '/workout/offers/o1',
        },
      ],
      accepted: [],
    });
    renderPage();

    const notice = await screen.findByRole('link', { name: /Helena enviou Inferior/ });
    expect(notice).toHaveAttribute('href', '/workout/offers/o1');
    const week = await screen.findByRole('region', { name: 'Semana' });
    expect(notice.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/workout/agenda');
  });
});

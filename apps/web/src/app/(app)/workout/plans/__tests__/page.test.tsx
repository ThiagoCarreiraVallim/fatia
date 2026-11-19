import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { TrainingBlock, WorkoutPlan, WorkoutPlanExercise } from '@fatia/api-client';
import PlansPage from '../page';

const push = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/workout/plans',
  useSearchParams: () => search,
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      ...actual.workoutApi,
      listPlans: vi.fn(),
      deletePlan: vi.fn(),
      startSession: vi.fn(),
      getActiveBlock: vi.fn(),
      getActiveSession: vi.fn().mockResolvedValue(null),
    },
    planOrderApi: { get: vi.fn(), set: vi.fn() },
  };
});

import { planOrderApi, workoutApi } from '@fatia/api-client';

const listPlans = vi.mocked(workoutApi.listPlans);
const deletePlan = vi.mocked(workoutApi.deletePlan);
const startSession = vi.mocked(workoutApi.startSession);
const getActiveBlock = vi.mocked(workoutApi.getActiveBlock);

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PlansPage />
    </QueryClientProvider>,
  );
}

const line = (
  name: string,
  muscleGroup: string,
  targetSets: number,
  restSeconds: number,
): WorkoutPlanExercise =>
  ({
    id: name,
    exerciseId: 1,
    order: 1,
    targetSets,
    targetReps: '8-12',
    repUnit: 'REPS',
    restSeconds,
    cardioTarget: null,
    cardioDurationSeconds: null,
    cardioDistanceMeters: null,
    sets: [],
    exercise: { id: 1, name, muscleGroup },
  }) as unknown as WorkoutPlanExercise;

const PUSH = { id: 'p1', name: 'Push', exercises: [] } as unknown as WorkoutPlan;

describe('PlansPage', () => {
  beforeEach(() => {
    listPlans.mockReset();
    deletePlan.mockReset();
    startSession.mockReset();
    push.mockReset();
    getActiveBlock.mockResolvedValue(null);
    search = new URLSearchParams();
  });

  it('pergunta antes de excluir o plano, e só exclui na confirmação', async () => {
    listPlans.mockResolvedValue([PUSH]);
    deletePlan.mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Excluir plano Push' }));
    // Al-T6: a pergunta abre no próprio card, não num diálogo.
    const ask = await screen.findByRole('group', { name: 'Excluir “Push”?' });
    expect(ask).toHaveTextContent('O histórico das sessões continua.');
    expect(deletePlan).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(deletePlan).toHaveBeenCalledWith('p1'));
  });

  it('erro ao carregar aparece com tentar de novo, e não como lista vazia', async () => {
    listPlans.mockRejectedValueOnce(new Error('sem conexão'));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar seus planos',
    );
    expect(screen.queryByText('Nenhum plano criado ainda')).toBeNull();

    listPlans.mockResolvedValueOnce([PUSH]);
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(await screen.findByText('Push')).toBeInTheDocument();
  });

  it('cada card resume o plano (Al-T6): exercícios, séries, minutos e a divisão por grupo', async () => {
    listPlans.mockResolvedValue([
      {
        ...PUSH,
        exercises: [line('Supino reto', 'peito', 4, 90), line('Elevação lateral', 'ombro', 3, 60)],
      } as WorkoutPlan,
    ]);
    renderPage();
    // 4 × (40 + 90) + 3 × (40 + 60) = 820 s ≈ 14 min.
    expect(await screen.findByText('2 exercícios · 7 séries · ~14 min')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Peito 57%, Ombro 43%' })).toBeInTheDocument();
    expect(screen.getByText('Supino reto')).toBeInTheDocument();
  });

  it('Começar abre a sessão do plano direto da lista', async () => {
    listPlans.mockResolvedValue([
      { ...PUSH, exercises: [line('Supino reto', 'peito', 3, 90)] } as WorkoutPlan,
    ]);
    startSession.mockResolvedValue({ id: 's1' } as never);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Começar Push' }));
    await waitFor(() =>
      expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ planId: 'p1' })),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout'));
  });

  it('plano vazio não começa', async () => {
    listPlans.mockResolvedValue([PUSH]);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Começar Push' })).toBeDisabled();
  });

  it('Novo plano leva ao Criar plano, e há atalhos para modelos e bloco de semanas', async () => {
    listPlans.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByRole('link', { name: /Novo plano/ })).toHaveAttribute(
      'href',
      '/workout/plans/new',
    );
    expect(screen.getByRole('link', { name: /Modelos das comunidades/ })).toHaveAttribute(
      'href',
      '/workout/templates',
    );
    expect(screen.getByRole('link', { name: /Bloco de semanas/ })).toHaveAttribute(
      'href',
      '/workout/block',
    );
  });

  it('mostra o bloco de semanas em andamento', async () => {
    listPlans.mockResolvedValue([PUSH]);
    getActiveBlock.mockResolvedValue({
      id: 'b',
      planId: 'p1',
      planName: 'Push',
      kindLabel: 'Hipertrofia',
      weeksTotal: 4,
      currentWeek: { weekNumber: 2, sessionsDone: 1, sessionsTarget: 3 },
    } as unknown as TrainingBlock);
    renderPage();
    expect(await screen.findByText('Semana 2 de 4')).toBeInTheDocument();
    expect(screen.getByText('1 de 3 sessões nesta semana')).toBeInTheDocument();
  });

  it('aba Circuitos (#380): só os circuitos, com o selo e o resumo; Começar abre o relógio', async () => {
    search = new URLSearchParams('tab=circuitos');
    const amrap = {
      id: 'c1',
      name: 'AMRAP 12',
      kind: 'CIRCUIT',
      circuit: { format: 'AMRAP', durationSeconds: 720 },
      exercises: [line('Burpee', 'cardio', 1, 0), line('Prancha', 'core', 1, 0)],
    } as unknown as WorkoutPlan;
    listPlans.mockResolvedValue([PUSH, amrap]);
    startSession.mockResolvedValue({ id: 's9' } as never);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('AMRAP 12')).toBeInTheDocument();
    expect(screen.queryByText('Push')).toBeNull();
    expect(screen.getByText('máximo de rounds em 12 min · 2 exercícios')).toBeInTheDocument();
    expect(screen.getByText('AMRAP')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Novo circuito/ })).toHaveAttribute(
      'href',
      '/workout/circuits/new',
    );
    expect(screen.queryByText('Modelos das comunidades')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Começar AMRAP 12' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout/circuit/s9'));

    // Planos não mostra o circuito.
    await user.click(screen.getByRole('radio', { name: 'Planos' }));
    expect(await screen.findByText('Push')).toBeInTheDocument();
    expect(screen.queryByText('AMRAP 12')).toBeNull();
  });

  it('Ordenar: sobe um plano e manda a ordem inteira, com os circuitos no fim (#402)', async () => {
    const PULL = { id: 'p2', name: 'Pull', exercises: [] } as unknown as WorkoutPlan;
    const CIRC = {
      id: 'c1',
      name: 'HIIT',
      kind: 'CIRCUIT',
      exercises: [],
    } as unknown as WorkoutPlan;
    listPlans.mockResolvedValue([PUSH, CIRC, PULL]);
    vi.mocked(planOrderApi.set).mockResolvedValue({
      planIds: ['p2', 'p1', 'c1'],
      customized: true,
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Ordenar' }));
    expect(screen.getByRole('button', { name: 'Subir Push' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Subir Pull' }));
    await waitFor(() => expect(planOrderApi.set).toHaveBeenCalledWith(['p2', 'p1', 'c1']));
    await userEvent.click(screen.getByRole('button', { name: 'Pronto' }));
    expect(screen.queryByRole('button', { name: 'Subir Pull' })).not.toBeInTheDocument();
  });
});

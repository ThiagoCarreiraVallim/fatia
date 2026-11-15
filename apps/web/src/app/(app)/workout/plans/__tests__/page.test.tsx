import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { TrainingBlock, WorkoutPlan, WorkoutPlanExercise } from '@fatia/api-client';
import PlansPage from '../page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
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
    },
  };
});

import { workoutApi } from '@fatia/api-client';

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
  });

  it('pergunta antes de excluir o plano, e só exclui na confirmação', async () => {
    listPlans.mockResolvedValue([PUSH]);
    deletePlan.mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Excluir plano Push' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Excluir “Push”?');
    expect(dialog).toHaveTextContent('O histórico das sessões continua.');
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
      '/community',
    );
    expect(screen.getByRole('link', { name: /Bloco de semanas/ })).toHaveAttribute(
      'href',
      '/workout#bloco',
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
});

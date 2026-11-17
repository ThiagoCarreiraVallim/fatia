import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError, type WorkoutPlan, type WorkoutSessionSummary } from '@fatia/api-client';
import { AppTopBar, TopBarProvider } from '@/components/layout/app-top-bar';
import HistorySessionPage from '../page';

/** Sessão do histórico (Al-T11 força, Al-T11b cardio, #381). */

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sessao-1' }),
  useRouter: () => ({ push, replace, back: vi.fn() }),
  usePathname: () => '/workout/history/sessao-1',
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      getSessionSummary: vi.fn(),
      startSession: vi.fn(),
      saveSessionAsPlan: vi.fn(),
    },
    usersApi: { me: vi.fn().mockResolvedValue({}) },
  };
});

import { workoutApi } from '@fatia/api-client';

const getSummary = vi.mocked(workoutApi.getSessionSummary);
const startSession = vi.mocked(workoutApi.startSession);
const saveAsPlan = vi.mocked(workoutApi.saveSessionAsPlan);

const base: WorkoutSessionSummary = {
  sessionId: 'sessao-1',
  kind: 'plan',
  planId: 'plano-a',
  planName: 'Treino A',
  startedAt: '2026-11-02T12:00:00.000Z',
  completedAt: '2026-11-02T13:00:00.000Z',
  durationMinutes: 58,
  sets: 6,
  volumeKg: 6200,
  feeling: 2,
  notes: 'Ombro bem',
  overallFeeling: null,
  comparison: null,
  records: [],
  muscles: { groups: [], primary: [], secondary: [] },
  exercises: [
    {
      exerciseId: 1,
      exerciseName: 'Supino reto',
      muscleGroup: 'peito',
      isCardio: false,
      sets: 2,
      best: {
        weightKg: 60,
        reps: 8,
        distanceMeters: null,
        durationSeconds: null,
        avgHeartRate: null,
      },
      feeling: 3,
      isRecord: true,
      setList: [
        {
          setNumber: 1,
          weightKg: 52.5,
          reps: 10,
          durationSeconds: null,
          distanceMeters: null,
          feeling: 2,
        },
        {
          setNumber: 2,
          weightKg: 60,
          reps: 8,
          durationSeconds: null,
          distanceMeters: null,
          feeling: 4,
        },
      ],
    },
    {
      exerciseId: 2,
      exerciseName: 'Prancha',
      muscleGroup: 'abdomen',
      isCardio: false,
      sets: 1,
      best: {
        weightKg: null,
        reps: null,
        distanceMeters: null,
        durationSeconds: 45,
        avgHeartRate: null,
      },
      feeling: null,
      isRecord: false,
      setList: [
        {
          setNumber: 1,
          weightKg: null,
          reps: null,
          durationSeconds: 45,
          distanceMeters: null,
          feeling: null,
        },
      ],
    },
  ],
  checkin: null,
  questions: null,
};

const cardio: WorkoutSessionSummary = {
  ...base,
  kind: 'free',
  planId: null,
  planName: null,
  volumeKg: 0,
  sets: 1,
  feeling: 1,
  notes: null,
  records: [
    {
      exerciseId: 9,
      exerciseName: 'Esteira',
      weightKg: null,
      reps: null,
      distanceMeters: 5100,
      durationSeconds: 1800,
      previous: { weightKg: null, reps: null, distanceMeters: 4600 },
    },
  ],
  exercises: [
    {
      exerciseId: 9,
      exerciseName: 'Esteira',
      muscleGroup: 'cardio',
      isCardio: true,
      sets: 1,
      best: {
        weightKg: null,
        reps: null,
        distanceMeters: 5100,
        durationSeconds: 1800,
        avgHeartRate: 146,
        kcalBurned: 320,
      },
      feeling: null,
      isRecord: true,
      setList: [],
    },
  ],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TopBarProvider>
        <AppTopBar />
        <HistorySessionPage />
      </TopBarProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe('Sessão do histórico', () => {
  beforeEach(() => vi.clearAllMocks());

  it('força: título com a data, cartão verde e o primeiro exercício aberto com as séries', async () => {
    getSummary.mockResolvedValue(base);
    const user = userEvent.setup();
    renderPage();
    const hero = await screen.findByRole('region', { name: 'Resumo do treino' });
    expect(hero).toHaveTextContent('CONCLUÍDO · TREINO A');
    expect(hero).toHaveTextContent('58′');
    expect(hero).toHaveTextContent('6,2 t');
    expect(hero.className).toContain('bg-primary');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/2 nov/);
    expect(screen.getByRole('region', { name: 'Como foi o treino' })).toHaveTextContent(
      '“Ombro bem”',
    );

    const supino = screen.getByRole('list', { name: 'Séries de Supino reto' });
    expect(within(supino).getAllByRole('listitem')[0]).toHaveTextContent('52,5 kg × 10');
    expect(screen.getByText('recorde')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Séries de Prancha' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /Prancha/ }));
    expect(screen.getByRole('list', { name: 'Séries de Prancha' })).toHaveTextContent('45 s');
    expect(screen.queryByRole('list', { name: 'Séries de Supino reto' })).toBeNull();

    expect(screen.getByRole('link', { name: 'Corrigir séries deste treino' })).toHaveAttribute(
      'href',
      '/workout/session/sessao-1',
    );
    // Sessão de plano: repete o plano, não vira plano de novo.
    expect(screen.queryByRole('button', { name: 'Salvar como plano' })).toBeNull();
  });

  it('a seta de voltar leva ao histórico', async () => {
    getSummary.mockResolvedValue(base);
    renderPage();
    await screen.findByRole('region', { name: 'Resumo do treino' });
    expect(screen.getByRole('link', { name: /Voltar/ })).toHaveAttribute(
      'href',
      '/workout/history',
    );
  });

  it('"Repetir este treino" começa o mesmo plano', async () => {
    getSummary.mockResolvedValue(base);
    startSession.mockResolvedValue({ id: 'nova' } as never);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Repetir este treino' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout'));
    expect(startSession.mock.calls[0]![0].planId).toBe('plano-a');
  });

  it('cardio: cartão rosa, kcal, recorde de distância com o "antes" e salvar como plano', async () => {
    getSummary.mockResolvedValue(cardio);
    saveAsPlan.mockResolvedValue({ id: 'plano-novo' } as WorkoutPlan);
    const user = userEvent.setup();
    renderPage();
    const hero = await screen.findByRole('region', { name: 'Resumo do treino' });
    expect(hero).toHaveTextContent('CONCLUÍDO · TREINO LIVRE');
    expect(hero).toHaveTextContent('5,1 km');
    expect(hero).toHaveTextContent('146');
    expect(hero.className).toContain('bg-danger');
    expect(screen.getByText('320')).toBeInTheDocument();
    expect(screen.getByText('Maior distância na esteira')).toBeInTheDocument();
    expect(screen.getByText('antes 4,6 km')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar como plano' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout/plans/plano-novo'));
    expect(saveAsPlan).toHaveBeenCalledWith('sessao-1');
  });

  it('plano apagado: a sessão segue de plano e não oferece virar plano', async () => {
    getSummary.mockResolvedValue({ ...base, kind: 'plan', planId: null });
    renderPage();
    await screen.findByRole('region', { name: 'Resumo do treino' });
    expect(screen.queryByRole('button', { name: 'Salvar como plano' })).toBeNull();
  });

  it('livre já salvo como plano: "Ver plano" no lugar de "Salvar como plano"', async () => {
    getSummary.mockResolvedValue({ ...cardio, savedPlanId: 'plano-salvo' });
    renderPage();
    await screen.findByRole('region', { name: 'Resumo do treino' });
    expect(screen.getByRole('link', { name: 'Ver plano' })).toHaveAttribute(
      'href',
      '/workout/plans/plano-salvo',
    );
    expect(screen.queryByRole('button', { name: 'Salvar como plano' })).toBeNull();
  });

  it('livre: "Repetir" começa outro livre com os mesmos exercícios já escolhidos', async () => {
    getSummary.mockResolvedValue(cardio);
    startSession.mockResolvedValue({ id: 'nova' } as never);
    const user = userEvent.setup();
    const client = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Repetir' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout'));
    expect(startSession.mock.calls[0]![0].planId).toBeUndefined();
    expect(client.getQueryData(['workout', 'session', 'nova', 'pending'])).toEqual([
      { id: 9, name: 'Esteira', muscleGroup: 'cardio' },
    ]);
  });

  it('sessão ainda aberta vai para o treino em andamento', async () => {
    getSummary.mockResolvedValue({ ...base, completedAt: null });
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/workout'));
  });

  it('sessão que não existe (ou de outra pessoa): 404 com volta ao histórico', async () => {
    getSummary.mockRejectedValue(new ApiError('não', 404, {}));
    renderPage();
    expect(await screen.findByText('Treino não encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao histórico' })).toHaveAttribute(
      'href',
      '/workout/history',
    );
  });
});

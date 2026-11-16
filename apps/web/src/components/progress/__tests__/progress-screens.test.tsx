import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ProgressScreen } from '../progress-screen';
import { ConsistencyScreen } from '../consistency-screen';
import { AchievementsScreen } from '../achievements-screen';
import { RecordsScreen } from '../records-screen';
import { ChartsScreen } from '../charts-screen';

/** Telas de Progresso do redesign (#382): G1, G12, G11, G5 e G6 na web. */

const progressApi = vi.hoisted(() => ({
  weight: vi.fn(),
  steps: vi.fn(),
  volume: vi.fn(),
  cardio: vi.fn(),
  strength: vi.fn(),
  consistency: vi.fn(),
  listAchievements: vi.fn(),
}));
const workoutApi = vi.hoisted(() => ({ recordsOverview: vi.fn(), searchExercises: vi.fn() }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    progressApi: { ...actual.progressApi, ...progressApi },
    workoutApi: { ...actual.workoutApi, ...workoutApi },
    usersApi: {
      ...actual.usersApi,
      me: vi.fn().mockResolvedValue({ loadUnit: 'KG', distanceUnit: 'KM' }),
    },
  };
});
vi.mock('@/components/progress/body-log-sheet', () => ({ BodyLogSheet: () => null }));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const STREAK = {
  periodos: 12,
  faltasUsadas: 0,
  faltasPermitidas: 1,
  periodoCorrenteEmAberto: false,
  janelaEsgotada: false,
};

function days(from: string, n: number, count = 1) {
  const out = [];
  const d = new Date(`${from}T12:00:00Z`);
  for (let i = 0; i < n; i++) {
    const date = d.toISOString().slice(0, 10);
    out.push({ date, meal: count > 0, workout: false, water: false, steps: false, count });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const REPORT = {
  range: 'month',
  from: '2026-10-18',
  to: '2026-11-16',
  days: days('2026-10-18', 30),
  activeDays: 16,
  totalDays: 30,
  streak: STREAK,
  record: 21,
  byArea: {
    meal: { days: 24, of: 30 },
    workout: { days: 12, of: 16 },
    water: { days: 18, of: 30 },
    steps: { days: 0, of: null },
  },
};

function achievement(key: string, title: string, unlocked: boolean, extra = {}) {
  return {
    key,
    title,
    description: '',
    condition: `Condição de ${title}`,
    unlockedAt: unlocked ? '2026-09-28T12:00:00.000Z' : null,
    context: null,
    progress: null,
    ...extra,
  };
}

const ACHIEVEMENTS = [
  achievement('first_meal', 'Primeira refeição', true, { context: { mealType: 'BREAKFAST' } }),
  achievement('first_workout', 'Primeiro treino', true),
  achievement('workouts_100', '100 treinos', false, { progress: { current: 42, target: 100 } }),
];

function record(id: number, name: string, group: string, weight: number, e1rm: number) {
  return {
    exerciseId: id,
    exerciseName: name,
    muscleGroup: group,
    type: 'strength',
    maxWeightKg: weight,
    repsAtMax: 10,
    estimated1RM: e1rm,
    maxDistanceMeters: null,
    bestDurationSeconds: null,
    achievedAt: '2026-10-30T12:00:00.000Z',
    lastPerformedAt: '2026-10-30T12:00:00.000Z',
    totalSets: 10,
    monthEvolution: null,
  };
}

const RECORDS = {
  records: [
    record(1, 'Rosca direta', 'braço', 22.5, 30),
    record(2, 'Leg press 45°', 'pernas', 152, 203),
  ],
  highlight: {
    ...record(2, 'Leg press 45°', 'pernas', 152, 203),
    monthEvolution: { startE1RM: 176, endE1RM: 203, percent: 15.3 },
  },
};

function mockAll() {
  progressApi.weight.mockResolvedValue({
    points: [
      { date: '2026-10-20', weightKg: 71 },
      { date: '2026-11-15', weightKg: 70.2 },
    ],
    weeklyAverages: [],
    totalDeltaKg: -0.8,
    currentWeightKg: 70.2,
    latest: null,
    previous: null,
    deltaSinceLastKg: null,
  });
  progressApi.steps.mockResolvedValue({
    points: [{ date: '2026-11-15', steps: 9000, goalReached: null }],
    weeklyAverages: [],
    totalSteps: 9000,
    averageDaily: 8884,
    bestDay: { date: '2026-11-15', steps: 9000 },
    goalTarget: null,
    daysWithGoalReached: 0,
  });
  progressApi.volume.mockResolvedValue({ weeks: [], averageWeeklyVolumeKg: 0 });
  progressApi.cardio.mockResolvedValue({
    exercise: null,
    metric: 'pace',
    points: [],
    bestSession: null,
  });
  progressApi.strength.mockResolvedValue({
    exercise: { id: 2, name: 'Leg press 45°' },
    metric: 'max_weight',
    points: [],
    startValue: null,
    currentValue: null,
    deltaPercent: null,
  });
  progressApi.consistency.mockResolvedValue(REPORT);
  progressApi.listAchievements.mockResolvedValue(ACHIEVEMENTS);
  workoutApi.recordsOverview.mockResolvedValue(RECORDS);
}

afterEach(() => vi.clearAllMocks());

describe('Progresso (Al-G1)', () => {
  it('leva aos gráficos, à constância, aos recordes e às conquistas', async () => {
    mockAll();
    wrap(<ProgressScreen />);

    expect(await screen.findByText('70,2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver todos os gráficos/ })).toHaveAttribute(
      'href',
      '/progress/charts',
    );
    expect(await screen.findByRole('link', { name: /Constância/ })).toHaveAttribute(
      'href',
      '/progress/consistency',
    );
    expect(screen.getByText('· 12 dias seguidos')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /2 recordes/ })).toHaveAttribute(
      'href',
      '/progress/records',
    );
    expect(await screen.findByRole('link', { name: /2\/3 conquistas/ })).toHaveAttribute(
      'href',
      '/progress/achievements',
    );
  });

  it('% de gordura ainda não abre nada: a avaliação chega com a #383', async () => {
    mockAll();
    wrap(<ProgressScreen />);

    const gordura = await screen.findByText('gordura');
    expect(gordura.closest('a')).toBeNull();
  });
});

describe('Constância (Al-G12)', () => {
  it('mostra os três números, a grade do mês e as áreas', async () => {
    mockAll();
    wrap(<ConsistencyScreen />);

    expect(await screen.findByText('16/30')).toBeInTheDocument();
    expect(screen.getByText('Outubro e novembro')).toBeInTheDocument();
    expect(screen.getByText('12/16')).toBeInTheDocument();
    expect(screen.getByText('sem meta')).toBeInTheDocument();
  });

  it('trocar o período pede o relatório do período', async () => {
    mockAll();
    const user = userEvent.setup();
    wrap(<ConsistencyScreen />);
    await screen.findByText('16/30');

    await user.click(screen.getByRole('radio', { name: '1 ano' }));

    expect(progressApi.consistency).toHaveBeenLastCalledWith('year');
  });
});

describe('Conquistas (Al-G11)', () => {
  it('conta N de 10 e mostra o detalhe da escolhida', async () => {
    mockAll();
    const user = userEvent.setup();
    wrap(<AchievementsScreen />);

    expect(await screen.findByText('2 de 3 desbloqueadas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /100 treinos/ }));

    expect(screen.getByText('Bloqueada · faltam 58')).toBeInTheDocument();
  });
});

describe('Recordes (Al-G5)', () => {
  it('destaque do mês em % e a lista filtrada por grupo', async () => {
    mockAll();
    const user = userEvent.setup();
    wrap(<RecordsScreen />);

    expect(await screen.findByText('+15%')).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: 'Recordes' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Braço' }));

    expect(within(lista).getAllByRole('listitem')).toHaveLength(1);
    expect(within(lista).getByText('Rosca direta')).toBeInTheDocument();
  });
});

describe('Gráficos (Al-G6)', () => {
  it('troca o tipo de gráfico e mostra o resumo e a nota de cada um', async () => {
    mockAll();
    const user = userEvent.setup();
    wrap(<ChartsScreen />);

    expect(
      await screen.findByText('Peso entra pelo Hoje ou pela balança conectada.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Passos' }));

    expect(
      await screen.findByText('Passos chegam do Apple Saúde ou Health Connect.'),
    ).toBeInTheDocument();
    expect(screen.getByText('melhor dia')).toBeInTheDocument();
  });

  it('em Força escolhe a métrica', async () => {
    mockAll();
    const user = userEvent.setup();
    wrap(<ChartsScreen />);

    await user.click(await screen.findByRole('button', { name: 'Força' }));
    await user.click(await screen.findByRole('radio', { name: 'Volume' }));

    expect(progressApi.strength).toHaveBeenLastCalledWith(2, 30, 'total_volume');
  });
});

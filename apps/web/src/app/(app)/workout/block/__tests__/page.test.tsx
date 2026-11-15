import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlockPreview, TrainingBlock, TrainingBlockWeek } from '@fatia/api-client';

const ctx = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  push: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: ctx.toast }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: ctx.push }) }));
vi.mock('@/components/workout/block-timeline', () => ({
  BlockTimeline: () => <p>linha do bloco em andamento</p>,
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    blockPlannerApi: { preview: vi.fn(), latest: vi.fn(), create: vi.fn() },
    workoutApi: { ...actual.workoutApi, listPlans: vi.fn().mockResolvedValue([]) },
  };
});

import { blockPlannerApi } from '@fatia/api-client';
import BlockPage from '../page';

const api = vi.mocked(blockPlannerApi);

function preview(weeks: number, kind: BlockPreview['kind'] = 'hypertrophy'): BlockPreview {
  return {
    kind,
    kindLabel: kind === 'strength' ? 'força' : 'hipertrofia',
    repRange: '8-12',
    weeksTotal: weeks,
    weeks: Array.from({ length: weeks }, (_, i) => {
      const deload = i === weeks - 1;
      return {
        weekNumber: i + 1,
        focus: deload ? 'deload' : 'accumulation',
        label: deload ? 'Deload' : `Acúmulo ${i + 1}`,
        intensityFactor: deload ? 0.85 : 1,
        volumeFactor: deload ? 0.5 : 1,
        sessionsTarget: 4,
        summary: '',
      };
    }),
  };
}

const week = (n: number, over: Partial<TrainingBlockWeek> = {}): TrainingBlockWeek => ({
  weekNumber: n,
  focus: 'accumulation',
  intensityFactor: 1,
  volumeFactor: 1,
  weekStart: '2025-10-06',
  effectiveWeekStart: '2025-10-06',
  effectiveWeekEnd: '2025-10-12',
  sessionsTarget: 4,
  sessionsDone: 3,
  shiftedWeeks: 0,
  state: 'done',
  ...over,
});

const block = (over: Partial<TrainingBlock> = {}): TrainingBlock => ({
  id: 'b1',
  planId: null,
  planName: null,
  kind: 'strength',
  kindLabel: 'força',
  repRange: '3-6',
  startDate: '2025-10-06',
  weeksTotal: 3,
  status: 'completed',
  currentWeek: null,
  nextWeek: null,
  weeks: [week(1), week(2), week(3, { sessionsDone: 2 })],
  deload: { suggested: false, reason: 'insufficient_history' },
  explanation: '',
  ...over,
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BlockPage />
    </QueryClientProvider>,
  );
}

describe('Bloco de treino (Al-T12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.preview.mockImplementation(async (q) => preview(q.weeks, q.kind));
  });

  it('sem bloco: hipertrofia em 4 semanas, a última de deload', async () => {
    api.latest.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText('Acúmulo 1')).toBeInTheDocument();
    expect(api.preview).toHaveBeenCalledWith(expect.objectContaining({ weeks: 4, kind: 'hypertrophy' }));
    expect(screen.getByText('Deload')).toBeInTheDocument();
    expect(screen.getAllByText('intensidade 100% · volume 100%')).toHaveLength(3);
    expect(screen.getByText('intensidade 85% · volume 50%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começar bloco de 4 semanas' })).toBeInTheDocument();
  });

  it('trocar semanas e tipo refaz a prévia; começar grava o que está na tela', async () => {
    api.latest.mockResolvedValue(null);
    api.create.mockResolvedValue(block({ status: 'active' }));
    renderPage();
    await screen.findByText('Acúmulo 1');
    await userEvent.click(screen.getByRole('button', { name: '6 semanas' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Força' }));
    await waitFor(() =>
      expect(api.preview).toHaveBeenLastCalledWith(expect.objectContaining({ weeks: 6, kind: 'strength' })),
    );
    expect(await screen.findByText('Acúmulo 5')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Começar bloco de 6 semanas' }));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ weeks: 6, kind: 'strength' })),
    );
    await waitFor(() => expect(ctx.push).toHaveBeenCalledWith('/workout'));
  });

  it('bloco em andamento: mostra a semana atual e não oferece começar outro', async () => {
    api.latest.mockResolvedValue(block({ status: 'active' }));
    renderPage();
    expect(await screen.findByText('linha do bloco em andamento')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Começar bloco/ })).not.toBeInTheDocument();
  });

  it('bloco concluído: o resumo, e dá para montar o próximo', async () => {
    api.latest.mockResolvedValue(block());
    renderPage();
    expect(await screen.findByText('Bloco de força concluído')).toBeInTheDocument();
    expect(screen.getByText('8 de 12 sessões em 3 semanas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Começar bloco de/ })).toBeInTheDocument();
  });

  it('bloco interrompido: oferece recomeçar igual', async () => {
    api.latest.mockResolvedValue(block({ status: 'abandoned', planId: 'p1' }));
    api.create.mockResolvedValue(block({ status: 'active' }));
    renderPage();
    expect(await screen.findByText('Bloco de força interrompido')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Recomeçar' }));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({ kind: 'strength', weeks: 3, planId: 'p1' }),
    );
  });
});

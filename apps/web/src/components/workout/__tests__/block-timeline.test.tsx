import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TrainingBlock, TrainingBlockWeek } from '@fatia/api-client';
import { BlockTimeline } from '../block-timeline';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      ...actual.workoutApi,
      getActiveBlock: vi.fn(),
      createBlock: vi.fn(),
      deleteBlock: vi.fn(),
      listPlans: vi.fn(),
    },
  };
});

import { workoutApi } from '@fatia/api-client';

const getActiveBlock = vi.mocked(workoutApi.getActiveBlock);
const createBlock = vi.mocked(workoutApi.createBlock);
const deleteBlock = vi.mocked(workoutApi.deleteBlock);
const listPlans = vi.mocked(workoutApi.listPlans);

beforeEach(() => {
  vi.clearAllMocks();
  listPlans.mockResolvedValue([]);
});

function semana(partial: Partial<TrainingBlockWeek> & { weekNumber: number }): TrainingBlockWeek {
  return {
    focus: 'accumulation',
    intensityFactor: 1,
    volumeFactor: 1,
    weekStart: '2026-01-05',
    effectiveWeekStart: '2026-01-05',
    effectiveWeekEnd: '2026-01-11',
    sessionsTarget: 3,
    sessionsDone: 0,
    shiftedWeeks: 0,
    state: 'upcoming',
    ...partial,
  };
}

function bloco(partial: Partial<TrainingBlock> = {}): TrainingBlock {
  const weeks = [
    semana({ weekNumber: 1, state: 'done', sessionsDone: 3 }),
    semana({ weekNumber: 2, state: 'current', sessionsDone: 1, intensityFactor: 1.025 }),
    semana({ weekNumber: 3, focus: 'peak' }),
    semana({ weekNumber: 4, focus: 'deload' }),
  ];
  return {
    id: 'bloco-1',
    planId: null,
    planName: null,
    kind: 'hypertrophy',
    kindLabel: 'hipertrofia',
    repRange: '8-12',
    startDate: '2026-01-05',
    weeksTotal: 4,
    status: 'active',
    currentWeek: { ...weeks[1], summary: 'Semana 2 de 4 — acúmulo: carga +2,5%, volume +20%.' },
    nextWeek: { ...weeks[2], summary: 'Semana 3 de 4 — pico: carga +5%, volume normal.' },
    weeks,
    deload: { suggested: false, reason: 'insufficient_history' },
    explanation: 'Semana 2 de 4 — acúmulo: carga +2,5%, volume +20%.',
    ...partial,
  };
}

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderTimeline() {
  return render(
    <QueryClientProvider client={client()}>
      <BlockTimeline />
    </QueryClientProvider>,
  );
}

describe('BlockTimeline', () => {
  it('mostra onde o usuário está e o que vem depois', async () => {
    getActiveBlock.mockResolvedValue(bloco());

    renderTimeline();

    expect(
      await screen.findByText('Semana 2 de 4 — acúmulo: carga +2,5%, volume +20%.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Depois: Semana 3 de 4 — pico: carga +5%, volume normal.'),
    ).toBeInTheDocument();
  });

  it('mostra o progresso de cada semana sem confundir uma com a outra', async () => {
    getActiveBlock.mockResolvedValue(bloco());

    renderTimeline();

    const s1 = within(await screen.findByTestId('bloco-semana-1'));
    const s2 = within(screen.getByTestId('bloco-semana-2'));
    // Asserção dentro da semana, e não `getByText('1/3')` na tela inteira: com
    // quatro semanas iguais na página, um texto solto casaria com qualquer uma.
    expect(s1.getByText('3/3')).toBeInTheDocument();
    expect(s2.getByText('1/3')).toBeInTheDocument();
    expect(s2.getByText('S2 · Acúmulo')).toBeInTheDocument();
    expect(screen.getByTestId('bloco-semana-4').textContent).toContain('Deload');
  });

  it('diz que o bloco esperou quando uma semana foi perdida', async () => {
    getActiveBlock.mockResolvedValue(
      bloco({
        explanation:
          'Semana 1 de 4 — acúmulo: carga da sua prescrição, volume normal. Você perdeu uma semana e o bloco esperou: esta continua sendo a semana 1.',
      }),
    );

    renderTimeline();

    expect(await screen.findByText(/o bloco esperou/)).toBeInTheDocument();
  });

  it('oferece montar o bloco quando não há nenhum ativo', async () => {
    getActiveBlock.mockResolvedValue(null);
    createBlock.mockResolvedValue(bloco());

    renderTimeline();

    const botao = await screen.findByRole('button', { name: /MONTAR BLOCO/ });
    await userEvent.click(botao);

    await waitFor(() => expect(createBlock).toHaveBeenCalledWith({ planId: undefined }));
  });

  it('periodiza o plano escolhido na tela, e não só pelo MCP', async () => {
    // Sem escolher o plano aqui, todo bloco montado pela tela nascia com
    // `planId: null` — e o `plannedToday` do dashboard nunca saía de nulo para
    // quem usa o app.
    getActiveBlock.mockResolvedValue(null);
    listPlans.mockResolvedValue([
      { id: 'plan-1', userId: 'u1', name: 'Push', exercises: [] },
      { id: 'plan-2', userId: 'u1', name: 'Pull', exercises: [] },
    ]);
    createBlock.mockResolvedValue(bloco());

    renderTimeline();

    const select = await screen.findByLabelText(/Plano do bloco/);
    await userEvent.selectOptions(select, 'plan-2');
    await userEvent.click(screen.getByRole('button', { name: /MONTAR BLOCO/ }));

    await waitFor(() => expect(createBlock).toHaveBeenCalledWith({ planId: 'plan-2' }));
  });

  it('não encerra o bloco no primeiro clique', async () => {
    // `delete_training_block` é `destructiveHint`, e aqui não há desfazer: o
    // combinado das 4 semanas some.
    getActiveBlock.mockResolvedValue(bloco());

    renderTimeline();

    await userEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));
    expect(deleteBlock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(deleteBlock).toHaveBeenCalledWith('bloco-1'));
  });

  it('desiste de encerrar quando o usuário mantém o bloco', async () => {
    getActiveBlock.mockResolvedValue(bloco());

    renderTimeline();

    await userEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Manter' }));

    expect(screen.getByRole('button', { name: 'Encerrar' })).toBeInTheDocument();
    expect(deleteBlock).not.toHaveBeenCalled();
  });
});

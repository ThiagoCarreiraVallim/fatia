import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoalsScreen } from '../goals-screen';
import { NewGoalSheet } from '../new-goal-sheet';

/** Metas (Al-G9) e Nova meta (Al-G10), #382. */

const goalsApi = vi.hoisted(() => ({
  list: vi.fn(),
  complete: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, goalsApi };
});

function goal(id: string, title: string, status: string, extra = {}) {
  return {
    id,
    userId: 'u',
    kind: 'custom',
    title,
    description: null,
    startValue: 0,
    targetValue: 4,
    unit: 'vezes',
    lastReportedValue: 1,
    deadline: null,
    status,
    createdAt: '2026-10-01T12:00:00.000Z',
    completedAt: status === 'completed' ? '2026-10-12T15:00:00.000Z' : null,
    currentValue: 1,
    progressPercent: 25,
    ...extra,
  };
}

const GOALS = [
  goal('g1', 'Ler 4 livros', 'active'),
  goal('g2', 'Correr 10 km', 'expired', { deadline: '2026-10-31T23:59:59.000-03:00' }),
  goal('g3', 'Chegar a 22%', 'completed'),
  goal('g4', 'Meditar', 'archived'),
];

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => vi.clearAllMocks());

describe('Metas (Al-G9)', () => {
  it('a vencida fica nas ativas com o selo, e cada aba mostra as suas', async () => {
    goalsApi.list.mockResolvedValue(GOALS);
    const user = userEvent.setup();
    wrap(<GoalsScreen />);

    const ativas = await screen.findByRole('list', { name: 'Metas' });
    expect(within(ativas).getByText('Ler 4 livros')).toBeInTheDocument();
    expect(within(ativas).getByText('Correr 10 km')).toBeInTheDocument();
    expect(within(ativas).getByText('prazo passou')).toBeInTheDocument();
    expect(within(ativas).queryByText('Chegar a 22%')).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Concluídas' }));
    expect(screen.getByText('Chegar a 22%')).toBeInTheDocument();
    expect(screen.queryByText('Ler 4 livros')).toBeNull();
  });

  it('arquivar pergunta antes e só então muda o status', async () => {
    goalsApi.list.mockResolvedValue(GOALS);
    goalsApi.update.mockResolvedValue(GOALS[0]);
    const user = userEvent.setup();
    wrap(<GoalsScreen />);

    await user.click(await screen.findByRole('button', { name: 'Arquivar Ler 4 livros' }));
    expect(goalsApi.update).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Arquivar' }));

    expect(goalsApi.update).toHaveBeenCalledWith('g1', { status: 'archived' });
  });

  it('concluir pergunta antes', async () => {
    goalsApi.list.mockResolvedValue(GOALS);
    goalsApi.complete.mockResolvedValue(GOALS[0]);
    const user = userEvent.setup();
    wrap(<GoalsScreen />);

    await user.click(await screen.findByRole('button', { name: 'Concluir Ler 4 livros' }));
    expect(goalsApi.complete).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Concluir' }));

    expect(goalsApi.complete).toHaveBeenCalledWith('g1');
  });

  it('meta vencida ganha novo prazo no fim do dia escolhido', async () => {
    goalsApi.list.mockResolvedValue(GOALS);
    goalsApi.update.mockResolvedValue(GOALS[1]);
    const user = userEvent.setup();
    wrap(<GoalsScreen />);

    await user.click(await screen.findByRole('button', { name: 'Novo prazo para Correr 10 km' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Novo prazo'), {
      target: { value: '2099-12-20' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar prazo' }));

    const [id, body] = goalsApi.update.mock.calls[0];
    expect(id).toBe('g2');
    const deadline = new Date(body.deadline);
    expect([
      deadline.getFullYear(),
      deadline.getMonth(),
      deadline.getDate(),
      deadline.getHours(),
    ]).toEqual([2099, 11, 20, 23]);
  });

  it('meta marcada à mão ganha "Atualizar" com o valor de agora', async () => {
    goalsApi.list.mockResolvedValue(GOALS);
    goalsApi.update.mockResolvedValue(GOALS[0]);
    const user = userEvent.setup();
    wrap(<GoalsScreen />);

    await user.click(await screen.findByRole('button', { name: 'Atualizar Ler 4 livros' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Valor de agora'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(goalsApi.update).toHaveBeenCalledWith('g1', { lastReportedValue: 2 });
  });

  it('arquivada pode ser apagada, com confirmação', async () => {
    goalsApi.list.mockResolvedValue(GOALS);
    goalsApi.delete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    wrap(<GoalsScreen />);

    await user.click(await screen.findByRole('radio', { name: 'Arquivadas' }));
    await user.click(screen.getByRole('button', { name: 'Apagar Meditar' }));
    expect(goalsApi.delete).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar' }));

    expect(goalsApi.delete).toHaveBeenCalledWith('g4');
  });

  it('a falha ao carregar não se passa por "nada aqui"', async () => {
    goalsApi.list.mockRejectedValue(new Error('500'));
    wrap(<GoalsScreen />);

    expect(await screen.findByRole('button', { name: /Tentar/ })).toBeInTheDocument();
    expect(screen.queryByText('Nada aqui')).toBeNull();
  });
});

describe('Nova meta (Al-G10)', () => {
  it('passos por dia: alvo de 10 mil, título sugerido e unidade certa', async () => {
    goalsApi.create.mockResolvedValue(GOALS[0]);
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    wrap(<NewGoalSheet open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'Passos/dia' }));
    expect(screen.getByText('Atualiza sozinha a cada registro.')).toBeInTheDocument();
    expect(screen.getByLabelText('Alvo')).toHaveValue(10000);
    await user.click(screen.getByRole('button', { name: 'Criar meta' }));

    expect(goalsApi.create).toHaveBeenCalledWith({
      kind: 'step_count',
      title: '10 mil passos por dia',
      targetValue: 10000,
      unit: 'passos',
    });
  });

  it('o alvo continua digitável', async () => {
    goalsApi.create.mockResolvedValue(GOALS[0]);
    const user = userEvent.setup();
    wrap(<NewGoalSheet open onOpenChange={vi.fn()} />);

    await user.clear(screen.getByLabelText('Alvo'));
    await user.type(screen.getByLabelText('Alvo'), '68');
    await user.type(screen.getByLabelText('Título'), 'Chegar a 68 kg');
    await user.click(screen.getByRole('button', { name: 'Criar meta' }));

    expect(goalsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'weight',
        title: 'Chegar a 68 kg',
        targetValue: 68,
        unit: 'kg',
      }),
    );
  });
});

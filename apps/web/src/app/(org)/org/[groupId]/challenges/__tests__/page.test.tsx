import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Challenge, MyGroup, ReviewItem } from '@fatia/api-client';
import { challenge, detail, reviewItem } from '@/components/challenges/__tests__/fixtures';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null, toast: vi.fn() }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: ctx.toast }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    challengesApi: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      end: vi.fn(),
      remove: vi.fn(),
      reviewQueue: vi.fn(),
      resolve: vi.fn(),
    },
  };
});

import { challengesApi } from '@fatia/api-client';
import OrgChallengesPage from '../page';

const c = (p: Partial<Challenge>): Challenge => challenge({ canManage: true, ...p });

function open(challenges: Challenge[] = [], queue: ReviewItem[] = []) {
  ctx.group = grupo({ role: 'OWNER' });
  vi.mocked(challengesApi.list).mockResolvedValue({ today: '2026-10-18', challenges });
  vi.mocked(challengesApi.create).mockResolvedValue(detail());
  vi.mocked(challengesApi.reviewQueue).mockResolvedValue({
    items: queue,
    open: queue.length,
    limit: 50,
    nextCursor: null,
  });
  return renderWithClient(<OrgChallengesPage />);
}

async function fillBasics(title: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Novo desafio' }));
  await userEvent.type(screen.getByLabelText('Título'), title);
  await userEvent.type(screen.getByLabelText('Termina em'), '2026-10-24');
}

describe('painel › desafios (Pn-13)', () => {
  afterEach(() => vi.clearAllMocks());

  it('dias ativos: manda o tipo, a métrica, as datas e o título digitados', async () => {
    open();
    await fillBasics('  Outubro ativo ');
    await userEvent.click(screen.getByRole('radio', { name: /Dias ativos/ }));
    expect(screen.getByLabelText('Começa em')).toHaveValue('2026-10-18');
    expect(screen.getByRole('list', { name: 'Contra trapaça' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Quem vê o quê' })).toHaveTextContent(
      'nunca fotos nem números',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Agendar desafio' }));

    await waitFor(() =>
      expect(challengesApi.create).toHaveBeenCalledWith('g1', {
        title: 'Outubro ativo',
        description: null,
        kind: 'METRIC',
        metric: 'ACTIVE_DAYS',
        startDate: '2026-10-18',
        endDate: '2026-10-24',
      }),
    );
  });

  it('pontos: a tabela com − e +, o máximo do dia somado e editável', async () => {
    open();
    await fillBasics('Verão em pontos');
    await userEvent.click(screen.getByRole('radio', { name: /Pontos \(misto\)/ }));
    // Padrão da prancha: treino 3, água 1, passos 1, proteína 1, calorias 0.
    expect(screen.getByText(/máximo por dia: 6 pts/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mais Treino com check-in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mais Treino com check-in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mais Treino com check-in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Menos Proteína na meta' }));
    expect(screen.getByText(/máximo por dia: 7 pts/)).toBeInTheDocument();
    expect(screen.getByLabelText('Máximo de pontos por dia')).toHaveValue(7);
    // O teto não passa de 5 por item.
    expect(screen.getByRole('button', { name: 'Mais Treino com check-in' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Agendar desafio' }));
    await waitFor(() =>
      expect(challengesApi.create).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({
          kind: 'POINTS',
          pointsTable: { workout: 5, water: 1, steps: 1 },
          maxPointsPerDay: 7,
        }),
      ),
    );
  });

  it('passos: as fontes escolhidas vão sem "Digitado à mão", que fica travado', async () => {
    open();
    await fillBasics('10 mil passos');
    await userEvent.click(screen.getByRole('radio', { name: /^Passos/ }));
    expect(screen.getByRole('button', { name: /Digitado à mão/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Strava' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agendar desafio' }));

    await waitFor(() => expect(challengesApi.create).toHaveBeenCalled());
    const input = vi.mocked(challengesApi.create).mock.calls[0][1];
    expect(input).toMatchObject({ kind: 'STEPS', stepsGoal: 10000 });
    expect(input.allowedStepSources).not.toContain('MANUAL');
    expect(input.allowedStepSources).not.toContain('STRAVA');
    expect(input.allowedStepSources).toContain('GARMIN');
  });

  it('água: meta e teto em litros viram ml', async () => {
    open();
    await fillBasics('Dezembro hidratado');
    await userEvent.click(screen.getByRole('radio', { name: /^Água/ }));
    const meta = screen.getByLabelText('Meta de água por dia (L)');
    await userEvent.clear(meta);
    await userEvent.type(meta, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Agendar desafio' }));

    await waitFor(() =>
      expect(challengesApi.create).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({ kind: 'WATER', waterGoalMl: 3000, dailyCap: 4000 }),
      ),
    );
  });

  it('nutrição: escolhe entre proteína e faixa de calorias', async () => {
    open();
    await fillBasics('Proteína em dia');
    await userEvent.click(screen.getByRole('radio', { name: /^Nutrição/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'Dias na faixa de calorias' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agendar desafio' }));

    await waitFor(() =>
      expect(challengesApi.create).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({ kind: 'NUTRITION', metric: 'KCAL_IN_RANGE_DAYS' }),
      ),
    );
  });

  it('fim antes do começo não sai da tela', async () => {
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Novo desafio' }));
    await userEvent.type(screen.getByLabelText('Título'), 'Passos');
    await userEvent.clear(screen.getByLabelText('Começa em'));
    await userEvent.type(screen.getByLabelText('Começa em'), '2026-10-20');
    await userEvent.type(screen.getByLabelText('Termina em'), '2026-10-19');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'O fim tem de ser no dia do início ou depois.',
    );
    expect(screen.getByRole('button', { name: 'Agendar desafio' })).toBeDisabled();
  });

  it('em andamento só encerra; marcado edita e apaga; de outra pessoa, nada', async () => {
    open([
      c({ id: 'r', title: 'Rodando' }),
      c({ id: 'u', title: 'Marcado', status: 'upcoming', startDate: '2026-10-20' }),
      c({ id: 'o', title: 'Do colega', canManage: false }),
    ]);
    const item = async (title: string) =>
      within((await screen.findByText(title)).closest('li') as HTMLElement);

    const running = await item('Rodando');
    expect(running.getByRole('button', { name: 'Encerrar agora' })).toBeInTheDocument();
    expect(running.queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument();
    const upcoming = await item('Marcado');
    expect(upcoming.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(upcoming.getByRole('button', { name: 'Apagar' })).toBeInTheDocument();
    expect((await item('Do colega')).queryAllByRole('button')).toHaveLength(0);

    await userEvent.click(running.getByRole('button', { name: 'Encerrar agora' }));
    vi.mocked(challengesApi.end).mockResolvedValue(detail({ status: 'ended' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Encerrar' }),
    );
    await waitFor(() => expect(challengesApi.end).toHaveBeenCalledWith('g1', 'r'));
  });

  it('sem permissão de revisar, a fila não aparece', async () => {
    open([c({ canReview: false })]);
    await screen.findByText('Outubro ativo');
    expect(screen.queryByRole('heading', { name: 'Para revisar' })).not.toBeInTheDocument();
    expect(challengesApi.reviewQueue).not.toHaveBeenCalled();
  });

  it('fila "Para revisar" paginada: "Ver mais" busca a próxima página (#395 M5)', async () => {
    open([c({ canReview: true })]);
    vi.mocked(challengesApi.reviewQueue)
      .mockReset()
      .mockResolvedValueOnce({
        items: [reviewItem({ id: 'k1', displayName: 'Marina N.' })],
        open: 2,
        limit: 50,
        nextCursor: 'k1',
      })
      .mockResolvedValueOnce({
        items: [reviewItem({ id: 'k2', displayName: 'Lia P.' })],
        open: 2,
        limit: 50,
        nextCursor: null,
      });
    const fila = within(
      (await screen.findByRole('heading', { name: 'Para revisar' })).closest(
        'section',
      ) as HTMLElement,
    );
    expect(await fila.findByText(/Marina N\./)).toBeInTheDocument();
    await userEvent.click(fila.getByRole('button', { name: 'Ver mais' }));
    expect(await fila.findByText(/Lia P\./)).toBeInTheDocument();
    expect(challengesApi.reviewQueue).toHaveBeenLastCalledWith('g1', undefined, 'k1');
    expect(fila.queryByRole('button', { name: 'Ver mais' })).not.toBeInTheDocument();
  });

  it('fila "Para revisar": vale direto; anular exige um motivo de 3 a 280 letras', async () => {
    open(
      [c({ canReview: true })],
      [
        reviewItem({ id: 'k1', displayName: 'Marina N.' }),
        reviewItem({
          id: 'k2',
          displayName: 'Lia P.',
          type: 'water',
          challengeKind: 'WATER',
          photoUrl: null,
          source: 'system',
          flags: 0,
          why: '2,5 L de uma vez',
        }),
      ],
    );
    vi.mocked(challengesApi.resolve).mockResolvedValue({ id: 'k1', status: 'valid' });

    const fila = within(
      (await screen.findByRole('heading', { name: 'Para revisar' })).closest(
        'section',
      ) as HTMLElement,
    );
    expect(await fila.findByText('2 para decidir')).toBeInTheDocument();
    expect(fila.getByText(/Só ela e a equipe veem esta fila/)).toBeInTheDocument();
    const marina = within((await fila.findByText(/Marina N\./)).closest('li') as HTMLElement);
    expect(marina.getByRole('img')).toHaveAttribute('src', 'https://cdn.test/prova.jpg');
    expect(marina.getByText(/sinalizado por 2 participantes/)).toBeInTheDocument();
    const lia = within(fila.getByText(/Lia P\./).closest('li') as HTMLElement);
    expect(lia.queryByRole('img')).not.toBeInTheDocument();

    await userEvent.click(marina.getByRole('button', { name: 'Vale' }));
    await waitFor(() =>
      expect(challengesApi.resolve).toHaveBeenCalledWith('g1', 'c1', 'k1', { decision: 'valid' }),
    );

    vi.mocked(challengesApi.resolve).mockResolvedValue({ id: 'k2', status: 'voided' });
    await userEvent.click(lia.getByRole('button', { name: 'Anular' }));
    const motivo = lia.getByLabelText(/Motivo/);
    const confirmar = lia.getByRole('button', { name: 'Anular com motivo' });
    expect(confirmar).toBeDisabled();
    await userEvent.type(motivo, 'ok');
    expect(confirmar).toBeDisabled();
    await userEvent.type(motivo, ' — registro de uma vez');
    await userEvent.click(confirmar);
    await waitFor(() =>
      expect(challengesApi.resolve).toHaveBeenCalledWith('g1', 'c1', 'k2', {
        decision: 'void',
        reason: 'ok — registro de uma vez',
      }),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, type WorkoutSessionSummary } from '@fatia/api-client';
import SessionDetailPage from '../page';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sessao-1' }),
  useRouter: () => ({ push, replace }),
}));
vi.mock('@/components/workout/muscle-diagram', () => ({
  MuscleDiagram: ({ primaryMuscles }: { primaryMuscles: string[] }) => (
    <div role="img" aria-label={`Músculos: ${primaryMuscles.join(', ')}`} />
  ),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      ...actual.workoutApi,
      getSessionSummary: vi.fn(),
      updateSession: vi.fn(),
      saveCheckin: vi.fn(),
    },
    usersApi: { ...actual.usersApi, me: vi.fn() },
  };
});

import { usersApi, workoutApi } from '@fatia/api-client';
const me = vi.mocked(usersApi.me);

const getSessionSummary = vi.mocked(workoutApi.getSessionSummary);
const updateSession = vi.mocked(workoutApi.updateSession);
const saveCheckin = vi.mocked(workoutApi.saveCheckin);

function summary(over: Partial<WorkoutSessionSummary> = {}): WorkoutSessionSummary {
  return {
    sessionId: 'sessao-1',
    planId: 'p1',
    planName: 'Push',
    startedAt: '2026-11-14T21:02:00Z',
    completedAt: '2026-11-14T21:54:00Z',
    durationMinutes: 52,
    sets: 19,
    volumeKg: 6230,
    feeling: null,
    notes: null,
    overallFeeling: 2,
    comparison: {
      sessionId: 'antes',
      startedAt: '2026-11-10T21:00:00Z',
      volumeDeltaPct: 6,
      setsDelta: 1,
      durationDeltaMinutes: -3,
    },
    records: [
      {
        exerciseId: 1,
        exerciseName: 'Supino reto',
        weightKg: 52.5,
        reps: 10,
        distanceMeters: null,
        durationSeconds: null,
      },
    ],
    muscles: {
      groups: [
        { group: 'peito', sets: 10 },
        { group: 'ombro', sets: 6 },
      ],
      primary: ['chest'],
      secondary: ['triceps'],
    },
    exercises: [
      {
        exerciseId: 1,
        exerciseName: 'Supino reto',
        muscleGroup: 'peito',
        isCardio: false,
        sets: 4,
        best: {
          weightKg: 52.5,
          reps: 10,
          distanceMeters: null,
          durationSeconds: null,
          avgHeartRate: null,
        },
        feeling: 3,
        isRecord: true,
      },
    ],
    checkin: null,
    questions: null,
    ...over,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionDetailPage />
    </QueryClientProvider>,
  );
}

describe('Treino feito! (#377)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falha de rede não vira "sessão não encontrada", e dá para tentar de novo', async () => {
    getSessionSummary.mockRejectedValueOnce(new Error('sem conexão'));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o treino',
    );
    expect(screen.queryByText(/não encontrada/)).toBeNull();

    getSessionSummary.mockRejectedValueOnce(new ApiError('nada', 404, {}));
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(await screen.findByText('Sessão não encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para treinos' })).toHaveAttribute(
      'href',
      '/workout',
    );
  });

  it('números, comparação, recordes, músculos e a lista com a melhor série', async () => {
    getSessionSummary.mockResolvedValue(summary());
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Treino feito!' })).toBeInTheDocument();
    expect(screen.getByText('52′')).toBeInTheDocument();
    expect(screen.getByText('6,2 t')).toBeInTheDocument();

    const comparison = screen.getByRole('region', { name: 'Comparado ao último Push' });
    expect(within(comparison).getByText('+6% ▲')).toBeInTheDocument();
    expect(within(comparison).getByText('−3 min')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: '1 recorde novo' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Músculos: chest' })).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Exercícios do treino' });
    // Como na prancha Al-T5: "4 séries · melhor 52,5 × 10" embaixo do nome.
    expect(within(list).getByText(/· melhor 52,5 × 10$/)).toBeInTheDocument();
    expect(within(list).getByLabelText('Recorde')).toBeInTheDocument();
  });

  it('"Como foi o treino?": rosto, atalho na observação e Salvar volta ao Treino', async () => {
    getSessionSummary.mockResolvedValue(summary());
    updateSession.mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderPage();

    const feelings = await screen.findByRole('radiogroup', { name: 'Como foi o treino?' });
    await user.click(within(feelings).getByRole('radio', { name: /^Puxado/ }));
    const note = screen.getByPlaceholderText('Algo para lembrar no próximo? (opcional)');
    await user.click(screen.getByRole('button', { name: 'Dor no joelho' }));
    expect(note).toHaveValue('dor no joelho');
    expect(screen.queryByRole('button', { name: 'Dor no joelho' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(updateSession).toHaveBeenCalledWith('sessao-1', {
        feeling: 3,
        notes: 'dor no joelho',
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout'));
  });

  it('as perguntas da equipe: cansaço, dor com local, e quem vê', async () => {
    getSessionSummary.mockResolvedValue(
      summary({
        questions: {
          askedBy: ['Helena Prado'],
          items: [
            {
              key: 'fatigue',
              kind: 'scale',
              label: 'Cansaço depois do treino',
              scaleLabels: ['leve', 'no limite'],
            },
            { key: 'pain', kind: 'yes_no', label: 'Sentiu dor ou desconforto?' },
          ],
        },
      }),
    );
    saveCheckin.mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderPage();

    const card = await screen.findByRole('region', { name: 'Perguntas da Helena' });
    expect(within(card).getByText('Só a Helena vê as respostas')).toBeInTheDocument();
    await user.click(
      within(within(card).getByRole('radiogroup', { name: 'Cansaço depois do treino' })).getByRole(
        'radio',
        { name: '4' },
      ),
    );
    await user.click(within(card).getByRole('radio', { name: 'Sim' }));
    await user.type(within(card).getByRole('textbox', { name: 'Onde doeu?' }), 'joelho');
    await user.click(within(card).getByRole('button', { name: 'Enviar' }));

    await waitFor(() =>
      expect(saveCheckin).toHaveBeenCalledWith('sessao-1', {
        fatigue: 4,
        pain: true,
        painLocation: 'joelho',
      }),
    );
    expect(await screen.findByText('Respostas enviadas para a Helena')).toBeInTheDocument();
  });

  it('pular as perguntas avisa que a equipe vê só que pulou', async () => {
    getSessionSummary.mockResolvedValue(
      summary({
        questions: {
          askedBy: ['Helena Prado'],
          items: [{ key: 'pain', kind: 'yes_no', label: 'Sentiu dor ou desconforto?' }],
        },
      }),
    );
    saveCheckin.mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderPage();

    const card = await screen.findByRole('region', { name: 'Perguntas da Helena' });
    await user.click(within(card).getByRole('button', { name: 'Pular' }));
    await waitFor(() => expect(saveCheckin).toHaveBeenCalledWith('sessao-1', { skipped: true }));
    expect(
      await screen.findByText('Perguntas puladas · a Helena vê só que você pulou'),
    ).toBeInTheDocument();
  });

  it('respondidas antes, as perguntas não voltam', async () => {
    getSessionSummary.mockResolvedValue(
      summary({
        questions: { askedBy: ['Helena Prado'], items: [] },
        checkin: {
          id: 'c',
          skipped: false,
          difficulty: null,
          fatigue: 3,
          pain: false,
          painLocation: null,
          motivation: null,
          note: null,
          answeredAt: '',
          updatedAt: '',
        },
      }),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Treino feito!' });
    expect(screen.queryByRole('region', { name: 'Perguntas da Helena' })).toBeNull();
  });

  it('as respostas enviadas ficam com o aviso, mesmo depois do resumo recarregar', async () => {
    const questions = {
      askedBy: ['Helena Prado'],
      items: [
        { key: 'pain' as const, kind: 'yes_no' as const, label: 'Sentiu dor ou desconforto?' },
      ],
    };
    getSessionSummary.mockResolvedValueOnce(summary({ questions }));
    getSessionSummary.mockResolvedValue(
      summary({
        questions,
        checkin: {
          id: 'c',
          skipped: true,
          difficulty: null,
          fatigue: null,
          pain: null,
          painLocation: null,
          motivation: null,
          note: null,
          answeredAt: '',
          updatedAt: '',
        },
      }),
    );
    saveCheckin.mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderPage();

    const card = await screen.findByRole('region', { name: 'Perguntas da Helena' });
    await user.click(within(card).getByRole('button', { name: 'Pular' }));
    await waitFor(() => expect(getSessionSummary).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText('Perguntas puladas · a Helena vê só que você pulou'),
    ).toBeInTheDocument();
  });

  it('sessão ainda aberta não é "Treino feito!": volta ao treino em andamento', async () => {
    getSessionSummary.mockResolvedValue(
      summary({
        completedAt: null,
        questions: { askedBy: ['Helena Prado'], items: [] },
      }),
    );
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/workout'));
    expect(screen.queryByRole('heading', { name: 'Treino feito!' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Perguntas da Helena' })).toBeNull();
  });

  it('desmarcar a sensação apaga a sensação gravada', async () => {
    getSessionSummary.mockResolvedValue(summary({ feeling: 3 }));
    updateSession.mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderPage();

    const feelings = await screen.findByRole('radiogroup', { name: 'Como foi o treino?' });
    await user.click(within(feelings).getByRole('radio', { name: /^Puxado/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(updateSession).toHaveBeenCalledWith('sessao-1', { feeling: null }));
  });

  it('em libras, recordes, melhor série e volume saem em lb', async () => {
    me.mockResolvedValue({ loadUnit: 'LB', distanceUnit: 'KM' } as never);
    getSessionSummary.mockResolvedValue(summary({ volumeKg: 400 }));
    renderPage();

    const records = await screen.findByRole('region', { name: /recorde/i });
    expect(await within(records).findByText('115,7 × 10')).toBeInTheDocument();
    expect(await screen.findByText('882 lb')).toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@fatia/api-client';
import { activity, challenge, detail, me, rules } from '@/components/challenges/__tests__/fixtures';

const ctx = vi.hoisted(() => ({
  params: { groupId: 'g1', challengeId: 'c1' } as Record<string, string>,
  toast: vi.fn(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ctx.params,
  usePathname: () => '/community/g1/challenges',
}));
vi.mock('sonner', () => ({ toast: ctx.toast }));
vi.mock('@/components/layout/app-top-bar', () => ({ useTopBarTitle: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    challengesApi: {
      list: vi.fn(),
      get: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      watch: vi.fn(),
      flag: vi.fn(),
    },
  };
});

import { challengesApi } from '@fatia/api-client';
import CommunityChallengesPage from '../page';
import CommunityChallengePage from '../[challengeId]/page';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const section = async (name: string) =>
  within((await screen.findByRole('heading', { name })).closest('section') as HTMLElement);

describe('desafios › lista (Cm-08)', () => {
  afterEach(() => vi.clearAllMocks());

  it('separa em participa, para olhar, próximo e encerrados, com dias, sequência e posição', async () => {
    vi.mocked(challengesApi.list).mockResolvedValue({
      today: '2026-10-15',
      challenges: [
        challenge({
          id: 'm',
          title: '30 dias de treino',
          kind: 'PHOTO',
          metric: 'WORKOUT_SESSIONS',
          totalDays: 30,
          participants: 46,
          me: me({ score: 12, rank: 5, streak: 4 }),
        }),
        challenge({ id: 'b', title: 'Novembro hidratado', kind: 'WATER', metric: 'WATER_ML' }),
        challenge({
          id: 'u',
          title: '10 mil passos',
          kind: 'STEPS',
          metric: 'STEPS',
          status: 'upcoming',
        }),
        challenge({ id: 'e', title: 'Maratona', status: 'ended', me: me({ rank: 3 }) }),
      ],
    });
    renderWithClient(<CommunityChallengesPage />);

    expect(await screen.findByText(/Peso e medidas nunca contam/)).toBeInTheDocument();
    const mine = await section('Você participa');
    expect(mine.getByText('30 dias de treino')).toBeInTheDocument();
    expect(mine.getByText('12 de 30 dias')).toBeInTheDocument();
    expect(mine.getByText('4 seguidos')).toBeInTheDocument();
    expect(mine.getByText('5º')).toBeInTheDocument();
    expect(mine.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect((await section('Para olhar')).getByText('Novembro hidratado')).toBeInTheDocument();
    expect((await section('Próximo')).getByText('10 mil passos')).toBeInTheDocument();
    expect((await section('Encerrados')).getByText('Maratona')).toBeInTheDocument();
  });

  it('"Me avise quando começar" liga o aviso do desafio marcado', async () => {
    vi.mocked(challengesApi.list).mockResolvedValue({
      today: '2026-10-15',
      challenges: [challenge({ id: 'u', title: 'Dezembro', status: 'upcoming' })],
    });
    vi.mocked(challengesApi.watch).mockResolvedValue({ watching: true });
    renderWithClient(<CommunityChallengesPage />);

    await userEvent.click(await screen.findByRole('switch', { name: 'Me avise quando começar' }));
    await waitFor(() => expect(challengesApi.watch).toHaveBeenCalledWith('g1', 'u', true));
  });
});

describe('desafios › um desafio (Cm-17, Cm-09, Cm-10, Cm-11)', () => {
  afterEach(() => vi.clearAllMocks());

  it('visitante vê ranking e regras, sem atividade, e o convite para participar', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      detail({
        kind: 'WATER',
        metric: 'WATER_ML',
        rules: rules({ waterGoalMl: 2500, dailyCap: 4000 }),
        leaderboard: [
          { displayName: 'Bia', score: 5, rank: 1, isMe: false, medal: null, streak: 3 },
        ],
        activity: [activity({ type: 'day', parts: ['water'], at: null })],
      }),
    );
    renderWithClient(<CommunityChallengePage />);

    expect(await screen.findByRole('list', { name: 'Ranking' })).toHaveTextContent('Bia');
    expect(screen.getByRole('tab', { name: 'Regras' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Atividade' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Participar do desafio' })).toBeInTheDocument();
  });

  it('participar entra com o nome do perfil, sem perguntar apelido', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(detail());
    vi.mocked(challengesApi.join).mockResolvedValue(detail({ me: me() }));
    renderWithClient(<CommunityChallengePage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Participar do desafio' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('No ranking: Ana');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Participar como Ana' }));

    await waitFor(() => expect(challengesApi.join).toHaveBeenCalledWith('g1', 'c1', undefined, {}));
    expect(ctx.toast).toHaveBeenCalledWith('Você entrou no desafio.');
  });

  it('água explica que os outros veem só os dias, nunca os ml', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      detail({ kind: 'WATER', metric: 'WATER_ML', rules: rules({ waterGoalMl: 2500 }) }),
    );
    renderWithClient(<CommunityChallengePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Participar do desafio' }));

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Os outros veem só os dias, nunca seus ml',
    );
  });

  it('desafio com foto exige o aceite antes de entrar e manda o aceite', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      detail({ kind: 'PHOTO', metric: 'WORKOUT_SESSIONS', needsPhotoConsent: true }),
    );
    vi.mocked(challengesApi.join).mockResolvedValue(
      detail({ kind: 'PHOTO', metric: 'WORKOUT_SESSIONS', me: me() }),
    );
    renderWithClient(<CommunityChallengePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Participar do desafio' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('A foto é prova');
    const enviar = within(dialog).getByRole('button', { name: /Participar como/ });
    expect(enviar).toBeDisabled();

    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Aceito/ }));
    expect(enviar).toBeEnabled();
    await userEvent.click(enviar);
    await waitFor(() =>
      expect(challengesApi.join).toHaveBeenCalledWith('g1', 'c1', 'Ana', {
        acceptPhotoTerms: true,
      }),
    );
  });

  it('atividade nunca mostra a foto dos outros; a própria aparece, com o motivo da revisão', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      detail({
        kind: 'PHOTO',
        metric: 'WORKOUT_SESSIONS',
        me: me(),
        activity: [
          // Mesmo que a API mandasse, a foto de outra pessoa não aparece.
          activity({ id: 'o', displayName: 'Bia', photoUrl: 'https://cdn.test/outra.jpg' }),
          activity({
            id: 'm',
            displayName: 'Ana',
            isMe: true,
            photoUrl: 'https://cdn.test/minha.jpg',
            status: 'review',
            reason: 'Treino lançado 3 h depois',
          }),
          activity({ id: 'r', displayName: 'Caio', status: 'review' }),
        ],
      }),
    );
    renderWithClient(<CommunityChallengePage />);

    const feed = await screen.findByRole('list', { name: 'Check-ins' });
    const imgs = within(feed).queryAllByRole('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('src', 'https://cdn.test/minha.jpg');
    expect(feed.innerHTML).not.toContain('outra.jpg');
    expect(within(feed).getAllByText('em revisão')).toHaveLength(2);
    expect(within(feed).getByText(/Treino lançado 3 h depois/)).toBeInTheDocument();
  });

  it('"Não parece válido" manda o check-in para a equipe', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      detail({
        kind: 'PHOTO',
        metric: 'WORKOUT_SESSIONS',
        me: me(),
        activity: [activity({ id: 'x', displayName: 'Bia', canFlag: true })],
      }),
    );
    vi.mocked(challengesApi.flag).mockResolvedValue({ flagged: true });
    renderWithClient(<CommunityChallengePage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Não parece válido' }));
    await waitFor(() => expect(challengesApi.flag).toHaveBeenCalledWith('g1', 'c1', 'x'));
    expect(ctx.toast).toHaveBeenCalledWith('Enviado para a equipe revisar');
    expect(await screen.findByText(/Você sinalizou/)).toBeInTheDocument();
  });

  it('sinalizar demais mostra o recado da API', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      detail({
        kind: 'PHOTO',
        metric: 'WORKOUT_SESSIONS',
        me: me(),
        activity: [activity({ id: 'x', canFlag: true })],
      }),
    );
    vi.mocked(challengesApi.flag).mockRejectedValue(
      new ApiError('Você já sinalizou 3 check-ins hoje.', 429),
    );
    renderWithClient(<CommunityChallengePage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Não parece válido' }));
    await waitFor(() =>
      expect(ctx.toast).toHaveBeenCalledWith('Você já sinalizou 3 check-ins hoje.'),
    );
  });

  it('foto: no navegador o check-in é só um recado para usar o app', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      detail({ kind: 'PHOTO', metric: 'WORKOUT_SESSIONS', me: me() }),
    );
    renderWithClient(<CommunityChallengePage />);

    expect(await screen.findByText(/Faça o check-in pelo app, com a câmera/)).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('água: o topo mostra o próprio valor de hoje', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      detail({
        kind: 'WATER',
        metric: 'WATER_ML',
        totalDays: 21,
        rules: rules({ waterGoalMl: 2500, dailyCap: 4000 }),
        me: me({ score: 8, rank: 4 }),
        today: {
          date: '2026-10-15',
          points: 0,
          maxPoints: 1,
          checkedInAt: null,
          items: [{ item: 'water', points: 1, done: false, value: 1800, goal: 2500 }],
        },
      }),
    );
    renderWithClient(<CommunityChallengePage />);

    expect(await screen.findByText('Hoje: 1,8 de 2,5 L')).toBeInTheDocument();
    expect(screen.getByText(/Quantos ml você registrou fica com você/)).toBeInTheDocument();
  });

  it('pontos: "Seus pontos de hoje" com cada item e o máximo do dia', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      detail({
        kind: 'POINTS',
        rules: rules({
          pointsTable: { workout: 3, water: 1, steps: 1, protein: 1 },
          maxPointsPerDay: 6,
        }),
        me: me({ score: 86 }),
        today: {
          date: '2026-10-15',
          points: 2,
          maxPoints: 6,
          checkedInAt: null,
          items: [
            { item: 'workout', points: 3, done: false, value: null, goal: null },
            { item: 'water', points: 1, done: true, value: 2600, goal: 2500 },
            { item: 'steps', points: 1, done: true, value: 10480, goal: 10000 },
            { item: 'protein', points: 1, done: false, value: null, goal: null },
          ],
        },
      }),
    );
    renderWithClient(<CommunityChallengePage />);

    const hoje = await section('Seus pontos de hoje');
    expect(hoje.getByText('2 de 6')).toBeInTheDocument();
    expect(hoje.getByText('Água na meta')).toBeInTheDocument();
    expect(hoje.getByText('Máximo de 6 pontos por dia.', { exact: false })).toBeInTheDocument();
  });

  it('encerrado: pódio, ranking final e o link para as conquistas', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      detail({
        status: 'ended',
        me: me({ score: 6, rank: 1, medal: 'gold' }),
        leaderboard: [
          { displayName: 'Ana', score: 6, rank: 1, isMe: true, medal: 'gold', streak: 0 },
          { displayName: 'Bia', score: 5, rank: 2, isMe: false, medal: 'silver', streak: 0 },
          { displayName: 'Caio', score: 4, rank: 3, isMe: false, medal: 'bronze', streak: 0 },
        ],
      }),
    );
    renderWithClient(<CommunityChallengePage />);

    expect(await screen.findByRole('list', { name: 'Pódio' })).toHaveTextContent('Bia');
    expect(screen.getByRole('list', { name: 'Ranking' })).toHaveTextContent('Ouro');
    expect(screen.getByRole('link', { name: /Ver nas conquistas/ })).toHaveAttribute(
      'href',
      '/progress/achievements',
    );
    expect(screen.queryByRole('button', { name: 'Sair do desafio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Participar/ })).not.toBeInTheDocument();
  });

  it('encerrado com revisão pendente avisa que o resultado sai depois', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      detail({ status: 'ended', resultPending: true, me: me() }),
    );
    renderWithClient(<CommunityChallengePage />);

    expect(await screen.findByText(/Resultado depois da revisão da equipe/)).toBeInTheDocument();
  });

  it('sair do desafio pede confirmação', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(detail({ me: me() }));
    vi.mocked(challengesApi.leave).mockResolvedValue({ left: true });
    renderWithClient(<CommunityChallengePage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Sair do desafio' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(challengesApi.leave).toHaveBeenCalledWith('g1', 'c1'));
  });
});

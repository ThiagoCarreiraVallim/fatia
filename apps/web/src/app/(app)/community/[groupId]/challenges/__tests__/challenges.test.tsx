import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Challenge, ChallengeDetail } from '@fatia/api-client';

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
vi.mock('next/navigation', () => ({ useParams: () => ctx.params }));
vi.mock('sonner', () => ({ toast: ctx.toast }));
vi.mock('@/components/layout/app-top-bar', () => ({ useTopBarTitle: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    challengesApi: { list: vi.fn(), get: vi.fn(), join: vi.fn(), leave: vi.fn() },
  };
});

import { challengesApi } from '@fatia/api-client';
import { CommunityChallengesPreview } from '@/components/challenges/community-challenges-preview';
import CommunityChallengePage from '../[challengeId]/page';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const desafio = (p: Partial<ChallengeDetail> = {}): ChallengeDetail => ({
  id: 'c1',
  title: 'Outubro ativo',
  description: null,
  metric: 'ACTIVE_DAYS',
  startDate: '2026-10-12',
  endDate: '2026-10-18',
  status: 'running',
  endedEarly: false,
  participants: 2,
  canManage: false,
  me: null,
  leaderboard: null,
  suggestedDisplayName: 'Ana',
  ...p,
});

const participando = desafio({
  me: { displayName: 'Ana', score: 3, rank: 2, medal: null },
  leaderboard: [
    { displayName: 'Bia', score: 5, rank: 1, isMe: false, medal: null },
    { displayName: 'Ana', score: 3, rank: 2, isMe: true, medal: null },
  ],
});

describe('desafio › membro', () => {
  afterEach(() => vi.clearAllMocks());

  it('quem não entrou não vê ranking; participar pede o apelido e manda o que foi digitado', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(desafio());
    vi.mocked(challengesApi.join).mockResolvedValue(participando);
    renderWithClient(<CommunityChallengePage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Participar' }));
    expect(screen.queryByRole('list', { name: 'Ranking' })).not.toBeInTheDocument();

    const apelido = screen.getByLabelText('Como aparecer no ranking');
    expect(apelido).toHaveValue('Ana');
    await userEvent.clear(apelido);
    await userEvent.type(apelido, '  Aninha ');
    await userEvent.click(
      screen.getByRole('dialog').querySelector('button[type="submit"]') as HTMLElement,
    );

    await waitFor(() => expect(challengesApi.join).toHaveBeenCalledWith('g1', 'c1', 'Aninha'));
    const ranking = await screen.findByRole('list', { name: 'Ranking' });
    expect(ranking).toHaveTextContent('Bia');
    expect(ranking).toHaveTextContent('(você)');
    expect(screen.getByText('Você, como Ana')).toBeInTheDocument();
  });

  it('apelido com < > não sai da tela', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(desafio());
    renderWithClient(<CommunityChallengePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Participar' }));
    const apelido = screen.getByLabelText('Como aparecer no ranking');
    await userEvent.clear(apelido);
    await userEvent.type(apelido, '<b>Ana');

    expect(screen.getByRole('alert')).toHaveTextContent('nem < ou >');
    expect(
      screen.getByRole('dialog').querySelector('button[type="submit"]') as HTMLElement,
    ).toBeDisabled();
  });

  it('desafio de nutrição avisa que conta pela meta da pessoa', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(desafio({ metric: 'KCAL_IN_RANGE_DAYS' }));
    renderWithClient(<CommunityChallengePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Participar' }));

    expect(screen.getByText(/sem mostrar quanto você comeu/)).toBeInTheDocument();
  });

  it('encerrado: medalha na própria linha e nada de sair', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(
      desafio({
        status: 'ended',
        me: { displayName: 'Ana', score: 6, rank: 1, medal: 'gold' },
        leaderboard: [{ displayName: 'Ana', score: 6, rank: 1, isMe: true, medal: 'gold' }],
      }),
    );
    renderWithClient(<CommunityChallengePage />);

    expect(await screen.findByRole('list', { name: 'Ranking' })).toHaveTextContent('Ouro');
    expect(screen.queryByRole('button', { name: 'Sair do desafio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Participar' })).not.toBeInTheDocument();
    // O placar fechou: nada de "atualiza".
    expect(screen.queryByText(/Atualiza a cada/)).not.toBeInTheDocument();
  });

  it('encerrado sem ter entrado: explica que o ranking ficou para quem participou', async () => {
    vi.mocked(challengesApi.get).mockResolvedValue(desafio({ status: 'ended' }));
    renderWithClient(<CommunityChallengePage />);

    expect(await screen.findByText(/O ranking ficou para quem participou/)).toBeInTheDocument();
  });
});

describe('desafios › prévia na comunidade', () => {
  afterEach(() => vi.clearAllMocks());
  const c = (p: Partial<Challenge>): Challenge => ({ ...desafio(), ...p });

  it('mostra só os abertos e some quando não há nenhum', async () => {
    vi.mocked(challengesApi.list).mockResolvedValue({
      today: '2026-10-18',
      // O encerrado vem primeiro de propósito: quem filtra é a prévia, não a
      // ordem nem o corte em dois.
      challenges: [
        c({ id: 'z', title: 'Velho', status: 'ended' }),
        c({ id: 'a', title: 'Rodando' }),
        c({ id: 'b', title: 'Marcado', status: 'upcoming', startDate: '2026-10-20' }),
      ],
    });
    const { unmount } = renderWithClient(<CommunityChallengesPreview groupId="g1" />);
    const lista = await screen.findByRole('list', { name: 'Desafios abertos' });
    expect(lista).toHaveTextContent('Rodando');
    expect(lista).toHaveTextContent('Começa 20 out');
    expect(lista).not.toHaveTextContent('Velho');
    unmount();

    vi.mocked(challengesApi.list).mockResolvedValue({
      today: '2026-10-18',
      challenges: [c({ id: 'z', title: 'Velho', status: 'ended' })],
    });
    const { container } = renderWithClient(<CommunityChallengesPreview groupId="g1" />);
    await waitFor(() => expect(challengesApi.list).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});

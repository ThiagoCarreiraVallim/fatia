import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup, ReportQueueItem } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    orgApi: { update: vi.fn() },
    moderationApi: {
      reports: vi.fn(),
      resolve: vi.fn(),
      removed: vi.fn(),
      restorePost: vi.fn(),
      bans: vi.fn(),
      ban: vi.fn(),
      unban: vi.fn(),
      reorderPins: vi.fn(),
      unpin: vi.fn(),
    },
    feedApi: { list: vi.fn() },
  };
});

import { feedApi, moderationApi, orgApi, type FeedPage, type Post } from '@fatia/api-client';
import OrgModerationPage from '../page';

const denuncia = (p: Partial<ReportQueueItem> = {}): ReportQueueItem => ({
  reportId: 'r1',
  postId: 'p1',
  commentId: null,
  excerpt: 'Promoção de suplemento, chama no direct',
  images: 0,
  author: { displayName: 'Vendedor', membershipId: 'm-v', team: false },
  reasons: { SPAM: 2 },
  notes: ['propaganda de novo'],
  count: 2,
  firstReportedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  ...p,
});

const aviso = (id: string, title: string): Post => ({
  id,
  kind: 'ANNOUNCEMENT',
  title,
  body: 'texto',
  createdAt: new Date().toISOString(),
  author: { displayName: 'Academia Demo', team: true, asGroup: true, isMe: false },
  images: [],
  pinned: true,
  pinnedUntil: null,
  removed: null,
  reactions: { counts: { STRONG: 0, FIRE: 0, CLAP: 0, HEART: 0 }, mine: null },
  commentCount: 0,
  canDelete: false,
  canModerate: true,
});

function abrir(
  fila: ReportQueueItem[] = [denuncia()],
  pins: Post[] = [],
  g: Partial<MyGroup> = {},
) {
  ctx.group = grupo({ role: 'OWNER', postPolicy: 'ALL_MEMBERS', ...g });
  vi.mocked(feedApi.list).mockResolvedValue({ pins, posts: [] } as unknown as FeedPage);
  vi.mocked(moderationApi.reports).mockResolvedValue(fila);
  vi.mocked(moderationApi.removed).mockResolvedValue([
    {
      id: 'p9',
      excerpt: 'Post antigo',
      images: 0,
      author: { displayName: 'Bia', membershipId: 'm-b' },
      reason: 'OFFENSIVE',
      removedAt: new Date().toISOString(),
    },
  ]);
  vi.mocked(moderationApi.bans).mockResolvedValue([]);
  return renderWithClient(<OrgModerationPage />);
}

describe('/org/[groupId]/moderation', () => {
  afterEach(() => vi.clearAllMocks());

  it('avisos fixados: na ordem do carrossel, sobem e desafixam (Pn-14)', async () => {
    const user = userEvent.setup();
    vi.mocked(moderationApi.reorderPins).mockResolvedValue({ order: [] });
    vi.mocked(moderationApi.unpin).mockResolvedValue({ id: 'a1' });
    abrir([], [aviso('a1', 'Feriado'), aviso('a2', 'Aula nova')]);
    const lista = await screen.findByRole('list', { name: 'Avisos fixados' });
    expect(within(lista).getByText('1. Feriado')).toBeInTheDocument();
    expect(within(lista).getAllByText(/sem prazo|fixado/i).length).toBeGreaterThan(0);
    await user.click(within(lista).getByRole('button', { name: 'Subir Aula nova na ordem' }));
    expect(moderationApi.reorderPins).toHaveBeenCalledWith('g1', ['a2', 'a1']);
    await user.click(within(lista).getAllByRole('button', { name: 'Desafixar' })[0]!);
    await waitFor(() => expect(moderationApi.unpin).toHaveBeenCalledWith('g1', 'a1'));
  });

  it('sem fixados, o mural começa direto nos posts', async () => {
    abrir([]);
    expect(
      await screen.findByText('Nenhum aviso fixado. O mural começa direto nos posts.'),
    ).toBeInTheDocument();
  });

  it('posts automáticos ligam e desligam por tipo', async () => {
    const user = userEvent.setup();
    vi.mocked(orgApi.update).mockResolvedValue({} as never);
    abrir([], [], { autoPosts: ['PLAN', 'TIP', 'EXERCISE', 'CHALLENGE'] });
    const sw = await screen.findByRole('switch', { name: 'Dica nova' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await user.click(sw);
    expect(orgApi.update).toHaveBeenCalledWith('g1', {
      autoPosts: ['PLAN', 'EXERCISE', 'CHALLENGE'],
    });
  });

  it('a fila mostra o resumo, o trecho e as observações, sem quem denunciou', async () => {
    abrir();
    const fila = await screen.findByRole('list', { name: 'Denúncias abertas' });
    expect(within(fila).getByText('2 denúncias: spam ou propaganda (2)')).toBeInTheDocument();
    expect(within(fila).getByText('Promoção de suplemento, chama no direct')).toBeInTheDocument();
    expect(within(fila).getByText('“propaganda de novo”')).toBeInTheDocument();
  });

  it('remover e manter resolvem a denúncia', async () => {
    const user = userEvent.setup();
    vi.mocked(moderationApi.resolve).mockResolvedValue({ resolved: 1 });
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Remover' }));
    expect(moderationApi.resolve).toHaveBeenCalledWith('g1', 'r1', 'remove');
    await user.click(screen.getByRole('button', { name: 'Manter' }));
    await waitFor(() =>
      expect(moderationApi.resolve).toHaveBeenLastCalledWith('g1', 'r1', 'dismiss'),
    );
  });

  it('banir pede confirmação e usa a associação do autor', async () => {
    const user = userEvent.setup();
    vi.mocked(moderationApi.ban).mockResolvedValue({ membershipId: 'm-v' });
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Banir Vendedor' }));
    expect(moderationApi.ban).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Banir' }));
    await waitFor(() => expect(moderationApi.ban).toHaveBeenCalledWith('g1', 'm-v'));
  });

  it('autor da equipe não tem botão de banir', async () => {
    abrir([denuncia({ author: { displayName: 'Prof', membershipId: 'm-p', team: true } })]);
    expect(await screen.findByText(/Post de Prof \(equipe\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Banir/ })).not.toBeInTheDocument();
  });

  it('a regra do mural muda pelo PATCH da comunidade', async () => {
    const user = userEvent.setup();
    vi.mocked(orgApi.update).mockResolvedValue({} as never);
    abrir();
    const so = await screen.findByRole('radio', { name: 'Só a equipe publica' });
    expect(screen.getByRole('radio', { name: 'Todos os membros publicam' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(so);
    expect(orgApi.update).toHaveBeenCalledWith('g1', { postPolicy: 'TEAM_ONLY' });
  });

  it('removidos podem voltar ao mural', async () => {
    const user = userEvent.setup();
    vi.mocked(moderationApi.restorePost).mockResolvedValue({ id: 'p9' });
    abrir([]);
    expect(await screen.findByText('Nenhuma denúncia aberta')).toBeInTheDocument();
    const removidos = await screen.findByRole('list', { name: 'Posts removidos' });
    await user.click(within(removidos).getByRole('button', { name: 'Restaurar' }));
    expect(moderationApi.restorePost).toHaveBeenCalledWith('g1', 'p9');
  });
});

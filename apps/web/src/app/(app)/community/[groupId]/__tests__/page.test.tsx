import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedPage, MyGroup, Post } from '@fatia/api-client';

vi.mock('next/navigation', () => ({
  useParams: () => ({ groupId: 'g1' }),
  usePathname: () => '/community/g1',
}));
// As ações da barra vão por portal; aqui, renderizadas no lugar.
vi.mock('@/components/layout/app-top-bar', () => ({
  useTopBarTitle: vi.fn(),
  TopBarActions: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  topBarActionClass: '',
}));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupsApi: { get: vi.fn() },
    feedApi: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
      react: vi.fn(),
      comment: vi.fn(),
      deleteComment: vi.fn(),
      report: vi.fn(),
    },
    moderationApi: { removePost: vi.fn(), pin: vi.fn(), unpin: vi.fn(), removeComment: vi.fn() },
  };
});

import { feedApi, groupsApi, moderationApi } from '@fatia/api-client';
import { toast } from 'sonner';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import CommunityFeedPage from '../page';

const grupo = (p: Partial<MyGroup> = {}): MyGroup => ({
  id: 'g1',
  type: 'SPONSORED',
  name: 'Academia Demo',
  slug: 'academia-demo',
  description: null,
  joinPolicy: 'APPROVAL',
  role: 'MEMBER',
  status: 'ACTIVE',
  membershipId: 'm1',
  joinedAt: '2026-10-01T00:00:00Z',
  createdAt: '2026-09-01T00:00:00Z',
  consentScopes: ['NUTRITION'],
  statsOptIn: false,
  hasAiSeat: false,
  avatarUrl: null,
  postPolicy: 'ALL_MEMBERS',
  requiredSharingScopes: [],
  ...p,
});

const post = (p: Partial<Post> = {}): Post => ({
  id: 'p1',
  body: 'Primeira semana **completa**!',
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  author: { displayName: 'Bia', team: false, isMe: false },
  images: [],
  pinned: false,
  removed: null,
  reactions: { counts: { STRONG: 2, FIRE: 0, CLAP: 0, HEART: 0 }, mine: null },
  commentCount: 0,
  canDelete: false,
  canModerate: false,
  ...p,
});

const pagina = (p: Partial<FeedPage> = {}): FeedPage => ({
  policy: 'ALL_MEMBERS',
  canPost: true,
  canModerate: false,
  displayName: 'Ana',
  suggestedDisplayName: 'Ana',
  posts: [post()],
  nextCursor: null,
  ...p,
});

function renderPage(firstPage: FeedPage = pagina(), g: MyGroup = grupo()) {
  vi.mocked(groupsApi.get).mockResolvedValue(g);
  vi.mocked(feedApi.list).mockResolvedValue(firstPage);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommunityFeedPage />
    </QueryClientProvider>,
  );
}

describe('/community/[groupId] (o mural)', () => {
  afterEach(() => vi.clearAllMocks());

  it('a comunidade abre no mural, com o nome na barra e a engrenagem para o resto', async () => {
    renderPage();
    expect(await screen.findByRole('article', { name: 'Post de Bia' })).toBeInTheDocument();
    expect(useTopBarTitle).toHaveBeenLastCalledWith('Academia Demo');
    expect(
      screen.getByRole('link', { name: 'Sobre a comunidade e o que você compartilha' }),
    ).toHaveAttribute('href', '/community/g1/settings');
    // Membro comum não tem painel.
    expect(screen.queryByRole('link', { name: 'Abrir painel da equipe' })).not.toBeInTheDocument();
    const abas = screen.getByRole('navigation', { name: 'Seções da comunidade' });
    expect(
      within(abas)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['Mural', '/community/g1'],
      ['Desafios', '/community/g1/challenges'],
      ['Planos e dicas', '/community/g1/content'],
    ]);
  });

  it('a equipe tem o ícone do painel ao lado da engrenagem', async () => {
    renderPage(pagina(), grupo({ role: 'PROFESSIONAL' }));
    expect(await screen.findByRole('link', { name: 'Abrir painel da equipe' })).toHaveAttribute(
      'href',
      '/org/g1',
    );
  });

  it('pedido pendente: sem mural nem abas, e o caminho para ver ou cancelar', async () => {
    renderPage(pagina(), grupo({ status: 'INVITED' }));
    expect(await screen.findByText(/aguardando o dono aprovar/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver ou cancelar o pedido' })).toHaveAttribute(
      'href',
      '/community/g1/settings',
    );
    expect(
      screen.queryByRole('navigation', { name: 'Seções da comunidade' }),
    ).not.toBeInTheDocument();
    // A API responde 404 ao mural de quem não entrou: nem pergunta.
    expect(feedApi.list).not.toHaveBeenCalled();
  });

  it('mostra as abas, o post com o apelido, o markdown e as reações', async () => {
    renderPage();
    const artigo = await screen.findByRole('article', { name: 'Post de Bia' });
    expect(within(artigo).getByText('completa').tagName).toBe('STRONG');
    expect(within(artigo).getByText('há 5 min')).toBeInTheDocument();
    expect(within(artigo).getByRole('button', { name: 'Força, 2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('link', { name: 'Mural' })).toHaveAttribute('aria-current', 'page');
  });

  it('reagir manda a reação, e tocar de novo tira', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.react).mockResolvedValue(post());
    renderPage(
      pagina({
        posts: [
          post({
            reactions: { counts: { STRONG: 1, FIRE: 0, CLAP: 0, HEART: 0 }, mine: 'STRONG' },
          }),
        ],
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Força, 1' }));
    expect(feedApi.react).toHaveBeenCalledWith('g1', 'p1', null);
    await user.click(screen.getByRole('button', { name: 'Fogo' }));
    expect(feedApi.react).toHaveBeenLastCalledWith('g1', 'p1', 'FIRE');
  });

  it('publicar na primeira vez pede o apelido, sugerido pelo primeiro nome', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.create).mockResolvedValue(post({ id: 'novo' }));
    renderPage(pagina({ displayName: null, suggestedDisplayName: 'Carla', posts: [] }));
    expect(await screen.findByText('O mural está vazio')).toBeInTheDocument();
    await user.type(
      screen.getByRole('textbox', { name: 'O que você quer contar para a comunidade?' }),
      'Oi, gente',
    );
    const apelido = screen.getByRole('textbox', { name: 'Seu apelido no mural' });
    expect(apelido).toHaveValue('Carla');
    await user.clear(apelido);
    await user.type(apelido, 'Cacá');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() =>
      expect(feedApi.create).toHaveBeenCalledWith('g1', {
        body: 'Oi, gente',
        imageFileIds: [],
        displayName: 'Cacá',
      }),
    );
  });

  it('com apelido, publica sem perguntar de novo', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.create).mockResolvedValue(post({ id: 'novo' }));
    renderPage();
    await user.type(
      await screen.findByRole('textbox', { name: 'O que você quer contar para a comunidade?' }),
      'Treino feito',
    );
    expect(screen.queryByRole('textbox', { name: 'Seu apelido no mural' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() =>
      expect(feedApi.create).toHaveBeenCalledWith('g1', { body: 'Treino feito', imageFileIds: [] }),
    );
  });

  it('só a equipe publica: sem caixa de post, com o aviso', async () => {
    renderPage(pagina({ canPost: false, policy: 'TEAM_ONLY' }));
    expect(await screen.findByText(/só a equipe publica no mural/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Novo post' })).not.toBeInTheDocument();
  });

  it('o autor vê o aviso do post removido, sem reações nem comentários', async () => {
    renderPage(
      pagina({
        posts: [
          post({
            author: { displayName: 'Ana', team: false, isMe: true },
            removed: { reason: 'SPAM' },
            canDelete: true,
          }),
        ],
      }),
    );
    expect(
      await screen.findByText('Removido pela equipe: spam ou propaganda. Só você vê este post.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Reações' })).not.toBeInTheDocument();
  });

  it('denunciar escolhe o motivo e não diz quem foi', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.report).mockResolvedValue({ reported: true });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Mais ações do post de Bia' }));
    await user.click(screen.getByRole('button', { name: 'Denunciar' }));
    const dialogo = screen.getByRole('dialog', { name: 'Denunciar post' });
    expect(within(dialogo).getByRole('button', { name: 'Denunciar' })).toBeDisabled();
    await user.click(within(dialogo).getByRole('radio', { name: 'Ofensivo' }));
    await user.click(within(dialogo).getByRole('button', { name: 'Denunciar' }));
    await waitFor(() =>
      expect(feedApi.report).toHaveBeenCalledWith('g1', 'p1', {
        reason: 'OFFENSIVE',
        note: null,
        commentId: null,
      }),
    );
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/ninguém fica sabendo/));
  });

  it('quem modera fixa e remove; quem não modera não vê essas ações', async () => {
    const user = userEvent.setup();
    vi.mocked(moderationApi.removePost).mockResolvedValue({ id: 'p1' });
    renderPage(pagina({ canModerate: true, posts: [post({ canModerate: true })] }));
    await user.click(await screen.findByRole('button', { name: 'Mais ações do post de Bia' }));
    expect(screen.getByRole('button', { name: 'Fixar no topo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover do mural' }));
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(moderationApi.removePost).toHaveBeenCalledWith('g1', 'p1'));
  });

  it('membro comum: o menu só tem denunciar', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Mais ações do post de Bia' }));
    const dialogo = screen.getByRole('dialog', { name: 'Ações do post' });
    expect(
      within(dialogo)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Denunciar',
      expect.anything(), // fechar
    ]);
  });

  it('comentários abrem sob o post e comentar envia o texto', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.get).mockResolvedValue({
      ...post(),
      comments: [
        {
          id: 'c1',
          body: 'Boa!',
          createdAt: new Date().toISOString(),
          author: { displayName: 'Dono', team: true, isMe: false },
          removed: false,
          canDelete: false,
          canModerate: false,
        },
      ],
    });
    vi.mocked(feedApi.comment).mockResolvedValue({} as never);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Comentar' }));
    const lista = await screen.findByRole('list', { name: 'Comentários' });
    expect(within(lista).getByText('Equipe')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Escreva um comentário' }), 'Valeu');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() =>
      expect(feedApi.comment).toHaveBeenCalledWith('g1', 'p1', 'Valeu', undefined),
    );
  });

  it('mais antigos carregam pela próxima página', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.list)
      .mockResolvedValueOnce(pagina({ nextCursor: 'p1' }))
      .mockResolvedValueOnce(
        pagina({
          posts: [post({ id: 'p0', author: { displayName: 'Caio', team: false, isMe: false } })],
        }),
      );
    vi.mocked(groupsApi.get).mockResolvedValue(grupo());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CommunityFeedPage />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Ver posts mais antigos' }));
    expect(await screen.findByRole('article', { name: 'Post de Caio' })).toBeInTheDocument();
    expect(feedApi.list).toHaveBeenLastCalledWith('g1', 'p1');
  });
});

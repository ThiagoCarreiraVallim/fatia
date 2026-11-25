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
      markSeen: vi.fn().mockResolvedValue({ seenAt: '' }),
      hide: vi.fn(),
      vote: vi.fn(),
      closePoll: vi.fn(),
    },
    moderationApi: { removePost: vi.fn(), pin: vi.fn(), unpin: vi.fn(), removeComment: vi.fn() },
    blocksApi: { block: vi.fn() },
    forYouApi: {
      get: vi
        .fn()
        .mockResolvedValue({ count: 0, todo: [], recommended: [], fromTeam: [], done: [] }),
    },
  };
});

import { blocksApi, feedApi, forYouApi, groupsApi, moderationApi } from '@fatia/api-client';
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
  proPaidByThisGroup: false,
  avatarUrl: null,
  postPolicy: 'ALL_MEMBERS',
  requiredSharingScopes: [],
  visibility: 'PRIVATE',
  timezone: 'America/Sao_Paulo',
  memberCount: 1,
  newPostCount: 0,
  forYouCount: 0,
  challenge: null,
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
  canHide: true,
  canBlock: true,
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
      ['Para você', '/community/g1/for-you'],
      ['Desafios', '/community/g1/challenges'],
      ['Conteúdo', '/community/g1/content'],
    ]);
  });

  it('mural escondido (#413): sem a aba e sem posts, com o caminho para o resto', async () => {
    renderPage(pagina(), grupo({ hiddenSections: ['FEED'] }));
    expect(await screen.findByText('O mural está escondido nesta comunidade.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver Para você' })).toHaveAttribute(
      'href',
      '/community/g1/for-you',
    );
    const abas = screen.getByRole('navigation', { name: 'Seções da comunidade' });
    expect(within(abas).queryByRole('link', { name: 'Mural' })).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    expect(feedApi.list).not.toHaveBeenCalled();
    // Com a leitura desligada, `isPending` fica true para sempre: o carregamento
    // do mural não pode aparecer no lugar do aviso.
    expect(document.querySelector('.anim-shim')).toBeNull();
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

  it('o primeiro post sai com o nome do perfil, sem pedir apelido', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.create).mockResolvedValue(post({ id: 'novo' }));
    // A API de antes mandava `displayName: null` a quem nunca escreveu.
    renderPage(pagina({ displayName: null, suggestedDisplayName: 'Carla', posts: [] }));
    await user.click(await screen.findByRole('button', { name: 'Escreva para a comunidade…' }));
    await user.type(
      screen.getByRole('textbox', { name: 'O que você quer contar para a comunidade?' }),
      'Oi, gente',
    );
    expect(screen.queryByRole('textbox', { name: 'Seu apelido no mural' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() =>
      expect(feedApi.create).toHaveBeenCalledWith('g1', { body: 'Oi, gente', imageFileIds: [] }),
    );
  });

  it('com apelido, publica sem perguntar de novo', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.create).mockResolvedValue(post({ id: 'novo' }));
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Escreva para a comunidade…' }));
    await user.type(
      screen.getByRole('textbox', { name: 'O que você quer contar para a comunidade?' }),
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
    expect(screen.queryByRole('button', { name: 'Escreva para a comunidade…' })).toBeNull();
  });

  it('o composer começa fechado, como na prancha: abre pela linha e fecha no Cancelar e ao publicar', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.create).mockResolvedValue(post({ id: 'novo' }));
    renderPage();
    await screen.findByRole('article', { name: 'Post de Bia' });
    expect(screen.queryByRole('form', { name: 'Novo post' })).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Escreva para a comunidade…' }));
    expect(
      screen.getByRole('textbox', { name: 'O que você quer contar para a comunidade?' }),
    ).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('form', { name: 'Novo post' })).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Escreva para a comunidade…' }));
    await user.type(
      screen.getByRole('textbox', { name: 'O que você quer contar para a comunidade?' }),
      'Bom dia',
    );
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Novo post' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Escreva para a comunidade…' })).toBeInTheDocument();
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

  it('membro comum: copiar link, ocultar, bloquear e denunciar, na ordem da prancha', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Mais ações do post de Bia' }));
    const dialogo = screen.getByRole('dialog', { name: 'Ações do post' });
    expect(
      within(dialogo)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Copiar link',
      'Ocultar este post',
      'Bloquear Bia',
      'Denunciar',
      expect.anything(), // fechar
    ]);
  });

  it('o próprio post não se oculta nem se bloqueia', async () => {
    const user = userEvent.setup();
    renderPage(
      pagina({
        posts: [
          post({
            author: { displayName: 'Ana', team: false, isMe: true },
            canDelete: true,
            canHide: false,
            canBlock: false,
          }),
        ],
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Mais ações do post de Ana' }));
    const dialogo = screen.getByRole('dialog', { name: 'Ações do post' });
    expect(within(dialogo).queryByRole('button', { name: 'Ocultar este post' })).toBeNull();
    expect(within(dialogo).queryByRole('button', { name: /Bloquear/ })).toBeNull();
    expect(within(dialogo).getByRole('button', { name: 'Apagar post' })).toBeInTheDocument();
  });

  it('ocultar manda o post e avisa que só some para você', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.hide).mockResolvedValue({ hidden: true });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Mais ações do post de Bia' }));
    await user.click(screen.getByRole('button', { name: 'Ocultar este post' }));
    await waitFor(() => expect(feedApi.hide).toHaveBeenCalledWith('g1', 'p1'));
    expect(toast).toHaveBeenCalledWith('Post oculto. Só some para você.');
  });

  it('bloquear pede confirmação com o texto da prancha e bloqueia pelo post', async () => {
    const user = userEvent.setup();
    vi.mocked(blocksApi.block).mockResolvedValue({
      id: 'b1',
      label: 'Bia',
      groupName: 'Academia Demo',
      createdAt: new Date().toISOString(),
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Mais ações do post de Bia' }));
    await user.click(screen.getByRole('button', { name: 'Bloquear Bia' }));
    const confirma = screen.getByRole('dialog', { name: 'Bloquear Bia?' });
    expect(confirma).toHaveTextContent(/em todas as comunidades/);
    expect(confirma).toHaveTextContent(/Dá para desfazer em Você, na seção Conta/);
    await user.click(within(confirma).getByRole('button', { name: 'Bloquear' }));
    await waitFor(() =>
      expect(blocksApi.block).toHaveBeenCalledWith({
        groupId: 'g1',
        postId: 'p1',
        commentId: null,
      }),
    );
  });

  it('fixar escolhe o prazo: 3 dias, 7 dias ou sem prazo', async () => {
    const user = userEvent.setup();
    vi.mocked(moderationApi.pin).mockResolvedValue({ id: 'p1', pinnedUntil: null });
    renderPage(pagina({ canModerate: true, posts: [post({ canModerate: true })] }));
    await user.click(await screen.findByRole('button', { name: 'Mais ações do post de Bia' }));
    await user.click(screen.getByRole('button', { name: 'Fixar no topo' }));
    await user.click(screen.getByRole('button', { name: 'Por 7 dias' }));
    await waitFor(() => expect(moderationApi.pin).toHaveBeenCalledWith('g1', 'p1', 7));
  });

  it('os avisos fixados ficam no carrossel do topo, com o prazo', async () => {
    renderPage(
      pagina({
        pins: [
          post({
            id: 'pin1',
            kind: 'ANNOUNCEMENT',
            title: 'Feriado na sexta',
            pinned: true,
            pinnedUntil: '2026-11-20T15:00:00Z',
            author: { displayName: 'Academia Demo', team: true, asGroup: true, isMe: false },
          }),
        ],
      }),
    );
    const carrossel = await screen.findByRole('region', { name: 'Avisos fixados' });
    expect(
      within(carrossel).getByRole('heading', { name: 'Feriado na sexta' }),
    ).toBeInTheDocument();
    expect(within(carrossel).getByText('Fixado até 20 nov')).toBeInTheDocument();
    expect(within(carrossel).getByText('Comunicado')).toBeInTheDocument();
    expect(within(carrossel).getByText('Comunidade')).toBeInTheDocument();
  });

  it('filtros pedem à API e o vazio do filtro tem texto próprio', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('article', { name: 'Post de Bia' });
    vi.mocked(feedApi.list).mockResolvedValue(pagina({ posts: [] }));
    await user.click(screen.getByRole('button', { name: 'Equipe' }));
    expect(await screen.findByText('Nada por aqui')).toBeInTheDocument();
    expect(screen.getByText('Nenhum post deste tipo ainda.')).toBeInTheDocument();
    expect(feedApi.list).toHaveBeenLastCalledWith('g1', null, 'team');
  });

  it('abrir o mural conta a visita e mostra os posts novos desde a última', async () => {
    renderPage(pagina({ unseen: 3 }));
    expect(await screen.findByText('3 posts novos desde a sua última visita')).toBeInTheDocument();
    await waitFor(() => expect(feedApi.markSeen).toHaveBeenCalledWith('g1'));
    expect(feedApi.markSeen).toHaveBeenCalledTimes(1);
  });

  it('a aba Para você mostra o número do que falta', async () => {
    vi.mocked(forYouApi.get).mockResolvedValueOnce({
      count: 2,
      todo: [],
      recommended: [],
      fromTeam: [],
      done: [],
    });
    renderPage();
    expect(await screen.findByLabelText('2 para ver')).toBeInTheDocument();
  });

  it('enquete: votar manda a opção; com poucos votos, nada de %', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.vote).mockResolvedValue(post());
    const enquete = post({
      kind: 'POLL',
      body: '',
      poll: {
        question: 'Qual horário?',
        closesAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        closed: false,
        myOptionId: null,
        totalVotes: null,
        options: [
          { id: 'o1', label: 'Manhã', percent: null },
          { id: 'o2', label: 'Noite', percent: null },
        ],
        canClose: false,
      },
    });
    renderPage(pagina({ posts: [enquete] }));
    const bloco = await screen.findByRole('region', { name: 'Enquete: Qual horário?' });
    expect(within(bloco).getByText(/Seu voto é anônimo/)).toBeInTheDocument();
    expect(within(bloco).queryByText(/%/)).toBeNull();
    await user.click(within(bloco).getByRole('button', { name: 'Noite' }));
    expect(feedApi.vote).toHaveBeenCalledWith('g1', 'p1', 'o2');
  });

  it('enquete votada com 5 votos dos outros mostra as % e troca de opção, sem apagar o voto', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.vote).mockResolvedValue(post());
    renderPage(
      pagina({
        posts: [
          post({
            kind: 'POLL',
            poll: {
              question: 'Qual horário?',
              closesAt: new Date(Date.now() + 86_400_000 * 3).toISOString(),
              closed: false,
              myOptionId: 'o1',
              totalVotes: 8,
              options: [
                { id: 'o1', label: 'Manhã', percent: 75 },
                { id: 'o2', label: 'Noite', percent: 25 },
              ],
              canClose: false,
            },
          }),
        ],
      }),
    );
    const resultado = await screen.findByRole('group', { name: 'Resultado' });
    expect(within(resultado).getByText('75%')).toBeInTheDocument();
    expect(within(resultado).getByRole('button', { name: /Manhã/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/8 votos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mudar voto' })).toBeNull();
    await user.click(within(resultado).getByRole('button', { name: /Noite/ }));
    expect(feedApi.vote).toHaveBeenCalledWith('g1', 'p1', 'o2');
  });

  it('enquete pelo composer: pergunta, opções e prazo', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.create).mockResolvedValue(post({ id: 'novo' }));
    renderPage();
    await screen.findByRole('article', { name: 'Post de Bia' });
    await user.click(await screen.findByRole('button', { name: 'Escreva para a comunidade…' }));
    await user.click(screen.getByRole('radio', { name: 'Enquete' }));
    await user.type(screen.getByRole('textbox', { name: 'Pergunta' }), 'Treino de sábado?');
    await user.type(screen.getByRole('textbox', { name: 'Opção 1' }), '8h');
    await user.type(screen.getByRole('textbox', { name: 'Opção 2' }), '9h');
    await user.click(screen.getByRole('radio', { name: '1 semana' }));
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() =>
      expect(feedApi.create).toHaveBeenCalledWith('g1', {
        kind: 'POLL',
        poll: { question: 'Treino de sábado?', options: ['8h', '9h'], days: 7 },
      }),
    );
  });

  it('a prévia desenha o markdown, com título e citação', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Escreva para a comunidade…' }));
    const caixa = screen.getByRole('textbox', {
      name: 'O que você quer contar para a comunidade?',
    });
    await user.type(caixa, '# Sábado{enter}> Se chover, sala 2');
    await user.click(screen.getByRole('radio', { name: 'Prévia' }));
    const previa = screen.getByLabelText('Prévia do post');
    expect(within(previa).getByRole('heading', { name: 'Sábado' })).toBeInTheDocument();
    expect(previa.querySelector('blockquote')).toHaveTextContent('Se chover, sala 2');
  });

  it('membro comum não vê "Publicar como" nem "Fixar como aviso"', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Escreva para a comunidade…' }));
    await screen.findByRole('form', { name: 'Novo post' });
    expect(screen.queryByRole('radiogroup', { name: 'Publicar como' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Fixar como aviso' })).toBeNull();
  });

  it('a equipe publica em nome da comunidade e fixa como aviso', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.create).mockResolvedValue(post({ id: 'novo' }));
    renderPage(pagina({ isTeam: true, groupName: 'Academia Demo', canModerate: true }));
    await user.click(await screen.findByRole('button', { name: 'Escreva para a comunidade…' }));
    await user.type(
      screen.getByRole('textbox', { name: 'O que você quer contar para a comunidade?' }),
      'Feriado na sexta',
    );
    await user.click(screen.getByRole('radio', { name: 'Academia Demo' }));
    await user.click(screen.getByRole('switch', { name: 'Fixar como aviso' }));
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() =>
      expect(feedApi.create).toHaveBeenCalledWith('g1', {
        body: 'Feriado na sexta',
        imageFileIds: [],
        publishedAs: 'GROUP',
        pin: true,
        pinDays: 7,
      }),
    );
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
    await waitFor(() => expect(feedApi.comment).toHaveBeenCalledWith('g1', 'p1', 'Valeu'));
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
    expect(feedApi.list).toHaveBeenLastCalledWith('g1', 'p1', 'all');
  });
});

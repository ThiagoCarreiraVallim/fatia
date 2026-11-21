import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogItem, CatalogPage, GroupExercise, MyGroup } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({
  group: null as MyGroup | null,
  params: {} as Record<string, string>,
  search: new URLSearchParams(),
  router: { replace: vi.fn(), push: vi.fn() },
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
  useSearchParams: () => ctx.search,
  useRouter: () => ctx.router,
}));
vi.mock('sonner', () => ({ toast: ctx.toast }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('@/components/layout/app-top-bar', () => ({ useTopBarTitle: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupExerciseApi: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setGuide: vi.fn(),
      setFavorite: vi.fn(),
      duplicate: vi.fn(),
      remove: vi.fn(),
      setEquipment: vi.fn(),
    },
    uploadMedia: vi.fn(),
  };
});

import { groupExerciseApi, uploadMedia } from '@fatia/api-client';
import OrgExercisesPage from '../page';
import OrgExercisePage from '../[exerciseId]/page';

const row = (p: Partial<CatalogItem> = {}): CatalogItem => ({
  exerciseId: 42,
  name: 'Agachamento livre',
  muscleGroup: 'pernas',
  equipment: 'barra',
  ownedByCommunity: false,
  favorite: false,
  homeFriendly: false,
  hasGuide: false,
  hasVideo: false,
  photoCount: 0,
  hasTips: false,
  defaults: null,
  ...p,
});

const page = (items: CatalogItem[], p: Partial<CatalogPage> = {}): CatalogPage => ({
  equipment: [],
  customEquipment: [],
  total: 312,
  count: items.length,
  facets: { muscles: { pernas: 40, peito: 30 }, equipment: { barra: 12, halteres: 20 } },
  items,
  ...p,
});

const item = (p: Partial<GroupExercise> = {}): GroupExercise => ({
  exerciseId: 42,
  name: 'Agachamento livre',
  muscleGroup: 'pernas',
  equipment: 'barra',
  level: null,
  mechanic: null,
  primaryMuscles: ['quadriceps', 'glutes'],
  secondaryMuscles: [],
  instructions: ['Pés na largura dos ombros.'],
  ownedByCommunity: false,
  video: null,
  photos: [],
  tips: null,
  authorName: 'Helena',
  authorRole: 'PROFESSIONAL',
  updatedAt: '2026-10-17T00:00:00Z',
  steps: [],
  commonMistakes: [],
  homeFriendly: false,
  defaults: null,
  canEdit: true,
  favorite: false,
  hasGuide: false,
  usage: { templates: 0, plans: { band: 'many', count: 14 } },
  ...p,
});

describe('painel › catálogo de exercícios (Pn-11)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    ctx.search = new URLSearchParams();
  });

  it('mostra o catálogo com o selo DA CASA, a estrela e a contagem', async () => {
    ctx.group = grupo();
    vi.mocked(groupExerciseApi.list).mockResolvedValue(
      page([
        row({ favorite: true, homeFriendly: true, hasGuide: true }),
        row({ exerciseId: 7, name: 'Supino reto', muscleGroup: 'peito' }),
      ]),
    );
    renderWithClient(<OrgExercisesPage />);

    const lista = await screen.findByRole('list', { name: 'Exercícios do catálogo' });
    const cards = within(lista).getAllByRole('listitem');
    expect(cards[0]).toHaveTextContent('DA CASA');
    expect(cards[1]).not.toHaveTextContent('DA CASA');
    expect(within(cards[0]!).getByRole('button', { name: 'Tirar Agachamento livre dos favoritos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/2 de 312 exercícios/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Pernas/ })).toHaveTextContent('40');
  });

  it('busca, músculo, equipamento, da casa e favoritos vão para a API', async () => {
    ctx.group = grupo();
    vi.mocked(groupExerciseApi.list).mockResolvedValue(page([row()]));
    renderWithClient(<OrgExercisesPage />);
    await screen.findByRole('list', { name: 'Exercícios do catálogo' });

    fireEvent.click(screen.getByRole('tab', { name: /Pernas/ }));
    fireEvent.change(screen.getByLabelText('Equipamento'), { target: { value: 'barra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Da casa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Favoritos' }));
    fireEvent.change(screen.getByLabelText('Buscar exercício'), { target: { value: 'agach' } });
    await waitFor(() =>
      expect(groupExerciseApi.list).toHaveBeenLastCalledWith(
        'g1',
        expect.objectContaining({
          q: 'agach',
          muscle: 'pernas',
          equipment: 'barra',
          house: true,
          favorite: true,
        }),
      ),
    );
  });

  it('a estrela marca o favorito da equipe', async () => {
    ctx.group = grupo();
    vi.mocked(groupExerciseApi.list).mockResolvedValue(page([row()]));
    vi.mocked(groupExerciseApi.setFavorite).mockResolvedValue({ exerciseId: 42, favorite: true });
    renderWithClient(<OrgExercisesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Favoritar Agachamento livre' }));
    await waitFor(() =>
      expect(groupExerciseApi.setFavorite).toHaveBeenCalledWith('g1', 42, true),
    );
  });

  it('a lista mostra a coluna Guia', async () => {
    ctx.group = grupo();
    vi.mocked(groupExerciseApi.list).mockResolvedValue(
      page([row({ hasGuide: true, hasVideo: true, hasTips: true }), row({ exerciseId: 7, name: 'Stiff' })]),
    );
    renderWithClient(<OrgExercisesPage />);
    await screen.findByRole('list', { name: 'Exercícios do catálogo' });
    fireEvent.click(screen.getByRole('button', { name: 'Ver em lista' }));
    const tabela = screen.getByRole('table', { name: 'Exercícios do catálogo' });
    expect(within(tabela).getByRole('columnheader', { name: 'Guia' })).toBeInTheDocument();
    expect(tabela).toHaveTextContent('vídeo e dicas');
    expect(tabela).toHaveTextContent('do catálogo');
  });

  it('abrir um exercício mostra o guia da casa e salva passos e dica', async () => {
    ctx.group = grupo();
    vi.mocked(groupExerciseApi.list).mockResolvedValue(page([row()]));
    vi.mocked(groupExerciseApi.get).mockResolvedValue(item({ steps: ['Costas apoiadas.'] }));
    vi.mocked(groupExerciseApi.setGuide).mockResolvedValue(item());
    renderWithClient(<OrgExercisesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir Agachamento livre' }));
    const guia = await screen.findByRole('region', { name: 'Agachamento livre' });
    expect(await within(guia).findByLabelText('Passo 1')).toHaveValue('Costas apoiadas.');
    fireEvent.click(within(guia).getByRole('button', { name: 'Adicionar passo' }));
    fireEvent.change(within(guia).getByLabelText('Passo 2'), {
      target: { value: 'Desça até 90°.' },
    });
    fireEvent.change(within(guia).getByLabelText('Dica da equipe'), {
      target: { value: 'Fica no fundo da sala.' },
    });
    fireEvent.click(within(guia).getByRole('button', { name: 'Salvar guia' }));
    await waitFor(() =>
      expect(groupExerciseApi.setGuide).toHaveBeenCalledWith('g1', 42, {
        steps: ['Costas apoiadas.', 'Desça até 90°.'],
        tips: 'Fica no fundo da sala.',
      }),
    );
  });

  it('lista que não carregou diz que falhou', async () => {
    ctx.group = grupo();
    vi.mocked(groupExerciseApi.list).mockRejectedValue(new Error('rede'));
    renderWithClient(<OrgExercisesPage />);
    expect(await screen.findByText('Não deu para carregar os exercícios')).toBeInTheDocument();
  });

  it('o dono marca o equipamento da academia no modal', async () => {
    ctx.group = grupo({ role: 'OWNER' });
    vi.mocked(groupExerciseApi.list).mockResolvedValue(
      page([], { equipment: ['halteres'], customEquipment: ['Hack da casa'] }),
    );
    vi.mocked(groupExerciseApi.setEquipment).mockResolvedValue({
      equipment: ['halteres', 'polia'],
      customEquipment: ['Hack da casa'],
    });
    renderWithClient(<OrgExercisesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar equipamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Equipamento da academia' });
    fireEvent.click(within(modal).getByRole('checkbox', { name: 'Polia' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Salvar equipamento' }));
    await waitFor(() =>
      expect(groupExerciseApi.setEquipment).toHaveBeenCalledWith(
        'g1',
        ['halteres', 'polia'],
        ['Hack da casa'],
      ),
    );
  });

  it('o profissional vê o equipamento, mas não muda', async () => {
    ctx.group = grupo({ role: 'PROFESSIONAL' });
    vi.mocked(groupExerciseApi.list).mockResolvedValue(page([], { equipment: ['halteres'] }));
    renderWithClient(<OrgExercisesPage />);
    expect(await screen.findByText(/Só o dono e o admin mudam/)).toBeInTheDocument();
  });
});

describe('painel › editar exercício (Pn-11b)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    ctx.search = new URLSearchParams();
  });

  it('exercício do catálogo: diz onde está e grava o guia da casa inteiro', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: '42' };
    vi.mocked(groupExerciseApi.get).mockResolvedValue(item());
    vi.mocked(groupExerciseApi.setGuide).mockResolvedValue(item({ hasGuide: true }));
    vi.mocked(groupExerciseApi.setFavorite).mockResolvedValue({ exerciseId: 42, favorite: true });
    renderWithClient(<OrgExercisePage />);

    expect(await screen.findByText(/em 14 planos/)).toBeInTheDocument();
    expect(screen.getByText(/o padrão vale só para planos novos/)).toBeInTheDocument();
    // Do catálogo geral: o grupo muscular não muda aqui.
    expect(screen.queryByRole('radio', { name: 'Pernas' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Séries'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Repetições'), { target: { value: '6-8' } });
    fireEvent.change(screen.getByLabelText('Descanso'), { target: { value: '2:00' } });
    fireEvent.change(screen.getByLabelText('Passo 1'), {
      target: { value: 'Pés na largura dos ombros, barra no trapézio.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar erro' }));
    fireEvent.change(screen.getByLabelText('Erro 1'), {
      target: { value: 'Joelho para dentro na subida.' },
    });
    fireEvent.click(screen.getByRole('switch', { name: /Dá para fazer em casa/ }));
    fireEvent.click(screen.getByRole('switch', { name: /Favorito da equipe/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar exercício' }));

    await waitFor(() =>
      expect(groupExerciseApi.setGuide).toHaveBeenCalledWith(
        'g1',
        42,
        expect.objectContaining({
          steps: ['Pés na largura dos ombros, barra no trapézio.'],
          commonMistakes: ['Joelho para dentro na subida.'],
          homeFriendly: true,
          defaultSets: 4,
          defaultReps: '6-8',
          defaultRestSeconds: 120,
        }),
      ),
    );
    expect(groupExerciseApi.setFavorite).toHaveBeenCalledWith('g1', 42, true);
    expect(groupExerciseApi.update).not.toHaveBeenCalled();
  });

  it('descanso que não é tempo não sai do formulário', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: '42' };
    vi.mocked(groupExerciseApi.get).mockResolvedValue(item());
    renderWithClient(<OrgExercisePage />);
    fireEvent.change(await screen.findByLabelText('Descanso'), { target: { value: 'muito' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar exercício' }));
    await waitFor(() =>
      expect(ctx.toast).toHaveBeenCalledWith('Descanso: segundos (90) ou minutos (2:00).'),
    );
    expect(groupExerciseApi.setGuide).not.toHaveBeenCalled();
  });

  it('exercício da casa: escolhe o grupo muscular e salva dados e guia', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: '42' };
    vi.mocked(groupExerciseApi.get).mockResolvedValue(
      item({ ownedByCommunity: true, hasGuide: true, name: 'Leg da casa' }),
    );
    vi.mocked(groupExerciseApi.list).mockResolvedValue(page([]));
    vi.mocked(groupExerciseApi.update).mockResolvedValue(item());
    vi.mocked(groupExerciseApi.setGuide).mockResolvedValue(item());
    renderWithClient(<OrgExercisePage />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Core' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar exercício' }));
    await waitFor(() =>
      expect(groupExerciseApi.update).toHaveBeenCalledWith(
        'g1',
        42,
        expect.objectContaining({ name: 'Leg da casa', muscleGroup: 'core' }),
      ),
    );
    expect(groupExerciseApi.setGuide).toHaveBeenCalled();
  });

  it('Duplicar abre a cópia', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: '42' };
    vi.mocked(groupExerciseApi.get).mockResolvedValue(item());
    vi.mocked(groupExerciseApi.duplicate).mockResolvedValue(item({ exerciseId: 99 }));
    renderWithClient(<OrgExercisePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicar' }));
    await waitFor(() => expect(groupExerciseApi.duplicate).toHaveBeenCalledWith('g1', 42));
    await waitFor(() => expect(ctx.router.push).toHaveBeenCalledWith('/org/g1/exercises/99'));
  });

  it('exercício novo sem grupo muscular não sai do formulário', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: 'new' };
    renderWithClient(<OrgExercisePage />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cadeira flexora' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar exercício' }));
    await waitFor(() => expect(ctx.toast).toHaveBeenCalledWith('Escolha o grupo muscular.'));
    expect(groupExerciseApi.create).not.toHaveBeenCalled();
  });

  it('apagar fica à parte e confirma antes', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: '42' };
    vi.mocked(groupExerciseApi.get).mockResolvedValue(
      item({ ownedByCommunity: true, hasGuide: true }),
    );
    vi.mocked(groupExerciseApi.list).mockResolvedValue(page([]));
    vi.mocked(groupExerciseApi.remove).mockResolvedValue(undefined as never);
    renderWithClient(<OrgExercisePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar exercício' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Apagar este exercício?' })).getByRole('button', {
        name: 'Apagar',
      }),
    );
    await waitFor(() => expect(groupExerciseApi.remove).toHaveBeenCalledWith('g1', 42));
  });

  it('vídeo em outro formato nem pede URL', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: '42' };
    vi.mocked(groupExerciseApi.get).mockResolvedValue(item());
    renderWithClient(<OrgExercisePage />);
    fireEvent.change(await screen.findByLabelText('Vídeo'), {
      target: { files: [new File(['x'], 'a.webm', { type: 'video/webm' })] },
    });
    await waitFor(() => expect(ctx.toast).toHaveBeenCalledWith('Escolha um vídeo MP4 ou MOV.'));
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it('quem não é autor nem dono só lê', async () => {
    ctx.group = grupo({ role: 'PROFESSIONAL' });
    ctx.params = { exerciseId: '42' };
    vi.mocked(groupExerciseApi.get).mockResolvedValue(item({ canEdit: false, hasGuide: true }));
    renderWithClient(<OrgExercisePage />);
    expect(await screen.findByText(/Só quem publicou, ou o dono/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar exercício' })).toBeNull();
  });
});

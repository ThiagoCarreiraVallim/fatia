import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Exercise, GroupExercise, MyGroup } from '@fatia/api-client';
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
// O vaul precisa de APIs de layout que o jsdom não tem; aqui basta abrir e fechar.
vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <section aria-label="drawer">{children}</section> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: Passthrough,
    DrawerDescription: Passthrough,
  };
});
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
      remove: vi.fn(),
      setEquipment: vi.fn(),
    },
    workoutApi: { searchExercises: vi.fn(), getExercise: vi.fn() },
    uploadMedia: vi.fn(),
  };
});

import { groupExerciseApi, uploadMedia, workoutApi } from '@fatia/api-client';
import OrgExercisesPage from '../page';
import OrgExercisePage from '../[exerciseId]/page';

const item = (p: Partial<GroupExercise> = {}): GroupExercise => ({
  exerciseId: 42,
  name: 'Leg press da casa',
  muscleGroup: 'pernas',
  equipment: 'máquina',
  level: null,
  mechanic: null,
  primaryMuscles: [],
  secondaryMuscles: [],
  instructions: ['Pés na largura do quadril'],
  ownedByCommunity: true,
  video: null,
  photos: [],
  tips: null,
  authorName: 'Helena',
  updatedAt: '2026-10-17T00:00:00Z',
  canEdit: true,
  ...p,
});

describe('painel › exercícios', () => {
  afterEach(() => {
    vi.clearAllMocks();
    ctx.search = new URLSearchParams();
  });

  it('lista os exercícios da casa e os tutoriais, e o dono marca o equipamento', async () => {
    ctx.group = grupo({ role: 'OWNER' });
    vi.mocked(groupExerciseApi.list).mockResolvedValue({
      equipment: ['halteres'],
      customEquipment: ['Hack da casa'],
      items: [
        item(),
        item({
          exerciseId: 7,
          name: 'Supino reto',
          ownedByCommunity: false,
          video: { id: 'v', kind: 'VIDEO', url: 'https://b/v', width: null, height: null },
        }),
      ],
    });
    vi.mocked(groupExerciseApi.setEquipment).mockResolvedValue({
      equipment: ['halteres', 'polia'],
      customEquipment: ['Remada articulada'],
    });
    renderWithClient(<OrgExercisesPage />);

    const lista = await screen.findByRole('list', { name: 'Exercícios da comunidade' });
    expect(within(lista).getAllByRole('link')[0]).toHaveTextContent('Da casa');
    expect(within(lista).getAllByRole('link')[1]).toHaveTextContent('CatálogoVídeo');
    expect(within(lista).getAllByRole('link')[1]).toHaveAttribute('href', '/org/g1/exercises/7');
    expect(screen.getByRole('heading', { name: 'Exercícios (2)' })).toBeInTheDocument();

    // Na tela, só o resumo; a lista inteira abre no modal.
    expect(screen.getByRole('list', { name: 'Equipamento marcado' })).toHaveTextContent(
      'HalteresHack da casa',
    );
    expect(screen.queryByRole('checkbox', { name: 'Halteres' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editar equipamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Equipamento da academia' });

    expect(within(modal).getByRole('checkbox', { name: 'Halteres' })).toBeChecked();
    fireEvent.click(within(modal).getByRole('checkbox', { name: 'Polia' }));

    // Equipamento próprio: o que já está na lista é recusado com recado; o novo entra.
    const nome = within(modal).getByLabelText('Nome do equipamento próprio');
    fireEvent.change(nome, { target: { value: 'Leg Press' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Adicionar' }));
    expect(within(modal).getByRole('alert')).toHaveTextContent('Esse já está na lista');
    fireEvent.change(nome, { target: { value: '  Remada   articulada ' } });
    expect(within(modal).queryByRole('alert')).toBeNull();
    fireEvent.click(within(modal).getByRole('button', { name: 'Adicionar' }));
    expect(nome).toHaveValue('');
    fireEvent.click(within(modal).getByRole('button', { name: 'Remover Hack da casa' }));
    expect(within(modal).queryByRole('button', { name: 'Remover Hack da casa' })).toBeNull();

    fireEvent.click(within(modal).getByRole('button', { name: 'Salvar equipamento' }));
    await waitFor(() =>
      expect(groupExerciseApi.setEquipment).toHaveBeenCalledWith(
        'g1',
        ['halteres', 'polia'],
        ['Remada articulada'],
      ),
    );
  });

  it('"Novo exercício" pergunta o que criar: da casa ou tutorial do catálogo', async () => {
    ctx.group = grupo();
    vi.mocked(groupExerciseApi.list).mockResolvedValue({
      equipment: [],
      customEquipment: [],
      items: [],
    });
    vi.mocked(workoutApi.searchExercises).mockResolvedValue([]);
    renderWithClient(<OrgExercisesPage />);

    // Lista vazia: o estado vazio também oferece criar.
    await screen.findByText('Nenhum exercício ainda');
    expect(screen.getAllByRole('button', { name: 'Novo exercício' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Novo exercício' })[0]!);
    const escolha = screen.getByRole('region', { name: 'drawer' });
    fireEvent.click(within(escolha).getByRole('button', { name: /Exercício da casa/ }));
    expect(ctx.router.push).toHaveBeenCalledWith('/org/g1/exercises/new');

    fireEvent.click(screen.getAllByRole('button', { name: 'Novo exercício' })[0]!);
    fireEvent.click(
      within(screen.getByRole('region', { name: 'drawer' })).getByRole('button', {
        name: /Tutorial de um exercício do catálogo/,
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Escolha o exercício' })).toBeVisible();
  });

  it('lista que não carregou diz que falhou, e não que está vazia', async () => {
    ctx.group = grupo();
    vi.mocked(groupExerciseApi.list).mockRejectedValue(new Error('rede'));
    renderWithClient(<OrgExercisesPage />);
    expect(await screen.findByText('Não deu para carregar os exercícios')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum exercício ainda')).toBeNull();
  });

  it('apagar fica à parte, com cara de perigo, e confirma antes', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: '42' };
    vi.mocked(groupExerciseApi.get).mockResolvedValue(item());
    vi.mocked(groupExerciseApi.list).mockResolvedValue({
      equipment: [],
      customEquipment: [],
      items: [],
    });
    vi.mocked(groupExerciseApi.remove).mockResolvedValue(undefined as never);
    renderWithClient(<OrgExercisePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Apagar exercício' }));
    expect(groupExerciseApi.remove).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Apagar este exercício?' })).getByRole('button', {
        name: 'Apagar',
      }),
    );
    await waitFor(() => expect(groupExerciseApi.remove).toHaveBeenCalledWith('g1', 42));
    await waitFor(() => expect(ctx.router.replace).toHaveBeenCalledWith('/org/g1/exercises'));
  });

  it('a busca do modal filtra sem acento e some com as categorias vazias', async () => {
    ctx.group = grupo({ role: 'OWNER' });
    vi.mocked(groupExerciseApi.list).mockResolvedValue({
      equipment: [],
      customEquipment: [],
      items: [],
    });
    renderWithClient(<OrgExercisesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar equipamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Equipamento da academia' });
    expect(within(modal).getByRole('region', { name: 'Máquinas' })).toBeInTheDocument();

    fireEvent.change(within(modal).getByLabelText('Buscar equipamento'), {
      target: { value: 'ELIPTICO' },
    });
    expect(within(modal).getByRole('checkbox', { name: 'Elíptico' })).toBeInTheDocument();
    expect(within(modal).queryByRole('checkbox', { name: 'Polia' })).toBeNull();
    expect(within(modal).queryByRole('region', { name: 'Máquinas' })).toBeNull();

    fireEvent.change(within(modal).getByLabelText('Buscar equipamento'), {
      target: { value: 'nada disso' },
    });
    expect(within(modal).getByText('Nenhum equipamento com esse nome na lista.')).toBeVisible();
    // Nada mudou: salvar não tem o que mandar.
    expect(within(modal).getByRole('button', { name: 'Salvar equipamento' })).toBeDisabled();
  });

  it('o profissional vê o equipamento, mas não muda', async () => {
    ctx.group = grupo({ role: 'PROFESSIONAL' });
    vi.mocked(groupExerciseApi.list).mockResolvedValue({
      equipment: ['halteres'],
      customEquipment: ['Hack da casa'],
      items: [],
    });
    renderWithClient(<OrgExercisesPage />);
    expect(await screen.findByText(/Só o dono muda/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver equipamento' }));
    const modal = await screen.findByRole('dialog', { name: 'Equipamento da academia' });
    expect(within(modal).getByRole('checkbox', { name: 'Halteres' })).toBeDisabled();
    expect(within(modal).getByRole('checkbox', { name: 'Hack da casa' })).toBeChecked();
    expect(within(modal).queryByLabelText('Nome do equipamento próprio')).toBeNull();
    expect(within(modal).queryByRole('button', { name: 'Salvar equipamento' })).toBeNull();
  });

  it('o exercício da casa escolhe o equipamento próprio da academia', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: '42' };
    vi.mocked(groupExerciseApi.get).mockResolvedValue(item());
    vi.mocked(groupExerciseApi.list).mockResolvedValue({
      equipment: [],
      customEquipment: ['Hack da casa'],
      items: [],
    });
    vi.mocked(groupExerciseApi.update).mockResolvedValue(item());
    vi.mocked(groupExerciseApi.setGuide).mockResolvedValue(item());
    renderWithClient(<OrgExercisePage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Equipamento: Máquinas em geral. Trocar' }),
    );
    const daAcademia = await screen.findByRole('region', { name: 'Da academia' });
    expect(within(daAcademia).getByRole('radio', { name: 'Hack da casa' })).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('Buscar equipamento'), { target: { value: 'hack' } });
    // A busca alcança a lista geral também.
    expect(screen.getByRole('radio', { name: 'Agachamento hack' })).toBeInTheDocument();
    fireEvent.click(within(daAcademia).getByRole('radio', { name: 'Hack da casa' }));
    expect(screen.getByRole('button', { name: 'Equipamento: Hack da casa. Trocar' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(groupExerciseApi.update).toHaveBeenCalledWith(
        'g1',
        42,
        expect.objectContaining({ equipment: 'Hack da casa' }),
      ),
    );
  });

  it('exercício da casa sem grupo muscular não sai do formulário', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: 'new' };
    renderWithClient(<OrgExercisePage />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cadeira flexora' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar exercício' }));
    await waitFor(() => expect(ctx.toast).toHaveBeenCalledWith('Escolha o grupo muscular.'));
    expect(groupExerciseApi.create).not.toHaveBeenCalled();
  });

  it('o primeiro tutorial de um exercício do catálogo grava só vídeo, fotos e dicas', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: '7' };
    ctx.search = new URLSearchParams('catalog=1');
    vi.mocked(workoutApi.getExercise).mockResolvedValue({
      id: 7,
      name: 'Supino reto',
      muscleGroup: 'peito',
    } as Exercise);
    vi.mocked(groupExerciseApi.setGuide).mockResolvedValue(
      item({ exerciseId: 7, ownedByCommunity: false }),
    );
    renderWithClient(<OrgExercisePage />);

    expect(await screen.findByText('Supino reto')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome')).toBeNull();
    fireEvent.change(screen.getByLabelText('Dicas'), {
      target: { value: 'Escápulas **juntas**.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tutorial' }));
    await waitFor(() =>
      expect(groupExerciseApi.setGuide).toHaveBeenCalledWith('g1', 7, {
        videoFileId: null,
        photoFileIds: [],
        tips: 'Escápulas **juntas**.',
      }),
    );
    expect(groupExerciseApi.create).not.toHaveBeenCalled();
    await waitFor(() => expect(ctx.router.replace).toHaveBeenCalledWith('/org/g1/exercises/7'));
  });

  it('salvar o exercício da casa atualiza os dados e o tutorial', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: '42' };
    vi.mocked(groupExerciseApi.get).mockResolvedValue(item());
    vi.mocked(groupExerciseApi.update).mockResolvedValue(item());
    vi.mocked(groupExerciseApi.setGuide).mockResolvedValue(item());
    renderWithClient(<OrgExercisePage />);

    fireEvent.change(await screen.findByLabelText('Como executar'), {
      target: { value: '1. Sente\n2. Empurre' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(groupExerciseApi.update).toHaveBeenCalledWith('g1', 42, {
        name: 'Leg press da casa',
        muscleGroup: 'pernas',
        equipment: 'máquina',
        instructions: ['Sente', 'Empurre'],
      }),
    );
    expect(groupExerciseApi.setGuide).toHaveBeenCalledWith('g1', 42, {
      videoFileId: null,
      photoFileIds: [],
      tips: null,
    });
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
    vi.mocked(groupExerciseApi.get).mockResolvedValue(item({ canEdit: false }));
    renderWithClient(<OrgExercisePage />);
    expect(await screen.findByText(/Só quem publicou, ou o dono/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
  });
});

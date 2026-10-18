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
    });
    renderWithClient(<OrgExercisesPage />);

    const lista = await screen.findByRole('list', { name: 'Exercícios da comunidade' });
    expect(within(lista).getAllByRole('link')[0]).toHaveTextContent('Da casa');
    expect(within(lista).getAllByRole('link')[1]).toHaveTextContent('CatálogoVídeo');
    expect(within(lista).getAllByRole('link')[1]).toHaveAttribute('href', '/org/g1/exercises/7');

    expect(screen.getByRole('checkbox', { name: 'Halteres' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Polia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar equipamento' }));
    await waitFor(() =>
      expect(groupExerciseApi.setEquipment).toHaveBeenCalledWith('g1', ['halteres', 'polia']),
    );
  });

  it('o profissional vê o equipamento, mas não muda', async () => {
    ctx.group = grupo({ role: 'PROFESSIONAL' });
    vi.mocked(groupExerciseApi.list).mockResolvedValue({ equipment: [], items: [] });
    renderWithClient(<OrgExercisesPage />);
    expect(await screen.findByText(/Só o dono muda/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Halteres' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Salvar equipamento' })).toBeNull();
  });

  it('exercício da casa sem grupo muscular não sai do formulário', async () => {
    ctx.group = grupo();
    ctx.params = { exerciseId: 'new' };
    renderWithClient(<OrgExercisePage />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cadeira flexora' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pôr no catálogo' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Pôr no catálogo' }));
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

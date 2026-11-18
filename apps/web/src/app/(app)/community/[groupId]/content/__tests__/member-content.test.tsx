import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GroupExercise, GroupTip, PlanTemplate } from '@fatia/api-client';

const ctx = vi.hoisted(() => ({
  params: { groupId: 'g1' } as Record<string, string>,
  search: '',
  toast: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ctx.params,
  useSearchParams: () => new URLSearchParams(ctx.search),
  usePathname: () => '/community/g1/content',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('sonner', () => ({ toast: ctx.toast }));
vi.mock('@/components/layout/app-top-bar', () => ({
  useTopBarTitle: vi.fn(),
  TopBarActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  topBarActionClass: '',
}));
vi.mock('@/components/progress/log-water-drawer', () => ({
  LogWaterDrawer: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Registrar água" /> : null,
}));
vi.mock('@/components/workout/exercise-detail-drawer', () => ({
  ExerciseDetailDrawer: ({
    open,
    exercise,
  }: {
    open: boolean;
    exercise: { name: string } | null;
  }) =>
    open && exercise ? <div role="dialog" aria-label={`Como fazer ${exercise.name}`} /> : null,
}));
vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerFooter: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DrawerClose: Passthrough,
  };
});
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupsApi: { get: vi.fn().mockResolvedValue({ name: 'Academia Demo' }) },
    groupContentApi: { plans: vi.fn(), tips: vi.fn(), tip: vi.fn() },
    groupExerciseApi: { forMember: vi.fn(), memberGuide: vi.fn(), memberEquipment: vi.fn() },
    workoutApi: { getExercise: vi.fn(), listPlans: vi.fn(), addPlanExercise: vi.fn() },
  };
});

import { groupContentApi, groupExerciseApi, workoutApi } from '@fatia/api-client';
import CommunityContentPage from '../page';
import CommunityTipPage from '../tips/[tipId]/page';
import CommunityGuidePage from '../exercises/[exerciseId]/page';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const plano = (p: Partial<PlanTemplate> = {}): PlanTemplate => ({
  id: 't1',
  kind: 'WORKOUT',
  title: 'Pernas e glúteos',
  description: null,
  level: 'intermediate',
  cover: null,
  authorName: 'Bruno',
  authorRole: 'OWNER',
  publishedAt: '2026-11-01T12:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z',
  exercises: [
    {
      exerciseId: 1,
      hasGuide: true,
      name: 'Leg press',
      muscleGroup: 'pernas',
      targetSets: 4,
      targetReps: '10',
    },
  ],
  goals: null,
  meals: [],
  adoptedPlanId: null,
  ...p,
});

const dica = (p: Partial<GroupTip> = {}): GroupTip => ({
  id: 'd1',
  title: 'Água antes do treino',
  body: 'Beba **500 ml** até uma hora antes.',
  category: 'HABITS',
  image: null,
  pinned: true,
  authorName: 'Bruno',
  authorRole: 'OWNER',
  publishedAt: '2026-11-03T12:00:00Z',
  updatedAt: '2026-11-03T12:00:00Z',
  ...p,
});

const guia = (p: Partial<GroupExercise> = {}): GroupExercise => ({
  exerciseId: 42,
  name: 'Leg press 45° da casa',
  muscleGroup: 'pernas',
  equipment: 'máquina',
  level: null,
  mechanic: null,
  primaryMuscles: [],
  secondaryMuscles: [],
  instructions: [],
  ownedByCommunity: true,
  video: { id: 'v', kind: 'VIDEO', url: 'https://b/v', width: null, height: null },
  photos: [
    { id: 'f1', kind: 'IMAGE', url: 'https://b/f1', width: 10, height: 10 },
    { id: 'f2', kind: 'IMAGE', url: 'https://b/f2', width: 10, height: 10 },
  ],
  tips: 'Comece com dois discos de cada lado.',
  authorName: 'Helena',
  authorRole: 'PROFESSIONAL',
  updatedAt: '2026-11-01T12:00:00Z',
  ...p,
});

describe('comunidade › Conteúdo (Cm-12)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    ctx.search = '';
    ctx.params = { groupId: 'g1' };
  });

  it('planos: cada um abre o plano, com tipo, tamanho, nível e autor', async () => {
    vi.mocked(groupContentApi.plans).mockResolvedValue([plano()]);
    vi.mocked(groupContentApi.tips).mockResolvedValue([]);
    renderWithClient(<CommunityContentPage />);
    const link = await screen.findByRole('link', { name: /Pernas e glúteos/ });
    expect(link).toHaveAttribute('href', '/community/g1/content/t1');
    expect(
      within(link).getByText('treino · 1 exercício · intermediário · Bruno'),
    ).toBeInTheDocument();
  });

  it('dicas: a fixada primeiro, e cada uma abre a dica', async () => {
    ctx.search = 'tab=tips';
    vi.mocked(groupContentApi.plans).mockResolvedValue([]);
    vi.mocked(groupContentApi.tips).mockResolvedValue([
      dica({
        id: 'd2',
        pinned: false,
        title: 'Proteína',
        category: 'NUTRITION',
        authorName: 'Helena',
      }),
      dica(),
    ]);
    renderWithClient(<CommunityContentPage />);
    const links = await screen.findAllByRole('link', { name: /Água|Proteína/ });
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/community/g1/content/tips/d1',
      '/community/g1/content/tips/d2',
    ]);
    expect(within(links[0]).getByText('Fixada · hábitos')).toBeInTheDocument();
    expect(within(links[1]).getByText('nutrição · Helena')).toBeInTheDocument();
  });

  it('exercícios: cada guia abre o guia da academia, e os equipamentos vêm embaixo', async () => {
    ctx.search = 'tab=exercises';
    vi.mocked(groupContentApi.plans).mockResolvedValue([]);
    vi.mocked(groupContentApi.tips).mockResolvedValue([]);
    vi.mocked(groupExerciseApi.forMember).mockResolvedValue([guia()]);
    vi.mocked(groupExerciseApi.memberEquipment).mockResolvedValue({
      equipment: ['halteres'],
      customEquipment: ['Remo da casa'],
    });
    renderWithClient(<CommunityContentPage />);
    const link = await screen.findByRole('link', { name: /Leg press 45° da casa/ });
    expect(link).toHaveAttribute('href', '/community/g1/content/exercises/42');
    expect(within(link).getByText('pernas · máquina · guia da academia')).toBeInTheDocument();
    const equipamentos = await screen.findByRole('region', { name: 'Equipamentos da academia' });
    expect(within(equipamentos).getByText('Halteres')).toBeInTheDocument();
    expect(within(equipamentos).getByText('Remo da casa')).toBeInTheDocument();
  });

  it('lista de exercícios que não carregou diz que falhou, e não que está vazia', async () => {
    ctx.search = 'tab=exercises';
    vi.mocked(groupContentApi.plans).mockResolvedValue([]);
    vi.mocked(groupContentApi.tips).mockResolvedValue([]);
    vi.mocked(groupExerciseApi.forMember).mockRejectedValue(new Error('rede'));
    vi.mocked(groupExerciseApi.memberEquipment).mockResolvedValue({
      equipment: [],
      customEquipment: [],
    });
    renderWithClient(<CommunityContentPage />);
    expect(await screen.findByText('Não deu para carregar os exercícios')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum exercício ainda')).toBeNull();
  });
});

describe('comunidade › dica (Cm-15)', () => {
  afterEach(() => vi.clearAllMocks());

  it('mostra quem escreveu e quando, e o atalho abre o registro de água', async () => {
    ctx.params = { groupId: 'g1', tipId: 'd1' };
    vi.mocked(groupContentApi.tip).mockResolvedValue(dica());
    renderWithClient(<CommunityTipPage />);
    expect(
      await screen.findByRole('heading', { name: 'Água antes do treino' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Bruno · dono · \d+ nov$/)).toBeInTheDocument();
    expect(screen.getByText('fixada')).toBeInTheDocument();
    expect(groupContentApi.tip).toHaveBeenCalledWith('g1', 'd1');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar água' }));
    expect(await screen.findByRole('dialog', { name: 'Registrar água' })).toBeInTheDocument();
  });

  it('dica de treino leva ao treino; dica sem atalho não mostra botão', async () => {
    ctx.params = { groupId: 'g1', tipId: 'd1' };
    vi.mocked(groupContentApi.tip).mockResolvedValue(
      dica({ category: 'WORKOUT', title: 'Aqueça', body: 'Cinco minutos de bike.' }),
    );
    const { unmount } = renderWithClient(<CommunityTipPage />);
    expect(await screen.findByRole('link', { name: 'Ir para o treino' })).toHaveAttribute(
      'href',
      '/workout',
    );
    unmount();
    vi.mocked(groupContentApi.tip).mockResolvedValue(
      dica({ category: 'NUTRITION', title: 'Proteína', body: 'Em cada refeição.' }),
    );
    renderWithClient(<CommunityTipPage />);
    await screen.findByRole('heading', { name: 'Proteína' });
    expect(screen.queryByRole('button', { name: 'Registrar água' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ir para o treino' })).toBeNull();
  });
});

describe('comunidade › guia da academia (Cm-16)', () => {
  afterEach(() => vi.clearAllMocks());

  it('vídeo e fotos da academia, a dica de quem escreveu e o Como fazer do Fatia', async () => {
    ctx.params = { groupId: 'g1', exerciseId: '42' };
    vi.mocked(groupExerciseApi.memberGuide).mockResolvedValue(guia());
    vi.mocked(workoutApi.getExercise).mockResolvedValue({
      id: 42,
      name: 'Leg press 45° da casa',
    } as never);
    renderWithClient(<CommunityGuidePage />);
    expect(await screen.findByLabelText('Vídeo: Leg press 45° da casa')).toHaveAttribute(
      'src',
      'https://b/v',
    );
    expect(groupExerciseApi.memberGuide).toHaveBeenCalledWith('g1', 42);
    expect(screen.getByText('Dica da Helena')).toBeInTheDocument();
    // Tocar na segunda foto a põe em destaque.
    fireEvent.click(screen.getByRole('button', { name: 'Foto 2 de 2' }));
    expect(screen.getByRole('button', { name: 'Foto 2 de 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Como fazer' }));
    expect(
      await screen.findByRole('dialog', { name: 'Como fazer Leg press 45° da casa' }),
    ).toBeInTheDocument();
  });

  it('"Pôr num treino" escolhe um dos meus planos e põe o exercício nele', async () => {
    ctx.params = { groupId: 'g1', exerciseId: '42' };
    vi.mocked(groupExerciseApi.memberGuide).mockResolvedValue(guia());
    vi.mocked(workoutApi.listPlans).mockResolvedValue([
      { id: 'p1', name: 'Treino A', exercises: [] },
      { id: 'p2', name: 'Treino B', exercises: [{ exerciseId: 42 }] },
    ] as never);
    vi.mocked(workoutApi.addPlanExercise).mockResolvedValue({} as never);
    renderWithClient(<CommunityGuidePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pôr num treino' }));
    // O plano que já tem o exercício avisa, e não repete.
    expect(await screen.findByRole('button', { name: /Treino B.*já tem/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Treino A/ }));
    await waitFor(() =>
      expect(workoutApi.addPlanExercise).toHaveBeenCalledWith('p1', { exerciseId: 42 }),
    );
    expect(ctx.toast).toHaveBeenCalledWith('Leg press 45° da casa entrou em Treino A.');
  });

  it('guia que não existe (ou de outra comunidade) diz que não está disponível', async () => {
    ctx.params = { groupId: 'g1', exerciseId: '99' };
    vi.mocked(groupExerciseApi.memberGuide).mockRejectedValue(new Error('404'));
    renderWithClient(<CommunityGuidePage />);
    expect(await screen.findByText('Guia indisponível')).toBeInTheDocument();
  });
});

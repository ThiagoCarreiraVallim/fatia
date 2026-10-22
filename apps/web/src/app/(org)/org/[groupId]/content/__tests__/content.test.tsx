import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GroupTip, MyGroup, PlanTemplate } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({
  group: null as MyGroup | null,
  params: {} as Record<string, string>,
  search: new URLSearchParams(),
  router: { replace: vi.fn(), push: vi.fn() },
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
vi.mock('sonner', () => ({ toast: vi.fn() }));
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
    contentApi: {
      plans: vi.fn(),
      plan: vi.fn(),
      tips: vi.fn(),
      createNutrition: vi.fn(),
      createTip: vi.fn(),
      updatePlan: vi.fn(),
      publishPlan: vi.fn(),
      setTipState: vi.fn(),
      deleteTip: vi.fn(),
    },
    nutritionApi: { goals: vi.fn(), mealTemplates: vi.fn() },
    workoutApi: { listPlans: vi.fn() },
  };
});

import { contentApi, nutritionApi } from '@fatia/api-client';
import OrgContentPage from '../page';
import OrgPlanTemplatePage from '../plans/[templateId]/page';
import OrgTipPage from '../tips/[tipId]/page';

const metas = {
  kcalMin: 1800,
  kcalMax: 2100,
  proteinMinG: 120,
  proteinMaxG: 160,
  carbsMinG: 180,
  carbsMaxG: 240,
  fatMinG: 50,
  fatMaxG: 70,
};

const plano = (p: Partial<PlanTemplate> = {}): PlanTemplate => ({
  id: 't1',
  kind: 'WORKOUT',
  title: 'Treino A',
  description: null,
  level: 'beginner',
  cover: null,
  authorName: 'Helena',
  publishedAt: null,
  updatedAt: '2026-10-17T00:00:00Z',
  exercises: [{ name: 'Supino', muscleGroup: 'peito', targetSets: 3, targetReps: '10' }],
  goals: null,
  meals: [],
  adoptedPlanId: null,
  sourcePlanId: 'p1',
  canEdit: true,
  ...p,
});

const dica = (p: Partial<GroupTip> = {}): GroupTip => ({
  id: 'd1',
  title: 'Água',
  body: 'Beba **água**.',
  category: 'HABITS',
  image: null,
  pinned: false,
  authorName: 'Bruno',
  publishedAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  canEdit: true,
  ...p,
});

describe('painel › planos e dicas', () => {
  afterEach(() => {
    vi.clearAllMocks();
    ctx.search = new URLSearchParams();
  });

  it('lista planos e dicas com o estado de cada um', async () => {
    ctx.group = grupo({ role: 'PROFESSIONAL' });
    vi.mocked(contentApi.plans).mockResolvedValue([
      plano(),
      plano({
        id: 't2',
        title: 'Cutting',
        kind: 'NUTRITION',
        publishedAt: '2026-10-01',
        goals: metas,
      }),
    ]);
    vi.mocked(contentApi.tips).mockResolvedValue([dica({ pinned: true })]);
    renderWithClient(<OrgContentPage />);

    const lista = await screen.findByRole('list', { name: 'Planos da comunidade' });
    expect(lista).toHaveTextContent('Treino A');
    expect(lista).toHaveTextContent('Rascunho');
    expect(lista).toHaveTextContent('Nutrição · 1800–2100 kcal');
    expect(screen.getByRole('heading', { name: 'Planos (2)' })).toBeInTheDocument();

    // "Novo plano" pergunta o tipo antes de abrir o formulário.
    fireEvent.click(screen.getByRole('button', { name: 'Novo plano' }));
    const escolha = screen.getByRole('region', { name: 'drawer' });
    fireEvent.click(within(escolha).getByRole('button', { name: /Plano de nutrição/ }));
    expect(ctx.router.push).toHaveBeenCalledWith('/org/g1/content/plans/new?kind=NUTRITION');
  });

  it('abre na aba de dicas pelo endereço, com o estado escrito e a seta de quem abre', async () => {
    ctx.group = grupo();
    ctx.search = new URLSearchParams('tab=tips');
    vi.mocked(contentApi.plans).mockResolvedValue([]);
    vi.mocked(contentApi.tips).mockResolvedValue([dica({ pinned: true, publishedAt: null })]);
    renderWithClient(<OrgContentPage />);

    const lista = await screen.findByRole('list', { name: 'Dicas da comunidade' });
    expect(within(lista).getByRole('link')).toHaveTextContent('RascunhoFixada');
    expect(screen.getByRole('link', { name: 'Nova dica' })).toHaveAttribute(
      'href',
      '/org/g1/content/tips/new',
    );
  });

  it('lista que não carregou diz que falhou, e não que está vazia', async () => {
    ctx.group = grupo();
    vi.mocked(contentApi.plans).mockRejectedValue(new Error('rede'));
    vi.mocked(contentApi.tips).mockResolvedValue([]);
    renderWithClient(<OrgContentPage />);

    expect(await screen.findByText('Não deu para carregar os planos')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum plano ainda')).toBeNull();
  });

  it('cria um plano de nutrição com as minhas metas e uma refeição salva', async () => {
    ctx.group = grupo();
    ctx.params = { templateId: 'new' };
    ctx.search = new URLSearchParams('kind=NUTRITION');
    vi.mocked(nutritionApi.goals).mockResolvedValue({
      userId: 'u',
      ...metas,
      weeklyWorkouts: 3,
      dailyStepsTarget: 8000,
      dailyWaterTargetMl: 2000,
    });
    vi.mocked(nutritionApi.mealTemplates).mockResolvedValue([
      { id: 'mt1', name: 'Café da academia', mealType: 'BREAKFAST', items: [{ kcal: 320 }] },
    ] as never);
    vi.mocked(contentApi.createNutrition).mockResolvedValue(
      plano({ id: 'novo', kind: 'NUTRITION' }),
    );
    renderWithClient(<OrgPlanTemplatePage />);

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Cutting' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preencher com as minhas metas' }));
    await waitFor(() => expect(screen.getByLabelText('Calorias mínimo')).toHaveValue('1800'));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Café da academia/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));

    await waitFor(() => expect(contentApi.createNutrition).toHaveBeenCalled());
    expect(vi.mocked(contentApi.createNutrition).mock.calls[0]).toEqual([
      'g1',
      {
        title: 'Cutting',
        description: null,
        level: null,
        coverFileId: null,
        goals: metas,
        mealTemplateIds: ['mt1'],
      },
    ]);
    await waitFor(() =>
      expect(ctx.router.replace).toHaveBeenCalledWith('/org/g1/content/plans/novo'),
    );
  });

  it('metas com mínimo acima do máximo não saem do formulário', async () => {
    ctx.group = grupo();
    ctx.params = { templateId: 'new' };
    ctx.search = new URLSearchParams('kind=NUTRITION');
    vi.mocked(nutritionApi.mealTemplates).mockResolvedValue([]);
    renderWithClient(<OrgPlanTemplatePage />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'X' } });
    for (const [rotulo, valor] of Object.entries({
      'Calorias mínimo': '2500',
      'Calorias máximo': '2000',
    })) {
      fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(contentApi.createNutrition).not.toHaveBeenCalled();
  });

  it('publica um rascunho; quem não é autor nem dono só lê', async () => {
    ctx.group = grupo();
    ctx.params = { templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(plano());
    vi.mocked(contentApi.publishPlan).mockResolvedValue(plano({ publishedAt: '2026-10-17' }));
    const { unmount } = renderWithClient(<OrgPlanTemplatePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar para os membros' }));
    await waitFor(() => expect(contentApi.publishPlan).toHaveBeenCalledWith('g1', 't1', true));
    unmount();

    vi.mocked(contentApi.plan).mockResolvedValue(plano({ canEdit: false }));
    renderWithClient(<OrgPlanTemplatePage />);
    expect(await screen.findByText(/Só quem publicou, ou o dono/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar para os membros' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apagar plano' })).toBeNull();
  });

  it('com mudança não salva, publicar espera o salvar', async () => {
    ctx.group = grupo();
    ctx.params = { templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(plano());
    vi.mocked(contentApi.updatePlan).mockResolvedValue(plano({ title: 'Treino B' }));
    renderWithClient(<OrgPlanTemplatePage />);

    const publicar = await screen.findByRole('button', { name: 'Publicar para os membros' });
    expect(screen.getByRole('button', { name: 'Tudo salvo' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Treino B' } });
    expect(publicar).toBeDisabled();
    expect(publicar).toHaveAccessibleDescription('Salve as mudanças antes de publicar.');
    fireEvent.click(publicar);
    expect(contentApi.publishPlan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar mudanças' }));
    await waitFor(() => expect(publicar).toBeEnabled());
    expect(vi.mocked(contentApi.updatePlan).mock.calls[0]![2]).toMatchObject({ title: 'Treino B' });
    expect(screen.queryByText('Salve as mudanças antes de publicar.')).toBeNull();
  });

  it('tirar o plano do ar pede confirmação', async () => {
    ctx.group = grupo();
    ctx.params = { templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(plano({ publishedAt: '2026-10-17' }));
    vi.mocked(contentApi.publishPlan).mockResolvedValue(plano());
    renderWithClient(<OrgPlanTemplatePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tirar do ar' }));
    expect(contentApi.publishPlan).not.toHaveBeenCalled();
    const dialogo = screen.getByRole('dialog', { name: 'Tirar este plano do ar?' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Tirar do ar' }));
    await waitFor(() => expect(contentApi.publishPlan).toHaveBeenCalledWith('g1', 't1', false));
  });

  it('dica: tirar do ar confirma, fixar vale na hora e apagar volta para as dicas', async () => {
    ctx.group = grupo();
    ctx.params = { tipId: 'd1' };
    vi.mocked(contentApi.tips).mockResolvedValue([dica()]);
    vi.mocked(contentApi.setTipState).mockResolvedValue(dica());
    vi.mocked(contentApi.deleteTip).mockResolvedValue(undefined as never);
    renderWithClient(<OrgTipPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tirar do ar' }));
    expect(contentApi.setTipState).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Tirar esta dica do ar?' })).getByRole('button', {
        name: 'Tirar do ar',
      }),
    );
    await waitFor(() =>
      expect(contentApi.setTipState).toHaveBeenCalledWith('g1', 'd1', { published: false }),
    );

    fireEvent.click(screen.getByRole('switch', { name: /Fixar no topo/ }));
    await waitFor(() =>
      expect(contentApi.setTipState).toHaveBeenCalledWith('g1', 'd1', { pinned: true }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apagar dica' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Apagar esta dica?' })).getByRole('button', {
        name: 'Apagar',
      }),
    );
    await waitFor(() =>
      expect(ctx.router.replace).toHaveBeenCalledWith('/org/g1/content?tab=tips'),
    );
  });

  it('a prévia da dica desenha o markdown e mostra HTML como texto', async () => {
    ctx.group = grupo();
    ctx.params = { tipId: 'new' };
    vi.mocked(contentApi.createTip).mockResolvedValue(dica({ id: 'nova' }));
    renderWithClient(<OrgTipPage />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Sono' } });
    fireEvent.change(screen.getByLabelText('Texto'), {
      target: { value: 'Durma **8 h**. <script>alert(1)</script>' },
    });
    // Aba do Radix: ativa no mousedown, como no navegador.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Prévia' }));
    const previa = screen.getByLabelText('Prévia da dica');
    expect(previa.querySelector('strong')).toHaveTextContent('8 h');
    expect(previa.querySelector('script')).toBeNull();
    expect(previa).toHaveTextContent('<script>alert(1)</script>');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Escrever' }));

    fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));
    await waitFor(() =>
      expect(contentApi.createTip).toHaveBeenCalledWith('g1', {
        title: 'Sono',
        body: 'Durma **8 h**. <script>alert(1)</script>',
        category: 'GENERAL',
        imageFileId: null,
      }),
    );
  });
});

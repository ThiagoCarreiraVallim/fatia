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
      updateNutrition: vi.fn(),
      createTip: vi.fn(),
      updateTip: vi.fn(),
      updatePlan: vi.fn(),
      publishPlan: vi.fn(),
      setTipState: vi.fn(),
      deleteTip: vi.fn(),
    },
    nutritionApi: { searchFoods: vi.fn(), portions: vi.fn() },
    workoutApi: { listPlans: vi.fn() },
    sendsApi: { recipients: vi.fn(), send: vi.fn(), list: vi.fn(), revoke: vi.fn() },
  };
});

import { toast } from 'sonner';
import { contentApi, sendsApi } from '@fatia/api-client';
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
  authorRole: 'PROFESSIONAL',
  publishedAt: null,
  updatedAt: '2026-10-17T00:00:00Z',
  exercises: [
    {
      exerciseId: 1,
      hasGuide: false,
      name: 'Supino',
      muscleGroup: 'peito',
      targetSets: 3,
      targetReps: '10',
    },
  ],
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
  authorRole: 'OWNER',
  publishedAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  canEdit: true,
  ...p,
});

// O cartão de publicação e o rascunho seguem no editor do plano alimentar; o
// de treino tem o seu (#406, testado em plan-editor).
const alimentar = (p: Partial<PlanTemplate> = {}): PlanTemplate =>
  plano({
    kind: 'NUTRITION',
    exercises: [],
    goals: {
      kcalMin: 1800,
      kcalMax: 2000,
      proteinMinG: 120,
      proteinMaxG: 150,
      carbsMinG: 180,
      carbsMaxG: 220,
      fatMinG: 50,
      fatMaxG: 70,
    },
    nutritionDocument: {
      targets: { kcal: 1900, proteinG: 135, carbsG: 200, fatG: 60 },
      adjustToStudent: true,
      meals: [
        {
          key: 'cafe',
          name: 'Café da manhã',
          time: '07:00',
          mealType: 'BREAKFAST',
          options: [{ items: [] }],
        },
      ],
      groups: [],
    },
    ...p,
  });

describe('painel › planos e dicas', () => {
  afterEach(() => {
    vi.clearAllMocks();
    ctx.search = new URLSearchParams();
  });

  const biblioteca = () => [
    plano({ withWhom: { band: 'many', count: 11 }, draft: false }),
    plano({ id: 't2', title: 'Braços', draft: true, authorName: 'Bruno' }),
    plano({
      id: 't3',
      title: 'Cutting',
      kind: 'NUTRITION',
      publishedAt: '2026-10-01',
      goals: metas,
      exercises: [],
      level: null,
      withWhom: { band: 'few', count: null },
    }),
  ];

  it('biblioteca (#405): abas com contagem, filtros, "Com quem" e criar pelo tipo', async () => {
    ctx.group = grupo({ role: 'PROFESSIONAL' });
    vi.mocked(contentApi.plans).mockResolvedValue(biblioteca());
    vi.mocked(contentApi.tips).mockResolvedValue([dica()]);
    renderWithClient(<OrgContentPage />);

    const tabela = await screen.findByRole('table', { name: 'Biblioteca de planos' });
    expect(screen.getByRole('tab', { name: /^Treino\s*2$/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /^Alimentação\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Dicas\s*1$/ })).toBeInTheDocument();
    expect(tabela).toHaveTextContent('Treino A');
    expect(tabela).toHaveTextContent('11 pessoas');
    expect(tabela).toHaveTextContent('termine antes');
    expect(screen.getByText(/abaixo de 5 pessoas não mostramos o número/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rascunhos' }));
    expect(tabela).not.toHaveTextContent('Treino A');
    expect(tabela).toHaveTextContent('Braços');
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Autor' }), {
      target: { value: 'Bruno' },
    });
    expect(tabela).not.toHaveTextContent('Treino A');

    fireEvent.click(screen.getByRole('tab', { name: /^Alimentação\s*1$/ }));
    const alimentacao = screen.getByRole('table', { name: 'Biblioteca de planos' });
    expect(alimentacao).toHaveTextContent('Cutting');
    expect(alimentacao).toHaveTextContent('menos de 5');

    fireEvent.click(screen.getByRole('button', { name: 'Novo plano de treino' }));
    expect(ctx.router.push).toHaveBeenCalledWith('/org/g1/content/plans/new?kind=WORKOUT');
  });

  it('"Enviar para…" abre o painel, marca quem já tem e envia', async () => {
    ctx.group = grupo({ role: 'PROFESSIONAL' });
    vi.mocked(contentApi.plans).mockResolvedValue(biblioteca());
    vi.mocked(contentApi.tips).mockResolvedValue([]);
    vi.mocked(sendsApi.recipients).mockResolvedValue({
      recipients: [
        {
          membershipId: 'm-ana',
          name: 'Ana Dias',
          accompaniedByMe: true,
          hasPlan: false,
          alreadyHas: false,
          openEnded: false,
        },
        {
          membershipId: 'm-diego',
          name: 'Diego Reis',
          accompaniedByMe: false,
          hasPlan: true,
          alreadyHas: true,
          openEnded: false,
        },
      ],
    });
    vi.mocked(sendsApi.send).mockResolvedValue({
      results: [{ membershipId: 'm-ana', id: 'o1', version: 1, kind: 'new' }],
    });
    renderWithClient(<OrgContentPage />);

    // Rascunho não se envia.
    expect(
      await screen.findByRole('button', { name: 'Enviar “Braços” para alunos' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar “Treino A” para alunos' }));
    const painel = screen.getByRole('region', { name: 'Enviar “Treino A”' });
    expect(await within(painel).findByText('já tem')).toBeInTheDocument();
    expect(within(painel).getByRole('button', { name: 'Escolha para quem' })).toBeDisabled();

    fireEvent.click(within(painel).getByRole('checkbox', { name: /Diego Reis/ }));
    expect(within(painel).getByLabelText(/O que mudou/)).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole('checkbox', { name: /Diego Reis/ }));
    expect(within(painel).queryByLabelText(/O que mudou/)).toBeNull();

    fireEvent.click(within(painel).getByRole('checkbox', { name: /Ana Dias/ }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Enviar para Ana' }));
    await waitFor(() => expect(sendsApi.send).toHaveBeenCalled());
    expect(vi.mocked(sendsApi.send).mock.calls[0]).toEqual([
      'g1',
      {
        templateId: 't1',
        membershipIds: ['m-ana'],
        schedule: 'CALENDAR',
        start: 'TODAY',
        weeks: 4,
        weekdays: [1, 3, 5],
      },
    ]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Enviado · cada pessoa aceita no app'));
  });

  it('"Na comunidade": publicar pergunta do mural; tirar avisa antes', async () => {
    ctx.group = grupo();
    vi.mocked(contentApi.plans).mockResolvedValue(biblioteca());
    vi.mocked(contentApi.tips).mockResolvedValue([]);
    vi.mocked(contentApi.publishPlan).mockResolvedValue(plano({ publishedAt: '2026-11-20' }));
    renderWithClient(<OrgContentPage />);

    expect(await screen.findByRole('switch', { name: 'Na comunidade: Braços' })).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: 'Na comunidade: Treino A' }));
    const publicar = screen.getByRole('dialog', { name: 'Publicar na comunidade' });
    expect(publicar).toHaveTextContent('Tirar da comunidade depois não apaga a cópia de ninguém');
    const mural = within(publicar).getByRole('switch', { name: 'Anunciar no mural' });
    expect(mural).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(mural);
    fireEvent.click(within(publicar).getByRole('button', { name: 'Publicar' }));
    await waitFor(() =>
      expect(contentApi.publishPlan).toHaveBeenCalledWith('g1', 't1', true, false),
    );
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Publicado na comunidade'));

    fireEvent.click(screen.getByRole('tab', { name: /^Alimentação\s*1$/ }));
    fireEvent.click(screen.getByRole('switch', { name: 'Na comunidade: Cutting' }));
    expect(contentApi.publishPlan).toHaveBeenCalledTimes(1);
    const tirar = screen.getByRole('dialog', { name: 'Tirar da comunidade?' });
    fireEvent.click(within(tirar).getByRole('button', { name: 'Tirar da comunidade' }));
    await waitFor(() => expect(contentApi.publishPlan).toHaveBeenCalledWith('g1', 't3', false));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'Tirado da comunidade · quem tem a cópia continua com ela',
      ),
    );
  });

  it('quem não envia planos (administrador) vê a biblioteca sem "Enviar"', async () => {
    ctx.group = grupo({ role: 'ADMIN' });
    vi.mocked(contentApi.plans).mockResolvedValue(biblioteca());
    vi.mocked(contentApi.tips).mockResolvedValue([]);
    renderWithClient(<OrgContentPage />);
    await screen.findByRole('table', { name: 'Biblioteca de planos' });
    expect(screen.queryByRole('button', { name: /^Enviar “/ })).toBeNull();
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

  // O editor do plano alimentar (#407) tem os seus testes em nutrition-editor;
  // aqui ficam publicar, rascunho e quem só lê, como no de treino.
  it('publica pelo "Na comunidade"; quem não é autor nem dono só lê', async () => {
    ctx.group = grupo();
    ctx.params = { templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(alimentar());
    vi.mocked(contentApi.publishPlan).mockResolvedValue(alimentar({ publishedAt: '2026-10-17' }));
    const { unmount } = renderWithClient(<OrgPlanTemplatePage />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Na comunidade' }));
    await waitFor(() => expect(contentApi.publishPlan).toHaveBeenCalledWith('g1', 't1', true));
    unmount();

    vi.mocked(contentApi.plan).mockResolvedValue(alimentar({ canEdit: false }));
    renderWithClient(<OrgPlanTemplatePage />);
    expect(await screen.findByText(/Só quem publicou, ou o dono, muda/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Na comunidade' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apagar plano' })).toBeNull();
  });

  it('com mudança não salva, publicar espera o salvar', async () => {
    ctx.group = grupo();
    ctx.params = { templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(alimentar());
    vi.mocked(contentApi.updateNutrition).mockResolvedValue(alimentar({ title: 'Cutting B' }));
    renderWithClient(<OrgPlanTemplatePage />);

    const publicar = await screen.findByRole('switch', { name: 'Na comunidade' });
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nome do plano'), { target: { value: 'Cutting B' } });
    expect(publicar).toBeDisabled();
    expect(screen.getByText('Salve antes: vai a versão salva.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(publicar).toBeEnabled());
    expect(vi.mocked(contentApi.updateNutrition).mock.calls[0]![2]).toMatchObject({
      title: 'Cutting B',
    });
  });

  it('tirar o plano da comunidade pede confirmação', async () => {
    ctx.group = grupo();
    ctx.params = { templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(alimentar({ publishedAt: '2026-10-17' }));
    vi.mocked(contentApi.publishPlan).mockResolvedValue(alimentar());
    renderWithClient(<OrgPlanTemplatePage />);

    fireEvent.click(await screen.findByRole('switch', { name: 'Na comunidade' }));
    expect(contentApi.publishPlan).not.toHaveBeenCalled();
    const dialogo = screen.getByRole('dialog', { name: 'Tirar este plano da comunidade?' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Tirar' }));
    await waitFor(() => expect(contentApi.publishPlan).toHaveBeenCalledWith('g1', 't1', false));
  });

  it('rascunho (#405): marcar segura o publicar e dizer por quê', async () => {
    ctx.group = grupo();
    ctx.params = { templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(alimentar({ draft: false }));
    vi.mocked(contentApi.updatePlan).mockResolvedValue(alimentar({ draft: true }));
    const { unmount } = renderWithClient(<OrgPlanTemplatePage />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Rascunho' }));
    await waitFor(() =>
      expect(contentApi.updatePlan).toHaveBeenCalledWith('g1', 't1', { draft: true }),
    );
    unmount();

    vi.mocked(contentApi.plan).mockResolvedValue(alimentar({ draft: true }));
    renderWithClient(<OrgPlanTemplatePage />);
    expect(await screen.findByRole('switch', { name: 'Na comunidade' })).toBeDisabled();
    expect(screen.getByText('Termine o rascunho antes de publicar.')).toBeInTheDocument();
  });

  it('dica (Pn-10): fixar e tirar do ar vão no Salvar; tirar do ar confirma', async () => {
    ctx.group = grupo();
    ctx.params = { tipId: 'd1' };
    vi.mocked(contentApi.tips).mockResolvedValue([dica()]);
    vi.mocked(contentApi.setTipState).mockResolvedValue(dica());
    renderWithClient(<OrgTipPage />);

    expect(await screen.findByText('14 de 600 caracteres')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Planos e dicas' })).toHaveAttribute(
      'href',
      '/org/g1/content?tab=tips',
    );
    expect(screen.getByText(/Dica · por Bruno · na biblioteca da/)).toBeInTheDocument();
    // As quatro da prancha; "Geral" só aparece na dica antiga que já é geral.
    const categorias = screen.getByRole('radiogroup', { name: 'Categoria' });
    expect(within(categorias).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Treino',
      'Nutrição',
      'Hábitos',
      'Recuperação',
    ]);
    // Já publicada: anunciar só vale na primeira vez.
    expect(screen.getByRole('switch', { name: 'Anunciar no mural' })).toBeDisabled();

    fireEvent.click(screen.getByRole('switch', { name: 'Fixar no topo' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Publicada na comunidade' }));
    expect(contentApi.setTipState).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Tirar esta dica do ar?' })).getByRole('button', {
        name: 'Tirar do ar',
      }),
    );
    await waitFor(() =>
      expect(contentApi.setTipState).toHaveBeenCalledWith(
        'g1',
        'd1',
        { pinned: true, published: false },
        {},
      ),
    );
    // Nada mudou no texto: não regrava a dica.
    expect(contentApi.updateTip).not.toHaveBeenCalled();
  });

  it('dica nova: categoria, negrito pela barra, prévia do membro e publica anunciando', async () => {
    ctx.group = grupo();
    ctx.params = { tipId: 'new' };
    vi.mocked(contentApi.createTip).mockResolvedValue(dica({ id: 'nova', publishedAt: null }));
    vi.mocked(contentApi.setTipState).mockResolvedValue(dica({ id: 'nova' }));
    renderWithClient(<OrgTipPage />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Sono' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Recuperação' }));
    const texto = screen.getByLabelText('Texto') as HTMLTextAreaElement;
    fireEvent.change(texto, { target: { value: 'Durma 8 h. <script>alert(1)</script>' } });
    texto.setSelectionRange(6, 9);
    fireEvent.click(screen.getByRole('button', { name: 'Negrito' }));
    expect(texto).toHaveValue('Durma **8 h**. <script>alert(1)</script>');

    const previa = screen.getByLabelText('Prévia da dica');
    expect(previa.querySelector('strong')).toHaveTextContent('8 h');
    expect(previa.querySelector('script')).toBeNull();
    expect(previa).toHaveTextContent('<script>alert(1)</script>');
    expect(previa).toHaveTextContent('Recuperação');

    fireEvent.click(screen.getByRole('switch', { name: 'Publicada na comunidade' }));
    expect(screen.getByRole('switch', { name: 'Anunciar no mural' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(contentApi.createTip).toHaveBeenCalledWith('g1', {
        title: 'Sono',
        body: 'Durma **8 h**. <script>alert(1)</script>',
        category: 'RECOVERY',
        imageFileId: null,
      }),
    );
    await waitFor(() =>
      expect(contentApi.setTipState).toHaveBeenCalledWith(
        'g1',
        'nova',
        { published: true },
        { announce: true },
      ),
    );
    await waitFor(() =>
      expect(ctx.router.replace).toHaveBeenCalledWith('/org/g1/content/tips/nova'),
    );
  });

  it('dica nova acima de 600 caracteres não sai do formulário', async () => {
    ctx.group = grupo();
    ctx.params = { tipId: 'new' };
    renderWithClient(<OrgTipPage />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Longa' } });
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'a'.repeat(601) } });
    expect(screen.getByText('601 de 600 caracteres')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('A dica vai até 600 caracteres.'));
    expect(contentApi.createTip).not.toHaveBeenCalled();
  });

  it('dica: apagar confirma e volta para as dicas', async () => {
    ctx.group = grupo();
    ctx.params = { tipId: 'd1' };
    vi.mocked(contentApi.tips).mockResolvedValue([dica()]);
    vi.mocked(contentApi.deleteTip).mockResolvedValue(undefined as never);
    renderWithClient(<OrgTipPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar dica' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Apagar esta dica?' })).getByRole('button', {
        name: 'Apagar',
      }),
    );
    await waitFor(() =>
      expect(ctx.router.replace).toHaveBeenCalledWith('/org/g1/content?tab=tips'),
    );
  });
});

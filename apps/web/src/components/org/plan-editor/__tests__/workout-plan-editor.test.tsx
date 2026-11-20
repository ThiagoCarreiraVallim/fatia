import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DocumentExerciseView,
  Exercise,
  MyGroup,
  PlanCopy,
  PlanTemplate,
} from '@fatia/api-client';
import { grupo, renderWithClient } from '@/app/(org)/org/[groupId]/__tests__/helpers';

const ctx = vi.hoisted(() => ({
  group: null as MyGroup | null,
  params: {} as Record<string, string>,
  search: new URLSearchParams(),
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
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
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('@/components/layout/app-top-bar', () => ({ useTopBarTitle: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    contentApi: {
      plan: vi.fn(),
      createWorkout: vi.fn(),
      updatePlan: vi.fn(),
      publishPlan: vi.fn(),
      deletePlan: vi.fn(),
    },
    workoutApi: { searchExercises: vi.fn(), listPlans: vi.fn() },
    groupExerciseApi: { list: vi.fn() },
    planCopyApi: { get: vi.fn(), save: vi.fn() },
  };
});

import { toast } from 'sonner';
import { ApiError, contentApi, groupExerciseApi, planCopyApi, workoutApi } from '@fatia/api-client';
import OrgPlanTemplatePage from '@/app/(org)/org/[groupId]/content/plans/[templateId]/page';
import MemberPlanCopyPage from '@/app/(org)/org/[groupId]/members/[membershipId]/plans/[offerId]/page';

const catalogo = (id: number, name: string, muscleGroup = 'pernas'): Exercise =>
  ({
    id,
    name,
    muscleGroup,
    source: 'SEED',
    createdByUserId: null,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: 'barra',
    level: null,
    mechanic: null,
    instructions: [],
    youtubeVideoId: null,
    youtubeVideoIdPt: null,
    groupOwned: false,
  }) as Exercise;

const ex = (over: Partial<DocumentExerciseView> = {}): DocumentExerciseView => ({
  type: 'exercise',
  exerciseId: 10,
  name: 'Agachamento livre',
  muscleGroup: 'pernas',
  equipment: 'barra',
  isCardio: false,
  hasGuide: false,
  targetSets: 4,
  targetReps: '6-8',
  restSeconds: 120,
  startLoadKg: 60,
  ...over,
});

const modelo = (p: Partial<PlanTemplate> = {}): PlanTemplate => ({
  id: 't1',
  kind: 'WORKOUT',
  title: 'Inferior v2',
  description: null,
  level: 'intermediate',
  cover: null,
  authorName: 'Helena',
  authorRole: 'PROFESSIONAL',
  publishedAt: null,
  updatedAt: '2026-11-10T00:00:00Z',
  exercises: [],
  goals: null,
  meals: [],
  adoptedPlanId: null,
  canEdit: true,
  draft: false,
  tags: ['hipertrofia'],
  schedule: 'CALENDAR',
  startDate: '2026-11-10',
  endDate: '2026-12-07',
  sessionCount: 2,
  document: {
    sessions: [
      {
        name: 'Pernas',
        weekday: 1,
        items: [
          ex(),
          ex({ exerciseId: 11, name: 'Leg press 45°', targetSets: 3, targetReps: '10-12' }),
        ],
      },
      {
        name: 'Posterior',
        weekday: 4,
        items: [ex({ exerciseId: 12, name: 'Stiff', targetSets: 3, targetReps: '10' })],
      },
    ],
  },
  ...p,
});

beforeEach(() => {
  ctx.group = grupo({ role: 'PROFESSIONAL' });
  ctx.search = new URLSearchParams();
  vi.mocked(workoutApi.searchExercises).mockResolvedValue([
    catalogo(10, 'Agachamento livre'),
    catalogo(20, 'Burpee', 'core'),
    catalogo(30, 'Esteira', 'cardio'),
  ]);
  vi.mocked(groupExerciseApi.list).mockResolvedValue({
    equipment: [],
    customEquipment: [],
    items: [],
  });
});
afterEach(() => vi.clearAllMocks());

describe('editor de plano de treino (#406, Pn-09)', () => {
  it('monta um plano novo: sessões, % de 1RM, AMRAP e cria pelo documento', async () => {
    ctx.params = { groupId: 'g1', templateId: 'new' };
    vi.mocked(contentApi.createWorkout).mockResolvedValue(modelo({ id: 't9' }));
    renderWithClient(<OrgPlanTemplatePage />);

    fireEvent.change(await screen.findByLabelText('Nome do plano'), {
      target: { value: 'Inferior v2' },
    });
    fireEvent.change(screen.getByLabelText('Nome da sessão'), { target: { value: 'Pernas' } });

    fireEvent.change(screen.getByLabelText('Adicionar exercício'), {
      target: { value: 'agach' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Agachamento livre/ }));
    fireEvent.change(screen.getByLabelText('Repetições de Agachamento livre'), {
      target: { value: '6-8' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Opções de Agachamento livre' }));
    const opcoes = screen.getByRole('region', { name: 'Opções de Agachamento livre' });
    fireEvent.click(within(opcoes).getByRole('radio', { name: '% 1RM' }));
    fireEvent.change(within(opcoes).getByLabelText('% do 1RM'), { target: { value: '75' } });
    fireEvent.click(within(opcoes).getByRole('switch', { name: 'Série de aquecimento antes' }));
    fireEvent.click(within(opcoes).getByRole('button', { name: 'Pronto' }));

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar sessão' }));
    fireEvent.change(screen.getByLabelText('Nome da sessão'), { target: { value: 'Final' } });
    fireEvent.click(screen.getByRole('button', { name: 'Circuito' }));
    const bloco = screen.getByRole('region', { name: 'Opções do circuito' });
    expect(within(bloco).getByRole('radio', { name: 'AMRAP' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.change(within(bloco).getByLabelText('Adicionar ao circuito'), {
      target: { value: 'burp' },
    });
    fireEvent.click(await within(bloco).findByRole('button', { name: /Burpee/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Criar plano' }));
    await waitFor(() => expect(contentApi.createWorkout).toHaveBeenCalled());
    const [groupId, body] = vi.mocked(contentApi.createWorkout).mock.calls[0]!;
    expect(groupId).toBe('g1');
    expect(body).toMatchObject({
      title: 'Inferior v2',
      document: {
        sessions: [
          {
            name: 'Pernas',
            items: [
              {
                type: 'exercise',
                exerciseId: 10,
                targetReps: '6-8',
                loadMode: 'PERCENT_1RM',
                loadPercent: 75,
                warmupBefore: true,
              },
            ],
          },
          {
            name: 'Final',
            items: [
              {
                type: 'circuit',
                format: 'AMRAP',
                durationSeconds: 720,
                exercises: [{ type: 'exercise', exerciseId: 20 }],
              },
            ],
          },
        ],
      },
    });
    await waitFor(() =>
      expect(ctx.router.replace).toHaveBeenCalledWith('/org/g1/content/plans/t9'),
    );
  });

  it('abre o modelo, reordena sem arrastar, mexe nas etiquetas e salva', async () => {
    ctx.params = { groupId: 'g1', templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(modelo());
    vi.mocked(contentApi.updatePlan).mockResolvedValue(modelo());
    renderWithClient(<OrgPlanTemplatePage />);

    expect(await screen.findByRole('heading', { name: 'Sessão A · Pernas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sessão B · Posterior/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Descer Agachamento livre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tirar a etiqueta hipertrofia' }));
    const etiqueta = screen.getByLabelText('Nova etiqueta');
    fireEvent.change(etiqueta, { target: { value: 'Força' } });
    fireEvent.keyDown(etiqueta, { key: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(contentApi.updatePlan).toHaveBeenCalled());
    const [, id, body] = vi.mocked(contentApi.updatePlan).mock.calls[0]!;
    expect(id).toBe('t1');
    expect(body.tags).toEqual(['força']);
    expect(body.schedule).toBe('CALENDAR');
    const nomes = body.document!.sessions[0]!.items.map((i) =>
      i.type === 'exercise' ? i.exerciseId : null,
    );
    expect(nomes).toEqual([11, 10]);
    // Campos só da tela não vão para a API.
    expect(JSON.stringify(body.document)).not.toContain('Leg press');
  });

  it('cardio em zona 2 com inclinação', async () => {
    ctx.params = { groupId: 'g1', templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(modelo());
    vi.mocked(contentApi.updatePlan).mockResolvedValue(modelo());
    renderWithClient(<OrgPlanTemplatePage />);
    await screen.findByRole('heading', { name: 'Sessão A · Pernas' });

    fireEvent.click(screen.getByRole('button', { name: 'Cardio' }));
    fireEvent.change(screen.getByLabelText('Adicionar exercício'), { target: { value: 'est' } });
    fireEvent.click(await screen.findByRole('button', { name: /Esteira/ }));
    const opcoes = screen.getByRole('region', { name: 'Opções de Esteira' });
    fireEvent.change(within(opcoes).getByLabelText('Duração (min)'), { target: { value: '30' } });
    fireEvent.change(within(opcoes).getByLabelText('Inclinação (%)'), { target: { value: '6' } });
    fireEvent.click(within(opcoes).getByRole('radio', { name: 'Zona 2' }));

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(contentApi.updatePlan).toHaveBeenCalled());
    const body = vi.mocked(contentApi.updatePlan).mock.calls[0]![2];
    expect(body.document!.sessions[0]!.items[2]).toMatchObject({
      exerciseId: 30,
      cardioTarget: 'TIME',
      cardioDurationSeconds: 1800,
      cardioInclinePercent: 6,
      cardioZone: 2,
    });
  });

  it('a chave de cada sessão volta ao salvar; a cópia duplicada é sessão nova', async () => {
    ctx.params = { groupId: 'g1', templateId: 't1' };
    const comChaves = modelo();
    comChaves.document!.sessions[0]!.key = 'chave-a';
    comChaves.document!.sessions[1]!.key = 'chave-b';
    vi.mocked(contentApi.plan).mockResolvedValue(comChaves);
    vi.mocked(contentApi.updatePlan).mockResolvedValue(comChaves);
    renderWithClient(<OrgPlanTemplatePage />);
    await screen.findByRole('heading', { name: 'Sessão A · Pernas' });

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar sessão' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(contentApi.updatePlan).toHaveBeenCalled());
    const body = vi.mocked(contentApi.updatePlan).mock.calls[0]![2];
    expect(body.document!.sessions.map((s) => s.key)).toEqual(['chave-a', undefined, 'chave-b']);
  });

  it('sessão vazia segura o salvar e diz por quê', async () => {
    ctx.params = { groupId: 'g1', templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(modelo());
    renderWithClient(<OrgPlanTemplatePage />);
    await screen.findByRole('heading', { name: 'Sessão A · Pernas' });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar sessão' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A sessão C está vazia.');
    expect(contentApi.updatePlan).not.toHaveBeenCalled();
  });

  it('"Na comunidade" publica o modelo salvo', async () => {
    ctx.params = { groupId: 'g1', templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(modelo());
    vi.mocked(contentApi.publishPlan).mockResolvedValue(
      modelo({ publishedAt: '2026-11-20T00:00:00Z' }),
    );
    renderWithClient(<OrgPlanTemplatePage />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Na comunidade' }));
    await waitFor(() => expect(contentApi.publishPlan).toHaveBeenCalledWith('g1', 't1', true));
  });
});

const copia = (p: Partial<PlanCopy> = {}): PlanCopy => ({
  offerId: 'o1',
  membershipId: 'm1',
  studentName: 'Ana Dias',
  title: 'Inferior v2',
  authorName: 'Helena',
  template: { id: 't1', title: 'Inferior v2' },
  version: { id: 'v1', version: 1, status: 'ACCEPTED' },
  pendingUpdate: false,
  schedule: 'CALENDAR',
  startDate: '2026-11-10',
  endDate: '2026-12-07',
  weeks: 4,
  weekdays: [1, 4],
  document: modelo().document!,
  progress: { done: 6, planned: 16 },
  lastSets: { '10': { weightKg: 62.5, reps: 8 } },
  ...p,
});

describe('editar a cópia da Ana (#406, Pn-09e)', () => {
  beforeEach(() => {
    ctx.params = { groupId: 'g1', membershipId: 'm1', offerId: 'o1' };
  });

  it('diz o que é a cópia, mostra a última série e salva sem avisar', async () => {
    vi.mocked(planCopyApi.get).mockResolvedValue(copia());
    vi.mocked(planCopyApi.save).mockResolvedValue({ offerId: 'o1', versionId: 'v2', version: 2 });
    renderWithClient(<MemberPlanCopyPage />);

    expect(await screen.findByText('Editando a cópia da Ana')).toBeInTheDocument();
    expect(screen.getByText(/Sessões já feitas \(6 de 16\) ficam como estão/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver original' })).toHaveAttribute(
      'href',
      '/org/g1/content/plans/t1',
    );
    expect(screen.getByRole('link', { name: 'Voltar à ficha' })).toHaveAttribute(
      'href',
      '/org/g1/members/m1',
    );
    const salvar = screen.getByRole('button', { name: 'Salvar na cópia da Ana' });
    expect(salvar).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Opções de Agachamento livre' }));
    const opcoes = screen.getByRole('region', { name: 'Opções de Agachamento livre' });
    expect(within(opcoes).getByText('última da Ana: 62,5 kg × 8')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Séries de Agachamento livre'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Avisar a Ana no app' }));
    fireEvent.change(screen.getByLabelText('O que mudou'), {
      target: { value: 'Uma série a mais' },
    });
    fireEvent.click(salvar);

    await waitFor(() => expect(planCopyApi.save).toHaveBeenCalled());
    const [g, m, o, body] = vi.mocked(planCopyApi.save).mock.calls[0]!;
    expect([g, m, o]).toEqual(['g1', 'm1', 'o1']);
    expect(body).toMatchObject({
      notify: false,
      changeNote: 'Uma série a mais',
      baseVersionId: 'v1',
    });
    expect(body.document.sessions[0]!.items[0]).toMatchObject({ exerciseId: 10, targetSets: 5 });
    await waitFor(() => expect(toast).toHaveBeenCalled());
  });

  it('outra pessoa salvou antes: diz para recarregar, sem sobrescrever', async () => {
    vi.mocked(planCopyApi.get).mockResolvedValue(copia());
    vi.mocked(planCopyApi.save).mockRejectedValue(
      new ApiError('Outra pessoa salvou esta cópia; recarregue.', 409),
    );
    renderWithClient(<MemberPlanCopyPage />);
    fireEvent.change(await screen.findByLabelText('Séries de Agachamento livre'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar na cópia da Ana' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Outra pessoa salvou esta cópia; recarregue',
    );
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
  });

  it('sem acesso ao treino, diz isso em vez de abrir o editor', async () => {
    vi.mocked(planCopyApi.get).mockRejectedValue(new ApiError('Not found', 404));
    renderWithClient(<MemberPlanCopyPage />);
    expect(
      await screen.findByText(/Sem acesso ao treino desta pessoa, ou o plano não existe mais/),
    ).toBeInTheDocument();
  });
});

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Food,
  MyGroup,
  NutritionCopy,
  NutritionDocument,
  NutritionItemDoc,
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
      createNutrition: vi.fn(),
      updateNutrition: vi.fn(),
      updatePlan: vi.fn(),
      publishPlan: vi.fn(),
      deletePlan: vi.fn(),
    },
    nutritionApi: { searchFoods: vi.fn(), portions: vi.fn() },
    nutritionCopyApi: { get: vi.fn(), save: vi.fn() },
  };
});

import { toast } from 'sonner';
import { ApiError, contentApi, foodSnap, nutritionApi, nutritionCopyApi } from '@fatia/api-client';
import OrgPlanTemplatePage from '@/app/(org)/org/[groupId]/content/plans/[templateId]/page';
import MemberNutritionCopyPage from '@/app/(org)/org/[groupId]/members/[membershipId]/nutrition-plans/[planId]/page';

const taco = (p: Partial<Food> & { id: number; name: string }): Food => ({
  source: 'TACO' as Food['source'],
  groupId: null,
  kcalPer100g: 128,
  proteinPer100g: 2.5,
  carbsPer100g: 28,
  fatPer100g: 0.2,
  createdByUserId: null,
  portions: [],
  ...p,
});

const ARROZ = taco({
  id: 1,
  name: 'Arroz branco cozido',
  portions: [{ id: 'p1', label: 'colher de sopa', grams: 25, mine: false }],
});
const BATATA = taco({ id: 2, name: 'Batata-doce cozida', kcalPer100g: 86, carbsPer100g: 20 });
const FRANGO = taco({
  id: 3,
  name: 'Frango grelhado',
  kcalPer100g: 159,
  proteinPer100g: 32,
  carbsPer100g: 0,
  fatPer100g: 2.5,
});
const MANDIOCA = taco({ id: 4, name: 'Mandioca cozida', kcalPer100g: 125, carbsPer100g: 30 });
const MEU = taco({ id: 99, name: 'Arroz da vó', createdByUserId: 'u1' });

const item = (f: Food, grams: number, groupKey: string | null = null): NutritionItemDoc => ({
  ...foodSnap(f, grams),
  key: `k-${f.id}-${grams}`,
  groupKey,
});

const documento = (): NutritionDocument => ({
  targets: { kcal: 1840, proteinG: 140, carbsG: 190, fatG: 58 },
  adjustToStudent: true,
  meals: [
    {
      key: 'cafe',
      name: 'Café da manhã',
      time: '07:00',
      mealType: 'BREAKFAST',
      options: [{ items: [] }],
    },
    {
      key: 'almoco',
      name: 'Almoço',
      time: '12:30',
      mealType: 'LUNCH',
      options: [
        { items: [item(ARROZ, 100, 'carb2'), item(FRANGO, 120)] },
        { items: [item(BATATA, 130, 'carb2')] },
      ],
    },
    {
      key: 'jantar',
      name: 'Jantar',
      time: '19:30',
      mealType: 'DINNER',
      options: [{ items: [item(ARROZ, 100, 'carb2')] }],
    },
  ],
  groups: [
    {
      key: 'carb2',
      name: 'Carboidrato 2',
      keyMacro: 'carbs',
      foods: [foodSnap(ARROZ, 100), foodSnap(BATATA, 130), foodSnap(BATATA, 200)],
    },
  ],
});

const modelo = (p: Partial<PlanTemplate> = {}): PlanTemplate => ({
  id: 't1',
  kind: 'NUTRITION',
  title: 'Hipertrofia 2.000 kcal',
  description: null,
  level: null,
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
  nutritionDocument: documento(),
  ...p,
});

beforeEach(() => {
  ctx.group = grupo({ role: 'PROFESSIONAL' });
  ctx.search = new URLSearchParams();
  vi.mocked(nutritionApi.searchFoods).mockImplementation(async (q: string) =>
    [ARROZ, BATATA, FRANGO, MANDIOCA, MEU].filter((f) =>
      f.name.toLowerCase().includes(q.toLowerCase()),
    ),
  );
  vi.mocked(nutritionApi.portions).mockImplementation(async (id: number) =>
    id === 1 ? ARROZ.portions! : [],
  );
});
afterEach(() => vi.clearAllMocks());

describe('editor de plano alimentar (#407, Pn-24)', () => {
  it('monta um plano novo: metas digitáveis, só alimento da TACO, medida caseira e cria pelo documento', async () => {
    ctx.params = { groupId: 'g1', templateId: 'new' };
    ctx.search = new URLSearchParams('kind=NUTRITION');
    vi.mocked(contentApi.createNutrition).mockResolvedValue(modelo({ id: 't9' }));
    renderWithClient(<OrgPlanTemplatePage />);

    fireEvent.change(await screen.findByLabelText('Nome do plano'), {
      target: { value: 'Hipertrofia 2.000 kcal' },
    });
    fireEvent.change(screen.getByLabelText('Calorias por dia'), { target: { value: '1840' } });
    fireEvent.change(screen.getByLabelText('Proteína'), { target: { value: '140' } });
    fireEvent.change(screen.getByLabelText('Carboidrato'), { target: { value: '190' } });
    fireEvent.change(screen.getByLabelText('Gordura'), { target: { value: '58' } });
    // Sem IA (ADR 045).
    expect(screen.queryByRole('button', { name: /Gerar com IA/ })).not.toBeInTheDocument();

    const almoco = screen.getByRole('region', { name: 'Almoço' });
    fireEvent.change(within(almoco).getByLabelText('Adicionar alimento em Almoço'), {
      target: { value: 'arroz' },
    });
    fireEvent.click(await within(almoco).findByRole('button', { name: /Arroz branco cozido/ }));
    // O alimento próprio de alguém não entra no plano.
    expect(within(almoco).queryByRole('button', { name: /Arroz da vó/ })).not.toBeInTheDocument();
    expect(within(almoco).getByText('1 × colher de sopa · 25 g')).toBeInTheDocument();

    fireEvent.click(within(almoco).getByRole('button', { name: 'Editar Arroz branco cozido' }));
    fireEvent.change(within(almoco).getByLabelText('Quantidade de Arroz branco cozido'), {
      target: { value: '4' },
    });
    expect(within(almoco).getByText('4 × colher de sopa · 100 g')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Criar plano' }));
    await waitFor(() => expect(contentApi.createNutrition).toHaveBeenCalled());
    const [groupId, body] = vi.mocked(contentApi.createNutrition).mock.calls[0]!;
    expect(groupId).toBe('g1');
    expect(body.title).toBe('Hipertrofia 2.000 kcal');
    expect(body.document).toMatchObject({
      targets: { kcal: 1840, proteinG: 140, carbsG: 190, fatG: 58 },
      adjustToStudent: true,
    });
    const meal = body.document!.meals.find((m) => m.name === 'Almoço')!;
    expect(meal.options[0]!.items).toEqual([
      expect.objectContaining({
        foodId: 1,
        grams: 100,
        portionLabel: 'colher de sopa',
        portionQuantity: 4,
      }),
    ]);
    // Nome e macros ficam na tela; o servidor recalcula.
    expect(JSON.stringify(body.document)).not.toContain('Arroz branco');
    await waitFor(() =>
      expect(ctx.router.replace).toHaveBeenCalledWith('/org/g1/content/plans/t9'),
    );
  });

  it('total do dia contra a meta e o painel de equivalentes do grupo', async () => {
    ctx.params = { groupId: 'g1', templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(modelo());
    vi.mocked(contentApi.updateNutrition).mockResolvedValue(modelo());
    renderWithClient(<OrgPlanTemplatePage />);

    const total = await screen.findByRole('region', { name: 'Total das refeições' });
    // 128 + 190,8 + 128 = 446,8 kcal contra 1.840.
    expect(within(total).getByText('447 kcal')).toBeInTheDocument();
    expect(within(total).getByText('−1.393 abaixo da meta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Calorias por dia'), { target: { value: '450' } });
    expect(within(total).getByText('dentro da meta')).toBeInTheDocument();

    // A opção 2 do almoço muda o total.
    const almoco = screen.getByRole('region', { name: 'Almoço' });
    fireEvent.click(within(almoco).getByRole('tab', { name: 'Opção 2' }));
    expect(within(almoco).getByText('Batata-doce cozida')).toBeInTheDocument();
    expect(within(total).getByText('240 kcal')).toBeInTheDocument();
    fireEvent.click(within(almoco).getByRole('tab', { name: 'Opção 1' }));

    fireEvent.click(
      within(almoco).getByRole('button', { name: 'Equivalentes: Carboidrato 2 · 3 opções' }),
    );
    const painel = screen.getByRole('region', { name: 'Equivalentes · Carboidrato 2' });
    expect(within(painel).getByText('usado em 2 refeições')).toBeInTheDocument();
    // Batata 200 g = 40 g de carboidrato contra 28 do arroz: fora de ±10%.
    expect(within(painel).getAllByText('fora de ±10%')).toHaveLength(1);
    fireEvent.change(within(painel).getByLabelText('Adicionar alimento ao grupo'), {
      target: { value: 'mandioca' },
    });
    fireEvent.click(await within(painel).findByRole('button', { name: /Mandioca cozida/ }));
    expect(within(painel).getByText('Mandioca cozida')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(contentApi.updateNutrition).toHaveBeenCalled());
    const [g, id, body] = vi.mocked(contentApi.updateNutrition).mock.calls[0]!;
    expect([g, id]).toEqual(['g1', 't1']);
    expect(body.document!.targets!.kcal).toBe(450);
    expect(body.document!.groups[0]!.foods.map((f) => f.foodId)).toEqual([1, 2, 2, 4]);
    // As chaves voltam como vieram: a versão nova casa trocas e "comi isso".
    expect(body.document!.meals.map((m) => m.key)).toEqual(['cafe', 'almoco', 'jantar']);
    expect(body.document!.meals[1]!.options[0]!.items[0]).toMatchObject({
      key: 'k-1-100',
      groupKey: 'carb2',
    });
  });

  it('refeição vazia e grupo de 1 alimento só avisam; sem calorias não salva', async () => {
    ctx.params = { groupId: 'g1', templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(modelo());
    vi.mocked(contentApi.updateNutrition).mockResolvedValue(modelo());
    renderWithClient(<OrgPlanTemplatePage />);

    const cafe = await screen.findByRole('region', { name: 'Café da manhã' });
    expect(
      within(cafe).getByText('Nenhum item nesta refeição. O aluno vê "sem sugestão".'),
    ).toBeInTheDocument();

    // Grupo novo a partir do frango: a proteína é o macro-chave.
    const almoco = screen.getByRole('region', { name: 'Almoço' });
    fireEvent.click(within(almoco).getByRole('button', { name: 'Editar Frango grelhado' }));
    fireEvent.change(within(almoco).getByLabelText('Equivalentes de Frango grelhado'), {
      target: { value: 'new' },
    });
    const painel = screen.getByRole('region', { name: 'Equivalentes · Proteína 1' });
    expect(
      within(painel).getByText(
        'Adicione ao menos 2 alimentos. Com 1 só, o botão Trocar some para o aluno.',
      ),
    ).toBeInTheDocument();
    const avisos = screen.getByRole('list', { name: 'Avisos' });
    expect(within(avisos).getByText(/Café da manhã: nenhum item/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Calorias por dia'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Defina as calorias por dia.');
    expect(contentApi.updateNutrition).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Calorias por dia'), { target: { value: '1840' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(contentApi.updateNutrition).toHaveBeenCalled());
    const body = vi.mocked(contentApi.updateNutrition).mock.calls[0]![2];
    expect(body.document!.groups[1]).toMatchObject({
      name: 'Proteína 1',
      keyMacro: 'protein',
      foods: [{ foodId: 3, grams: 120 }],
    });
    expect(body.document!.meals[1]!.options[0]!.items[1]!.groupKey).toBe(
      body.document!.groups[1]!.key,
    );
  });

  it('adiciona refeição e opção, e tira um item', async () => {
    ctx.params = { groupId: 'g1', templateId: 't1' };
    vi.mocked(contentApi.plan).mockResolvedValue(modelo());
    vi.mocked(contentApi.updateNutrition).mockResolvedValue(modelo());
    renderWithClient(<OrgPlanTemplatePage />);

    const jantar = await screen.findByRole('region', { name: 'Jantar' });
    fireEvent.click(within(jantar).getByRole('button', { name: 'Tirar Arroz branco cozido' }));
    fireEvent.click(within(jantar).getByRole('button', { name: 'Adicionar opção' }));
    expect(within(jantar).getByRole('tab', { name: 'Opção 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar refeição' }));
    fireEvent.change(screen.getAllByLabelText('Nome da refeição').at(-1)!, {
      target: { value: 'Ceia' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(contentApi.updateNutrition).toHaveBeenCalled());
    const body = vi.mocked(contentApi.updateNutrition).mock.calls[0]![2];
    expect(body.document!.meals.map((m) => m.name)).toEqual([
      'Café da manhã',
      'Almoço',
      'Jantar',
      'Ceia',
    ]);
    expect(body.document!.meals[2]!.options).toEqual([{ items: [] }, { items: [] }]);
  });
});

const copia = (p: Partial<NutritionCopy> = {}): NutritionCopy => ({
  planId: 'np1',
  membershipId: 'm1',
  studentName: 'Ana Dias',
  title: 'Hipertrofia 2.000 kcal',
  authorName: 'Helena',
  template: { id: 't1', title: 'Hipertrofia 2.000 kcal' },
  version: { id: 'v1', version: 1, status: 'ACCEPTED' },
  pendingUpdate: false,
  document: { ...documento(), adjustToStudent: false },
  swapsKept: 3,
  ...p,
});

describe('editar a alimentação da Ana (#407, Pn-24c)', () => {
  beforeEach(() => {
    ctx.params = { groupId: 'g1', membershipId: 'm1', planId: 'np1' };
  });

  it('diz o que é a cópia e salva sem avisar, com o que mudou', async () => {
    vi.mocked(nutritionCopyApi.get).mockResolvedValue(copia());
    vi.mocked(nutritionCopyApi.save).mockResolvedValue({ planId: 'np2', version: 2 });
    renderWithClient(<MemberNutritionCopyPage />);

    expect(await screen.findByText('Editando a cópia da Ana')).toBeInTheDocument();
    expect(screen.getByText(/As trocas que ela já fez continuam/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver original' })).toHaveAttribute(
      'href',
      '/org/g1/content/plans/t1',
    );
    expect(screen.getByRole('link', { name: 'Voltar à ficha' })).toHaveAttribute(
      'href',
      '/org/g1/members/m1',
    );
    // Na cópia não há "ajustar a cada aluno": ela é de uma pessoa só.
    expect(
      screen.queryByRole('switch', { name: 'Ajustar às metas de cada aluno' }),
    ).not.toBeInTheDocument();
    const salvar = screen.getByRole('button', { name: 'Salvar na cópia da Ana' });
    expect(salvar).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Calorias por dia'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Avisar a Ana no app' }));
    fireEvent.change(screen.getByLabelText('O que mudou'), {
      target: { value: 'Mais calorias' },
    });
    fireEvent.click(salvar);

    await waitFor(() => expect(nutritionCopyApi.save).toHaveBeenCalled());
    const [g, m, p, body] = vi.mocked(nutritionCopyApi.save).mock.calls[0]!;
    expect([g, m, p]).toEqual(['g1', 'm1', 'np1']);
    expect(body).toMatchObject({
      notify: false,
      changeNote: 'Mais calorias',
      baseVersionId: 'v1',
      document: { targets: { kcal: 2000 } },
    });
    await waitFor(() => expect(toast).toHaveBeenCalled());
  });

  it('outra pessoa salvou antes: diz para recarregar, sem sobrescrever', async () => {
    vi.mocked(nutritionCopyApi.get).mockResolvedValue(copia());
    vi.mocked(nutritionCopyApi.save).mockRejectedValue(
      new ApiError('Outra pessoa salvou esta cópia; recarregue.', 409),
    );
    renderWithClient(<MemberNutritionCopyPage />);
    fireEvent.change(await screen.findByLabelText('Calorias por dia'), {
      target: { value: '2000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar na cópia da Ana' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Outra pessoa salvou esta cópia; recarregue',
    );
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
  });

  it('sem acesso à alimentação, diz isso em vez de abrir o editor', async () => {
    vi.mocked(nutritionCopyApi.get).mockRejectedValue(new ApiError('Not found', 404));
    renderWithClient(<MemberNutritionCopyPage />);
    expect(
      await screen.findByText(/Sem acesso à alimentação desta pessoa, ou o plano não existe mais/),
    ).toBeInTheDocument();
  });
});

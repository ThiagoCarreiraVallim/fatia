import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NutritionPlan, NutritionPlanOverview, PlanFood, PlanItem } from '@fatia/api-client';

const ctx = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: ctx.toast }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    nutritionPlanApi: {
      get: vi.fn(),
      accept: vi.fn(),
      logMeal: vi.fn(),
      swap: vi.fn(),
      undoSwap: vi.fn(),
    },
  };
});

import { nutritionPlanApi } from '@fatia/api-client';
import PlanPage from '../page';

const api = vi.mocked(nutritionPlanApi);

const food = (id: string, foodName: string, kcal: number, over: Partial<PlanFood> = {}) => ({
  id,
  foodName,
  grams: 50,
  portionLabel: null,
  portionQuantity: null,
  kcal,
  proteinG: 4,
  carbsG: 25,
  fatG: 1,
  ...over,
});

const item = (over: Partial<PlanItem> & Pick<PlanItem, 'id' | 'foodName'>): PlanItem => ({
  ...food(over.id, over.foodName, 124),
  equivalenceGroup: null,
  equivalents: [],
  swap: null,
  ...over,
});

const pao = item({
  id: 'i-pao',
  foodName: 'Pão integral',
  portionLabel: 'fatia',
  portionQuantity: 2,
  equivalenceGroup: 'Carboidrato',
  equivalents: [food('e-tapioca', 'Tapioca', 136, { grams: 40 })],
});
const mamao = item({ id: 'i-mamao', foodName: 'Mamão papaia', kcal: 60 });

const plan = (over: Partial<NutritionPlan> = {}): NutritionPlan => ({
  id: 'p1',
  version: 1,
  status: 'ACCEPTED',
  author: { name: 'Helena Personal' },
  sentAt: '2026-10-20T10:00:00Z',
  acceptedAt: '2026-10-21T10:00:00Z',
  changeNote: null,
  goals: {
    kcalMin: 1760,
    kcalMax: 1920,
    proteinMinG: 130,
    proteinMaxG: 150,
    carbsMinG: 175,
    carbsMaxG: 205,
    fatMinG: 52,
    fatMaxG: 64,
  },
  applyGoals: true,
  note: null,
  meals: [
    {
      id: 'm-cafe',
      mealType: 'BREAKFAST',
      name: 'Café da manhã',
      position: 0,
      logged: null,
      options: [
        {
          id: 'o-cafe',
          position: 0,
          kcal: 184,
          proteinG: 8,
          carbsG: 50,
          fatG: 2,
          items: [pao, mamao],
        },
      ],
    },
    {
      id: 'm-almoco',
      mealType: 'LUNCH',
      name: 'Almoço',
      position: 1,
      logged: null,
      options: [
        {
          id: 'o-a1',
          position: 0,
          kcal: 620,
          proteinG: 40,
          carbsG: 70,
          fatG: 15,
          items: [item({ id: 'i-arroz', foodName: 'Arroz' })],
        },
        {
          id: 'o-a2',
          position: 1,
          kcal: 600,
          proteinG: 40,
          carbsG: 70,
          fatG: 15,
          items: [item({ id: 'i-macarrao', foodName: 'Macarrão' })],
        },
      ],
    },
  ],
  ...over,
});

const overview = (over: Partial<NutritionPlanOverview> = {}): NutritionPlanOverview => ({
  date: '2026-11-15',
  active: plan(),
  pending: null,
  teamSees: false,
  viewerName: null,
  week: { inRangeDays: 5, days: 7 },
  ...over,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlanPage />
    </QueryClientProvider>,
  );
}

describe('Plano alimentar (Al-N5)', () => {
  beforeEach(() => {
    api.get.mockReset().mockResolvedValue(overview());
  });

  it('cabeçalho com autor, versão, kcal do dia, macros e a semana', async () => {
    renderPage();
    expect(await screen.findByText('Helena Personal · v1')).toBeInTheDocument();
    expect(screen.getByText('1.840')).toBeInTheDocument();
    expect(screen.getByText('P 140 · C 190 · G 58')).toBeInTheDocument();
    expect(screen.getByText('5/7 na semana')).toBeInTheDocument();
    expect(screen.getByText('2 fatias · 124 kcal')).toBeInTheDocument();
    // Sem equivalente, sem botão de troca.
    expect(screen.getByText('sem troca')).toBeInTheDocument();
  });

  it('trocar abre as equivalentes, mostra a diferença e só grava ao confirmar', async () => {
    api.swap.mockResolvedValue({
      swap: {
        id: 's1',
        itemId: 'i-pao',
        equivalentId: 'e-tapioca',
        date: '2026-11-15',
        foodName: 'Tapioca',
        grams: 40,
        kcal: 136,
      },
      replaced: 'Pão integral',
      teamSees: true,
      viewerName: 'Helena',
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Trocar pão integral' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('É o que já está no plano.')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('radio', { name: /Tapioca/ }));
    expect(within(sheet).getByText('+12 kcal no dia')).toBeInTheDocument();
    expect(api.swap).not.toHaveBeenCalled();

    await user.click(within(sheet).getByRole('button', { name: 'Trocar por tapioca' }));
    await waitFor(() =>
      expect(api.swap).toHaveBeenCalledWith({
        itemId: 'i-pao',
        equivalentId: 'e-tapioca',
        date: '2026-11-15',
      }),
    );
    await waitFor(() =>
      expect(ctx.toast).toHaveBeenCalledWith(
        'Troca registrada · Helena vê no seu diário',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Desfazer' }) }),
      ),
    );
  });

  it('sem compartilhar, o aviso diz que fica só no diário', async () => {
    api.swap.mockResolvedValue({
      swap: {
        id: 's1',
        itemId: 'i-pao',
        equivalentId: 'e-tapioca',
        date: '2026-11-15',
        foodName: 'Tapioca',
        grams: 40,
        kcal: 136,
      },
      replaced: 'Pão integral',
      teamSees: false,
      viewerName: null,
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Trocar pão integral' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('radio', { name: /Tapioca/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Trocar por tapioca' }));
    await waitFor(() =>
      expect(ctx.toast).toHaveBeenCalledWith(
        'Troca registrada · fica só no seu diário',
        expect.anything(),
      ),
    );
  });

  it('item trocado mostra o que entrou e desfaz', async () => {
    const swapped = {
      ...pao,
      swap: { id: 's1', equivalentId: 'e-tapioca', foodName: 'Tapioca', grams: 40, kcal: 136 },
    };
    const p = plan();
    p.meals[0].options[0].items = [swapped, mamao];
    api.get.mockResolvedValue(overview({ active: p }));
    api.undoSwap.mockResolvedValue({ undone: true, restored: 'Pão integral' });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Tapioca')).toBeInTheDocument();
    expect(screen.getByText('trocado')).toBeInTheDocument();
    expect(screen.getByText('40 g · 136 kcal · no lugar de pão integral')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Desfazer troca de tapioca' }));
    await waitFor(() => expect(api.undoSwap).toHaveBeenCalledWith('s1'));
    await waitFor(() => expect(ctx.toast).toHaveBeenCalledWith('Voltou para pão integral'));
  });

  it('refeição com opções: escolhe uma e "comi isso" registra aquela', async () => {
    api.logMeal.mockResolvedValue({ mealId: 'meal-1', date: '2026-11-15' });
    const user = userEvent.setup();
    renderPage();

    const almoco = await screen.findByRole('region', { name: 'Almoço' });
    expect(within(almoco).getByText('toque para escolher')).toBeInTheDocument();
    expect(within(almoco).queryByRole('button', { name: 'Comi isso' })).not.toBeInTheDocument();

    await user.click(within(almoco).getByRole('button', { name: /Opção 2 · 600 kcal/ }));
    await user.click(within(almoco).getByRole('button', { name: 'Comi isso' }));
    await waitFor(() => expect(api.logMeal).toHaveBeenCalledWith('m-almoco', { optionId: 'o-a2' }));
  });

  it('refeição vazia do editor (#407) diz "sem sugestão", sem "comi isso", e mostra a hora', async () => {
    const p = plan();
    p.meals[0] = { ...p.meals[0]!, time: '07:00' };
    p.meals[0].options[0] = { ...p.meals[0].options[0]!, kcal: 0, items: [] };
    api.get.mockResolvedValue(overview({ active: p }));
    renderPage();

    const cafe = await screen.findByRole('region', { name: 'Café da manhã' });
    expect(within(cafe).getByText('07:00')).toBeInTheDocument();
    expect(within(cafe).getByText('Sem sugestão nesta refeição.')).toBeInTheDocument();
    expect(within(cafe).queryByRole('button', { name: 'Comi isso' })).not.toBeInTheDocument();
  });

  it('refeição já registrada aparece como feita, sem registrar de novo', async () => {
    const p = plan();
    p.meals[0].logged = { mealId: 'meal-1', optionId: 'o-cafe' };
    api.get.mockResolvedValue(overview({ active: p }));
    renderPage();

    const cafe = await screen.findByRole('region', { name: 'Café da manhã' });
    expect(within(cafe).getByText('feito')).toBeInTheDocument();
    expect(within(cafe).queryByRole('button', { name: 'Comi isso' })).not.toBeInTheDocument();
  });

  it('plano novo pede confirmação antes de aceitar e diz o que muda', async () => {
    api.get.mockResolvedValue(
      overview({
        pending: plan({
          id: 'p2',
          version: 2,
          status: 'SENT',
          acceptedAt: null,
          note: 'Ajustei o carbo.',
        }),
      }),
    );
    api.accept.mockResolvedValue(plan({ id: 'p2', version: 2 }));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Helena Personal mandou o plano v2')).toBeInTheDocument();
    expect(screen.getByText('Ajustei o carbo.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Aceitar plano v2' }));
    expect(api.accept).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Suas metas do dia passam a ser 1\.760–1\.920 kcal/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Aceitar' }));
    await waitFor(() => expect(api.accept).toHaveBeenCalledWith('p2'));
  });

  it('versão nova mandada pela biblioteca diz o que mudou (#405)', async () => {
    api.get.mockResolvedValue(
      overview({
        pending: plan({
          id: 'p2',
          version: 2,
          status: 'SENT',
          acceptedAt: null,
          changeNote: 'Subi a proteína do almoço.',
        }),
      }),
    );
    renderPage();
    const novo = await screen.findByRole('region', { name: 'Plano novo' });
    expect(novo).toHaveTextContent('O que mudou: Subi a proteína do almoço.');
  });

  it('o plano novo pode ser visto antes de aceitar, sem trocar nem registrar', async () => {
    const novo = plan({ id: 'p2', version: 2, status: 'SENT', acceptedAt: null });
    api.get.mockResolvedValue(overview({ active: null, pending: novo }));
    renderPage();

    expect(await screen.findByText('Helena Personal · v2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trocar pão integral' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comi isso' })).not.toBeInTheDocument();
  });

  it('sem plano, explica de onde ele vem', async () => {
    api.get.mockResolvedValue(overview({ active: null }));
    renderPage();
    expect(await screen.findByText('Nenhum plano alimentar ainda')).toBeInTheDocument();
  });
});

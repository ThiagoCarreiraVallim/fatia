import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanTemplate } from '@fatia/api-client';

const ctx = vi.hoisted(() => ({
  params: { groupId: 'g1', templateId: 't1' } as Record<string, string>,
  router: { push: vi.fn(), replace: vi.fn() },
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
  useRouter: () => ctx.router,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: ctx.toast }));
vi.mock('@/components/layout/app-top-bar', () => ({ useTopBarTitle: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupContentApi: { plan: vi.fn(), adopt: vi.fn(), plans: vi.fn(), tips: vi.fn() },
    nutritionApi: { goals: vi.fn() },
    uploadMedia: vi.fn(),
  };
});

import { ApiError, groupContentApi, nutritionApi, uploadMedia } from '@fatia/api-client';
import { ImageField } from '@/components/content/image-field';
import CommunityTemplatePage from '../[templateId]/page';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

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

const modelo = (p: Partial<PlanTemplate> = {}): PlanTemplate => ({
  id: 't1',
  kind: 'WORKOUT',
  title: 'Treino A',
  description: 'Três vezes por semana.',
  level: 'beginner',
  cover: null,
  authorName: 'Helena',
  publishedAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  exercises: [
    { name: 'Supino', muscleGroup: 'peito', targetSets: 3, targetReps: '10' },
    {
      name: 'Remada no aparelho da casa',
      muscleGroup: 'costas',
      targetSets: 4,
      targetReps: '8-12',
    },
  ],
  goals: null,
  meals: [],
  adoptedPlanId: null,
  ...p,
});

describe('comunidade › plano pronto', () => {
  afterEach(() => vi.clearAllMocks());

  it('adotar um treino leva ao plano copiado', async () => {
    vi.mocked(groupContentApi.plan).mockResolvedValue(modelo());
    vi.mocked(groupContentApi.adopt).mockResolvedValue({
      kind: 'WORKOUT',
      planId: 'meu',
      goalsApplied: false,
      mealsSaved: 0,
      mealsAlreadySaved: false,
    });
    renderWithClient(<CommunityTemplatePage />);
    expect(await screen.findByText('2. Remada no aparelho da casa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adotar plano' }));
    await waitFor(() => expect(ctx.router.push).toHaveBeenCalledWith('/workout/plans/meu'));
    expect(groupContentApi.adopt).toHaveBeenCalledWith('g1', 't1', {});
  });

  it('"Adotar" vem antes da lista de exercícios, e quem já adotou lê isso', async () => {
    vi.mocked(groupContentApi.plan).mockResolvedValue(modelo());
    const { unmount } = renderWithClient(<CommunityTemplatePage />);
    const adotar = await screen.findByRole('button', { name: 'Adotar plano' });
    const lista = screen.getByText('1. Supino');
    // A ação principal não fica depois de uma lista que pode passar de uma tela.
    expect(adotar.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();

    vi.mocked(groupContentApi.plan).mockResolvedValue(modelo({ adoptedPlanId: 'meu' }));
    renderWithClient(<CommunityTemplatePage />);
    expect(await screen.findByText('Você já adotou este plano.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir meu plano' })).toHaveAttribute(
      'href',
      '/workout/plans/meu',
    );
    expect(screen.queryByRole('button', { name: 'Adotar plano' })).toBeNull();
  });

  it('se já adotou, a API responde 409 com o plano e a tela abre o que a pessoa tem', async () => {
    vi.mocked(groupContentApi.plan).mockResolvedValue(modelo());
    vi.mocked(groupContentApi.adopt).mockRejectedValue(
      new ApiError('Você já adotou este plano.', 409, { planId: 'antigo' }),
    );
    renderWithClient(<CommunityTemplatePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Adotar plano' }));
    await waitFor(() => expect(ctx.router.push).toHaveBeenCalledWith('/workout/plans/antigo'));
  });

  it('nutrição: as metas só mudam se a pessoa marcar, e a tela mostra a diferença antes', async () => {
    vi.mocked(groupContentApi.plan).mockResolvedValue(
      modelo({
        kind: 'NUTRITION',
        exercises: [],
        goals: metas,
        meals: [
          {
            name: 'Café da academia',
            mealType: 'BREAKFAST',
            kcal: 320,
            items: [
              {
                foodId: null,
                foodName: 'Aveia',
                grams: 40,
                kcal: 150,
                proteinG: 5,
                carbsG: 27,
                fatG: 3,
                portionLabel: null,
                portionQuantity: null,
              },
            ],
          },
        ],
      }),
    );
    vi.mocked(nutritionApi.goals).mockResolvedValue({
      userId: 'u',
      ...metas,
      kcalMin: 2500,
      kcalMax: 2800,
      weeklyWorkouts: 3,
      dailyStepsTarget: 8000,
      dailyWaterTargetMl: 2000,
    });
    vi.mocked(groupContentApi.adopt).mockResolvedValue({
      kind: 'NUTRITION',
      planId: null,
      goalsApplied: false,
      mealsSaved: 1,
      mealsAlreadySaved: false,
    });
    renderWithClient(<CommunityTemplatePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Adotar plano' }));

    expect(await screen.findByText('2500–2800 kcal')).toBeInTheDocument();
    const trocar = screen.getByRole('checkbox', { name: /Trocar minhas metas/ });
    expect(trocar).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Adotar' }));
    await waitFor(() =>
      expect(groupContentApi.adopt).toHaveBeenCalledWith('g1', 't1', {
        applyGoals: false,
        saveMeals: true,
      }),
    );
    expect(ctx.toast).toHaveBeenCalledWith('1 refeição salva.');
    expect(ctx.router.push).not.toHaveBeenCalled();
  });
});

describe('envio de imagem', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('manda direto ao bucket pela URL assinada e devolve o arquivo confirmado', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', put);
    // O envio de verdade (pedir URL, PUT, confirmar) é do api-client e tem teste lá;
    // aqui importa o que a tela entrega a ele e o PUT que ela sabe fazer.
    vi.mocked(uploadMedia).mockImplementation(async (_input, doPut) => {
      await doPut('https://bucket/put', { 'Content-Type': 'image/png' });
      return { id: 'f1', kind: 'IMAGE', url: 'https://bucket/get', width: 10, height: 10 };
    });
    const onChange = vi.fn();
    render(<ImageField groupId="g1" label="Capa" value={null} onChange={onChange} />);
    const arquivo = new File(['png'], 'capa.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Capa'), { target: { files: [arquivo] } });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ fileId: 'f1', url: 'https://bucket/get' }),
    );
    expect(vi.mocked(uploadMedia).mock.calls[0][0]).toEqual({
      purpose: 'group_content',
      groupId: 'g1',
      mime: 'image/png',
      bytes: 3,
    });
    expect(put).toHaveBeenCalledWith('https://bucket/put', {
      method: 'PUT',
      body: arquivo,
      headers: { 'Content-Type': 'image/png' },
    });
  });

  it('GIF nem pede URL', async () => {
    const onChange = vi.fn();
    render(<ImageField groupId="g1" label="Capa" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Capa'), {
      target: { files: [new File(['gif'], 'x.gif', { type: 'image/gif' })] },
    });
    await waitFor(() =>
      expect(ctx.toast).toHaveBeenCalledWith('Escolha uma imagem JPEG, PNG ou WebP.'),
    );
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

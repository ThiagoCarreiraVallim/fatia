import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mealTypeForTime, type DaySummary } from '@fatia/api-client';
import NutritionPage from '../page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('date=2026-05-19'),
  useRouter: () => ({ push: vi.fn(), replace }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/nutrition/food-search-drawer', () => ({
  FoodSearchDrawer: (props: { open: boolean; initialMode?: string; mealType?: string }) =>
    props.open ? (
      <div role="dialog">{`busca ${props.initialMode ?? 'search'} ${props.mealType ?? ''}`}</div>
    ) : null,
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, nutritionApi: { summary: vi.fn(), history: vi.fn() } };
});

import { nutritionApi } from '@fatia/api-client';

const summary = vi.mocked(nutritionApi.summary);
const history = vi.mocked(nutritionApi.history);

const emptyDay = {
  date: '2026-05-19',
  totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  meals: [],
} as unknown as DaySummary;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NutritionPage />
    </QueryClientProvider>,
  );
}

describe('NutritionPage', () => {
  beforeEach(() => {
    summary.mockReset().mockResolvedValue(emptyDay);
    replace.mockReset();
    history.mockReset().mockResolvedValue({
      days: 7,
      series: [{ date: '2026-05-18', meals: 2, kcal: 1500, proteinG: 0, carbsG: 0, fatG: 0 }],
      averages: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    });
  });

  it('o topo segue a prancha: título grande, leitor, plano e metas, sem cards de fora dela', async () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Nutrição' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plano alimentar' })).toHaveAttribute(
      'href',
      '/nutrition/plan',
    );
    expect(screen.getByRole('link', { name: 'Metas do dia' })).toHaveAttribute(
      'href',
      '/nutrition/goals',
    );
    await screen.findByRole('heading', { name: 'De onde veio' });
    expect(screen.queryByText(/Tendência semanal/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Meus alimentos')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar dia' })).not.toBeInTheDocument();
  });

  it('a faixa mostra a semana do dia, contorna o dia com refeição e troca o dia', async () => {
    const user = userEvent.setup();
    renderPage();

    // 2026-05-19 é terça: a semana vai de 18 a 24.
    const selected = screen.getByRole('tab', { selected: true });
    expect(selected).toHaveAccessibleName('terça, 19 de maio');
    expect(
      await screen.findByRole('tab', { name: 'segunda, 18 de maio, registrado' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'quinta, 21 de maio' }));
    expect(replace).toHaveBeenCalledWith('?date=2026-05-21', { scroll: false });
  });

  it('o atalho do topo abre a busca já no leitor, no tipo de refeição da hora', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Ler código ou rótulo' }));

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `busca scan ${mealTypeForTime(new Date())}`,
    );
  });

  it('falha ao carregar o dia mostra o motivo e tenta de novo', async () => {
    summary.mockRejectedValueOnce(new Error('Sem conexão.'));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.');
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => expect(summary).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: 'De onde veio' })).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FirstStepsCard } from '../first-steps-card';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, onboardingApi: { firstSteps: vi.fn() } };
});

import { onboardingApi } from '@fatia/api-client';

const ITEMS = [
  {
    key: 'meal' as const,
    title: 'Registrar a 1ª refeição',
    subtitle: 'Por foto ou busca',
    href: '/nutrition',
    done: true,
  },
  {
    key: 'workout' as const,
    title: 'Abrir o treino de Helena',
    subtitle: 'Hipertrofia A/B',
    href: '/community/g1/content/t1',
    done: false,
  },
  {
    key: 'challenge' as const,
    title: 'Entrar no desafio',
    subtitle: 'Semana ativa · 38 pessoas',
    href: '/community/g1/challenges/c1',
    done: false,
  },
];

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FirstStepsCard />
    </QueryClientProvider>,
  );
}

describe('Primeiros passos (Onb-11)', () => {
  afterEach(() => vi.clearAllMocks());

  it('o anel conta o que foi feito, e cada passo leva à tela dele', async () => {
    vi.mocked(onboardingApi.firstSteps).mockResolvedValue({
      items: ITEMS,
      doneCount: 1,
      allDone: false,
      visible: true,
    });
    renderCard();
    expect(await screen.findByText('1/3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir o treino de Helena/ })).toHaveAttribute(
      'href',
      '/community/g1/content/t1',
    );
    expect(screen.getByRole('link', { name: /Registrar a 1ª refeição/ })).toHaveTextContent(
      'feito',
    );
  });

  it('com os três, "Tudo pronto!" e o "Refazer"', async () => {
    vi.mocked(onboardingApi.firstSteps).mockResolvedValue({
      items: ITEMS.map((i) => ({ ...i, done: true })),
      doneCount: 3,
      allDone: true,
      visible: true,
    });
    renderCard();
    expect(await screen.findByText('Tudo pronto!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Refazer' })).toHaveAttribute(
      'href',
      '/onboarding?refazer=1',
    );
  });

  it('some no dia seguinte, e para quem não tem o cartão', async () => {
    vi.mocked(onboardingApi.firstSteps).mockResolvedValue(null);
    const { container } = renderCard();
    await waitFor(() => expect(onboardingApi.firstSteps).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

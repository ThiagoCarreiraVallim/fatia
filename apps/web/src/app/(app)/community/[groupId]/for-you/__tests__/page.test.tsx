import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ForYou } from '@fatia/api-client';

vi.mock('next/navigation', () => ({
  useParams: () => ({ groupId: 'g1' }),
  usePathname: () => '/community/g1/for-you',
}));
vi.mock('@/components/layout/app-top-bar', () => ({ useTopBarTitle: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupsApi: { get: vi.fn().mockResolvedValue({ id: 'g1', name: 'Academia Demo' }) },
    forYouApi: { get: vi.fn() },
  };
});

import { forYouApi } from '@fatia/api-client';
import CommunityForYouPage from '../page';

const hoje = new Date().toISOString();
const dados = (p: Partial<ForYou> = {}): ForYou => ({
  count: 2,
  todo: [
    {
      kind: 'PLAN_OFFER',
      id: 'o1',
      title: 'Inferior · versão 2',
      note: 'Trocou 2 exercícios e subiu o descanso para 90 s.',
      from: 'Helena Prado',
      at: hoje,
      href: '/workout/offers/o1',
    },
  ],
  recommended: [
    {
      kind: 'PLAN',
      id: 't1',
      title: 'Full Body Express',
      meta: 'Treino · Bruno',
      href: '/community/g1/content/t1',
    },
  ],
  fromTeam: [{ postId: 'p9', title: 'Feriado na sexta', from: 'Bruno', at: hoje, unread: true }],
  done: [
    {
      kind: 'NUTRITION_PLAN',
      id: 'n1',
      title: 'Plano alimentar · 1800–2000 kcal',
      note: null,
      from: 'Helena Prado',
      at: hoje,
      href: '/nutrition/plan',
    },
  ],
  ...p,
});

function renderPage(v: ForYou) {
  vi.mocked(forYouApi.get).mockResolvedValue(v);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommunityForYouPage />
    </QueryClientProvider>,
  );
}

describe('/community/[groupId]/for-you (prancha Cm-20)', () => {
  afterEach(() => vi.clearAllMocks());

  it('as quatro seções levam às telas que resolvem', async () => {
    renderPage(dados());
    const fazer = await screen.findByRole('region', { name: /Para fazer/ });
    expect(within(fazer).getByRole('link', { name: /Inferior · versão 2/ })).toHaveAttribute(
      'href',
      '/workout/offers/o1',
    );
    expect(within(fazer).getByText(/subiu o descanso/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Recomendado para você' })).getByRole('link', {
        name: /Full Body Express/,
      }),
    ).toHaveAttribute('href', '/community/g1/content/t1');
    const equipe = screen.getByRole('region', { name: 'Da equipe' });
    expect(
      within(equipe).getByRole('link', { name: /Comunicado: Feriado na sexta/ }),
    ).toHaveAttribute('href', '/community/g1#post-p9');
    expect(within(equipe).getByText(/não lido/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Já resolvido' })).getByText(/1800–2000 kcal/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Para você/ })).toHaveAttribute('aria-current', 'page');
  });

  it('sem nada, o vazio explica o que aparece aqui', async () => {
    renderPage(dados({ count: 0, todo: [], recommended: [], fromTeam: [], done: [] }));
    expect(await screen.findByText('Nada para você agora')).toBeInTheDocument();
  });
});

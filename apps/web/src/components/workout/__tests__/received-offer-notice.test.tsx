import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanOfferSummary } from '@fatia/api-client';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, planOffersApi: { ...actual.planOffersApi, list: vi.fn() } };
});

import { planOffersApi } from '@fatia/api-client';
import { ReceivedOfferNotice } from '../received-offer-notice';

const list = vi.mocked(planOffersApi.list);

const summary = (over: Partial<PlanOfferSummary> = {}): PlanOfferSummary => ({
  id: 'o1',
  versionId: 'v1',
  title: 'Inferior',
  version: 1,
  kind: 'new',
  status: 'PENDING',
  schedule: 'CALENDAR',
  authorName: 'Helena Personal',
  groupName: 'Academia Demo',
  sentAt: '2025-11-10T12:12:00.000Z',
  planId: null,
  href: '/workout/offers/o1',
  ...over,
});

function renderNotice() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReceivedOfferNotice />
    </QueryClientProvider>,
  );
}

describe('aviso de plano recebido no Treino (Al-T1)', () => {
  beforeEach(() => list.mockReset());

  it('cada plano esperando resposta vira um aviso que abre o plano', async () => {
    list.mockResolvedValue({
      pending: [
        summary(),
        summary({ id: 'o2', kind: 'update', version: 2, href: '/workout/offers/o2' }),
      ],
      accepted: [],
    });
    renderNotice();
    const nova = await screen.findByRole('link', { name: /Helena enviou um plano/ });
    expect(nova).toHaveAttribute('href', '/workout/offers/o1');
    expect(screen.getByText('Inferior · toque para ver e aceitar')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Helena atualizou um plano.*Inferior v2/ }),
    ).toHaveAttribute('href', '/workout/offers/o2');
    expect(screen.getByText('novo')).toBeInTheDocument();
  });

  it('nada esperando: nada aparece', async () => {
    list.mockResolvedValue({ pending: [], accepted: [summary({ status: 'ACCEPTED' })] });
    const { container } = renderNotice();
    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

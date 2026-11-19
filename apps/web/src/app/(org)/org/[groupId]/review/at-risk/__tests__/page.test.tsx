import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/org/g1/review/at-risk',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    reviewApi: {
      queue: vi.fn(),
      markSeen: vi.fn(),
      atRisk: vi.fn(),
      setRiskDays: vi.fn(),
      setDigest: vi.fn(),
      session: vi.fn(),
      sendFeedback: vi.fn(),
    },
  };
});

import { reviewApi } from '@fatia/api-client';
import { TopBarProvider, useTopBarCurrentTitle } from '@/components/layout/app-top-bar';
import AtRiskPage from '../page';

beforeEach(() => {
  ctx.group = grupo({ id: 'g1', role: 'PROFESSIONAL' });
  vi.mocked(reviewApi.queue).mockResolvedValue({ windowDays: 7, items: [] });
  vi.mocked(reviewApi.atRisk).mockResolvedValue({
    riskDays: 7,
    digest: false,
    canConfigure: false,
    rows: [],
  });
});
afterEach(() => vi.clearAllMocks());

describe('Em risco por caminho próprio (#399, F6)', () => {
  it('é para onde o aviso diário leva: abre já na aba Em risco', async () => {
    renderWithClient(<AtRiskPage />);
    expect(await screen.findByRole('tab', { name: /Em risco/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('Ninguém em risco agora.')).toBeInTheDocument();
  });

  it('a migalha diz "Em risco", não "Detalhe" (passada visual)', async () => {
    function Titulo() {
      return <p data-testid="titulo">{useTopBarCurrentTitle()}</p>;
    }
    renderWithClient(
      <TopBarProvider>
        <Titulo />
        <AtRiskPage />
      </TopBarProvider>,
    );
    expect(await screen.findByTestId('titulo')).toHaveTextContent('Em risco');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnboardingGate } from '../onboarding-gate';

const nav = vi.hoisted(() => ({ replace: vi.fn(), pathname: '/' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
}));
vi.mock('@fatia/api-client', () => ({ usersApi: { me: vi.fn() } }));

import { usersApi } from '@fatia/api-client';

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingGate />
    </QueryClientProvider>,
  );
}

describe('OnboardingGate', () => {
  afterEach(() => {
    vi.clearAllMocks();
    nav.pathname = '/';
  });

  it('manda ao assistente quem ainda não passou por ele', async () => {
    vi.mocked(usersApi.me).mockResolvedValue({ onboardedAt: null } as never);
    renderGate();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding'));
  });

  it('quem chegou por um link volta para ele depois do assistente', async () => {
    nav.pathname = '/community/g1';
    vi.mocked(usersApi.me).mockResolvedValue({ onboardedAt: null } as never);
    renderGate();
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith('/onboarding?next=%2Fcommunity%2Fg1'),
    );
  });

  it('deixa em paz quem já passou', async () => {
    vi.mocked(usersApi.me).mockResolvedValue({ onboardedAt: '2026-10-01T00:00:00Z' } as never);
    renderGate();
    await waitFor(() => expect(usersApi.me).toHaveBeenCalled());
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('erro ao ler o perfil não prende ninguém no assistente', async () => {
    vi.mocked(usersApi.me).mockRejectedValue(new Error('500'));
    renderGate();
    await waitFor(() => expect(usersApi.me).toHaveBeenCalled());
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

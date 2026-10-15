import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomePage from '../page';

/**
 * As metas do dia a um toque do Início. Antes eram três níveis
 * (Progresso → Perfil → Metas) e quem não achava ficava sem meta.
 */

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    usersApi: { me: vi.fn(async () => ({ name: 'Ana' })) },
    progressApi: {
      ...actual.progressApi,
      today: vi.fn(() => new Promise(() => undefined)),
      refreshAchievements: vi.fn(() => new Promise(() => undefined)),
    },
  };
});

describe('Início', () => {
  it('leva às metas do dia', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <HomePage />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('link', { name: 'Metas do dia' })).toHaveAttribute(
      'href',
      '/nutrition/goals',
    );
  });
});

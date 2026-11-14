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

  it('o topo do Hoje tem o sino dos avisos, sozinho: Você é aba (ADR 040, item 4)', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <HomePage />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('link', { name: 'Avisos' })).toHaveAttribute(
      'href',
      '/profile/notifications',
    );
    // O avatar saiu do topo do Hoje: a pessoa chega a Você pela aba.
    expect(screen.queryByRole('link', { name: 'Você' })).toBeNull();
  });
});

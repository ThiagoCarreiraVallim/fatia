import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BottomNav } from '../bottom-nav';

/**
 * A barra nova (ADR 040 revisada, prancha `Al-H6c5`): cinco abas só de ícone —
 * Hoje · Nutrição · Treino · Comunidade · Você — e, separado delas, o botão
 * redondo da IA. Os casos olham os links e botões renderizados, pelo nome
 * acessível: é o que o leitor de tela vê de uma barra sem texto.
 */

const nav = vi.hoisted(() => ({ pathname: '/', push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));

// O menu da IA tem teste próprio (`ai-drawer.test.tsx`); aqui importa que o botão o abre.
const drawer = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn(), isOpen: false }));
vi.mock('../ai-drawer', () => ({ useAiDrawer: () => drawer }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    getChatAvailability: vi.fn(),
    getPendingConversationsCount: vi.fn(),
    listConversations: vi.fn(),
    usersApi: { me: vi.fn() },
    workoutApi: { ...actual.workoutApi, getActiveSession: vi.fn() },
  };
});

import {
  getChatAvailability,
  getPendingConversationsCount,
  listConversations,
  usersApi,
  workoutApi,
} from '@fatia/api-client';

const availability = vi.mocked(getChatAvailability);
const pending = vi.mocked(getPendingConversationsCount);
const activeSession = vi.mocked(workoutApi.getActiveSession);

function renderNav() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BottomNav />
    </QueryClientProvider>,
  );
}

const principal = () => screen.getByRole('navigation', { name: 'Principal' });

describe('BottomNav', () => {
  beforeEach(() => {
    nav.pathname = '/';
    drawer.isOpen = false;
    availability.mockResolvedValue({
      available: true,
      allowed: true,
      reason: 'ok',
      photos: true,
      dictation: true,
    });
    pending.mockResolvedValue({ waiting: 0, thinking: 0 });
    vi.mocked(listConversations).mockResolvedValue([]);
    vi.mocked(usersApi.me).mockResolvedValue({ name: 'Ana Demo' } as never);
    activeSession.mockResolvedValue(null);
  });

  afterEach(() => vi.clearAllMocks());

  it('tem as cinco abas na ordem do canvas, cada uma com nome', async () => {
    renderNav();
    const links = within(await screen.findByRole('navigation', { name: 'Principal' })).getAllByRole(
      'link',
    );
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual([
      'Hoje',
      'Nutrição',
      'Treino',
      'Comunidade',
      'Você',
    ]);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/nutrition',
      '/workout',
      '/community',
      '/you',
    ]);
    // "Mais" e "Registrar" saíram: não há outro botão dentro da barra.
    expect(within(principal()).queryByRole('button')).toBeNull();
  });

  it('a aba ativa tem aria-current, inclusive nas sub-rotas', async () => {
    nav.pathname = '/workout/plans/p1';
    renderNav();
    await screen.findByRole('navigation', { name: 'Principal' });
    expect(screen.getByRole('link', { name: 'Treino' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Hoje' })).not.toHaveAttribute('aria-current');
  });

  it('Perfil e Progresso acendem Você; o painel da equipe acende Comunidade', async () => {
    nav.pathname = '/profile/notifications';
    const { unmount } = renderNav();
    await screen.findByRole('navigation', { name: 'Principal' });
    expect(screen.getByRole('link', { name: 'Você' })).toHaveAttribute('aria-current', 'page');
    unmount();

    nav.pathname = '/org/g1/members';
    renderNav();
    await screen.findByRole('navigation', { name: 'Principal' });
    expect(screen.getByRole('link', { name: 'Comunidade' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('o botão da IA fica fora das abas e abre o menu', async () => {
    renderNav();
    const ia = await screen.findByRole('button', { name: 'Abrir a IA' });
    expect(within(principal()).queryByRole('button', { name: 'Abrir a IA' })).toBeNull();
    await userEvent.setup().click(ia);
    expect(drawer.open).toHaveBeenCalledOnce();
  });

  it('o botão diz quantas conversas esperam, com o selo', async () => {
    pending.mockResolvedValue({ waiting: 2, thinking: 0 });
    renderNav();
    expect(await screen.findByRole('button', { name: 'IA · 2 esperando você' })).toBeVisible();
    expect(screen.getByTestId('ai-fab-badge')).toHaveTextContent('2');
  });

  it('com conversa pensando, o anel liga e o nome diz "trabalhando"', async () => {
    pending.mockResolvedValue({ waiting: 0, thinking: 1 });
    renderNav();
    expect(await screen.findByRole('button', { name: 'IA trabalhando · abrir' })).toBeVisible();
    expect(screen.getByTestId('ai-fab-ring')).toBeInTheDocument();
  });

  it('no Free o botão avisa que a IA é do Pro, e abre o registro do mesmo jeito', async () => {
    availability.mockResolvedValue({
      available: true,
      allowed: false,
      reason: 'plan_required',
      photos: false,
      dictation: false,
    });
    renderNav();
    expect(await screen.findByRole('button', { name: 'Abrir registro (IA no Pro)' })).toBeVisible();
    expect(pending).not.toHaveBeenCalled();
  });

  it.each(['/chat', '/chat/c1', '/nutrition/photo', '/nutrition/scan', '/community/new'])(
    'some na tarefa de foco %s',
    async (path) => {
      nav.pathname = path;
      renderNav();
      await waitFor(() => expect(activeSession).toHaveBeenCalled());
      expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
      expect(screen.queryByRole('button', { name: /IA/ })).toBeNull();
    },
  );

  it('com treino em andamento, a barra do treino aparece acima do menu', async () => {
    nav.pathname = '/nutrition';
    activeSession.mockResolvedValue({
      id: 's1',
      userId: 'u',
      planId: null,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      completedAt: null,
      notes: null,
      sets: [],
      plannedExercises: [],
    });
    renderNav();
    const barra = await screen.findByRole('link', { name: /^Treino em andamento/ });
    expect(barra).toHaveAttribute('href', '/workout');
  });

  it('no /workout com a sessão aberta (a sessão do PWA mora ali), a barra some', async () => {
    nav.pathname = '/workout';
    activeSession.mockResolvedValue({
      id: 's1',
      userId: 'u',
      planId: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      notes: null,
    });
    renderNav();
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull());
  });
});

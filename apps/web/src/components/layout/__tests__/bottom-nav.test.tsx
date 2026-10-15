import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BottomNav } from '../bottom-nav';

/**
 * A barra Início · Nutrição · [ + ] · Treino · Mais. O caso olha os links
 * renderizados, e não o texto do arquivo — asserção que procura identificador
 * no fonte inteiro casa com a linha de `import` e passa sem provar nada.
 */

const pathname = vi.hoisted(() => ({ atual: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.atual }));

// O menu Registrar tem teste próprio (`quick-add.test.tsx`); aqui importa que o "+" o chama.
const quickAdd = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../quick-add', () => ({ useQuickAdd: () => quickAdd }));

vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  };
});

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    getChatAvailability: vi.fn(),
    usersApi: { me: vi.fn() },
  };
});

import { getChatAvailability, usersApi } from '@fatia/api-client';

const availability = vi.mocked(getChatAvailability);
const me = vi.mocked(usersApi.me);

function renderNav() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BottomNav />
    </QueryClientProvider>,
  );
}

function hrefs(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole('link')
    .map((a) => a.getAttribute('href') ?? '');
}

async function abrirMais() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Mais' }));
  return screen.getByRole('dialog');
}

describe('BottomNav', () => {
  beforeEach(() => {
    pathname.atual = '/';
    availability.mockResolvedValue({ available: false } as never);
    me.mockResolvedValue({ name: 'Ana Demo' } as never);
  });

  afterEach(() => vi.clearAllMocks());

  it('tem Início, Nutrição e Treino, com o Registrar no meio e o Mais no fim', () => {
    renderNav();
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(hrefs(nav)).toEqual(['/', '/nutrition', '/workout']);
    const botoes = within(nav)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(botoes).toEqual(['Registrar', 'Mais']);
  });

  it('o "+" abre o menu Registrar', async () => {
    renderNav();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Registrar' }));
    expect(quickAdd.open).toHaveBeenCalledTimes(1);
  });

  it('marca a aba da rota atual, inclusive nas sub-rotas', () => {
    pathname.atual = '/nutrition/foods';
    renderNav();
    expect(screen.getByRole('link', { name: 'Nutrição' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current');
  });

  it('numa tela que não está na barra, o Mais fica ativo', () => {
    pathname.atual = '/progress';
    renderNav();
    expect(screen.getByText('Mais')).toHaveClass('text-primary');
    for (const nome of ['Início', 'Nutrição', 'Treino']) {
      expect(screen.getByRole('link', { name: nome })).not.toHaveAttribute('aria-current');
    }
  });

  it('o Mais abre o menu com o perfil e as metas no primeiro nível', async () => {
    renderNav();
    const menu = await abrirMais();
    expect(await within(menu).findByText('Ana Demo')).toBeInTheDocument();
    const links = hrefs(menu);
    expect(links[0]).toBe('/profile');
    expect(links).toEqual(
      expect.arrayContaining(['/progress', '/nutrition/goals', '/goals', '/profile/connect']),
    );
  });

  it('sem IA na instância, o menu não oferece o chat', async () => {
    renderNav();
    const menu = await abrirMais();
    await within(menu).findByText('Ana Demo');
    expect(hrefs(menu)).not.toContain('/chat');
  });

  it('no Free, o chat aparece com cadeado e selo PRO e leva ao plano', async () => {
    availability.mockResolvedValue({
      available: true,
      allowed: false,
      reason: 'plan_required',
    } as never);
    renderNav();
    const menu = await abrirMais();
    const chat = await within(menu).findByRole('link', { name: /Chat/ });
    expect(chat).toHaveAttribute('href', '/plan?recurso=chat');
    expect(chat).toHaveTextContent(/PRO/);
    expect(chat).toHaveTextContent(/exige o plano PRO/);
  });

  it('com IA disponível, o chat entra no menu', async () => {
    availability.mockResolvedValue({ available: true } as never);
    renderNav();
    const menu = await abrirMais();
    expect(await within(menu).findByRole('link', { name: /Chat/ })).toHaveAttribute(
      'href',
      '/chat',
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { todaySummary } from '@/components/today/__tests__/fixture';
import { DemoSessionToday } from '../demo-session-today';

/**
 * "Abrir no app como Ana Exemplo" (#412): a tela Hoje da aluna fictícia, só
 * leitura, pelo token curto da demo. Nada aqui usa a sessão de quem abriu.
 */

const TOKEN = 'fatia_demo_abcdefghijklmnopqrstuvwxyz012345';
const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderToday() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DemoSessionToday token={TOKEN} />
    </QueryClientProvider>,
  );
}

describe('Hoje da Ana Exemplo', () => {
  it('lê pelo proxy da demo com o token e mostra a Ana, com a faixa', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/api/demo/users/me')
          ? json({ id: 'ana', name: 'Ana Exemplo', email: 'x@demo.fatia.invalid' })
          : json(todaySummary()),
      ),
    );
    renderToday();
    expect(await screen.findByText(/Olá, Ana/)).toBeTruthy();
    expect(screen.getByText('Demonstração · dados fictícios')).toBeTruthy();
    expect(screen.getByText(/só leitura/i)).toBeTruthy();
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => u.startsWith('/api/demo/'))).toBe(true);
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(new Headers(init.headers).get('x-fatia-demo')).toBe(TOKEN);
      expect(init.method ?? 'GET').toBe('GET');
    }
  });

  it('os cartões não levam ao app de quem abriu: tudo fica inerte', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/api/demo/users/me')
          ? json({ id: 'ana', name: 'Ana Exemplo' })
          : json(todaySummary()),
      ),
    );
    const { container } = renderToday();
    await screen.findByText(/Olá, Ana/);
    const cards = container.querySelector('[data-demo-cards]');
    expect(cards?.hasAttribute('inert')).toBe(true);
  });

  it('com o token vencido, explica e não mostra dado nenhum', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Unauthorized' }, 401));
    renderToday();
    await waitFor(() => expect(screen.getByText(/link da demonstração venceu/i)).toBeTruthy());
    expect(screen.queryByText(/Olá, Ana/)).toBeNull();
  });
});

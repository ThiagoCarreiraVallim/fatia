import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * O proxy da sessão de demonstração (#412): "Abrir no app como Ana Exemplo".
 *
 * Ele não usa a sessão do Logto de quem abriu: repassa só o token curto da
 * demo, só em leitura e só para as rotas da tela Hoje. A API barra de novo
 * (o token só vale em rota `@DemoReadable`), mas o proxy não é um túnel aberto.
 */

const route = await import('../[...path]/route');

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

const TOKEN = 'fatia_demo_abcdefghijklmnopqrstuvwxyz012345';
const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
const pedido = (path: string, token: string | null, method = 'GET') =>
  new NextRequest(`http://localhost:3142/api/demo/${path}`, {
    method,
    headers: token ? { 'x-fatia-demo': token, cookie: 'logto=sessao-da-dona' } : {},
  });

describe('proxy da demo', () => {
  it('lê a tela Hoje com o token da demo, sem o cookie de quem abriu', async () => {
    const res = await route.GET(pedido('dashboard/today', TOKEN), ctx(['dashboard', 'today']));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/dashboard\/today$/);
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('cookie')).toBeNull();
    expect(init.method).toBe('GET');
  });

  it('só as rotas da tela Hoje: o resto nem sai daqui', async () => {
    for (const path of [
      'groups',
      'users/me/export',
      'users/me/inbox',
      'chat',
      'meals',
      '../admin',
    ]) {
      const res = await route.GET(pedido(path, TOKEN), ctx(path.split('/')));
      expect(res.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem token de demo, 401; token de outra coisa também', async () => {
    expect((await route.GET(pedido('users/me', null), ctx(['users', 'me']))).status).toBe(401);
    expect(
      (await route.GET(pedido('users/me', 'eyJhbGciOi.jwt.qualquer'), ctx(['users', 'me']))).status,
    ).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não escreve: só existe GET', () => {
    expect(Object.keys(route).filter((k) => /^[A-Z]+$/.test(k))).toEqual(['GET']);
  });
});

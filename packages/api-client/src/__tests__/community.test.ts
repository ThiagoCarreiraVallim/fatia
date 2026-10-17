import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupsApi } from '../community';
import { configureApiClient, resetApiClient } from '../http';

const fetchMock = vi.fn();

/** O que o cliente pediu: método, caminho e corpo já lido. */
function pedido(i = 0) {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return {
    method: init.method ?? 'GET',
    url,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

const NADA = { scopes: [], statsOptIn: false };

describe('groupsApi', () => {
  beforeEach(() => {
    configureApiClient({ resolveUrl: (path) => path, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    fetchMock.mockReset();
    resetApiClient();
  });

  it('entra pelo código levando o consentimento escolhido', async () => {
    await groupsApi.join('academia-x', { scopes: ['WORKOUT'], statsOptIn: true });
    expect(pedido()).toEqual({
      method: 'POST',
      url: '/api/groups/join',
      body: { slug: 'academia-x', scopes: ['WORKOUT'], statsOptIn: true },
    });
  });

  it('vê e aceita o convite pelo token, codificado no caminho', async () => {
    await groupsApi.previewInvite('a/b');
    await groupsApi.acceptInvite('tok_-1', NADA);
    expect(pedido(0)).toEqual({ method: 'GET', url: '/api/groups/invites/a%2Fb', body: undefined });
    expect(pedido(1)).toEqual({
      method: 'POST',
      url: '/api/groups/invites/tok_-1/accept',
      body: NADA,
    });
  });

  it('reescreve o consentimento e sai pela rota própria', async () => {
    await groupsApi.setConsent('g1', { scopes: ['GOALS'], statsOptIn: false });
    await groupsApi.leave('g1');
    expect(pedido(0)).toEqual({
      method: 'PUT',
      url: '/api/groups/g1/consent',
      body: { scopes: ['GOALS'], statsOptIn: false },
    });
    expect(pedido(1)).toEqual({
      method: 'DELETE',
      url: '/api/groups/g1/members/me',
      body: undefined,
    });
  });

  it('pede o registro de acessos da comunidade, ou o inteiro', async () => {
    await groupsApi.accessLog({ groupId: 'g1', limit: 20 });
    await groupsApi.accessLog();
    expect(pedido(0).url).toBe('/api/sharing/access-log?groupId=g1&limit=20');
    expect(pedido(1).url).toBe('/api/sharing/access-log');
  });

  it('procura a comunidade pelo código com o código codificado', async () => {
    await groupsApi.previewBySlug('a b');
    expect(pedido().url).toBe('/api/groups/preview?slug=a%20b');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_KEY_SCOPE_LABEL,
  API_KEYS_HINT,
  INTEGRATION_RECIPES,
  apiKeyMask,
  apiKeyNameError,
  apiKeysApi,
  quotaHint,
  quotaLabel,
  quotaPercent,
  quotaRenewsLabel,
  recipeSteps,
  type ApiQuota,
} from '../community-integrations';
import { configureApiClient, resetApiClient } from '../http';

const fetchMock = vi.fn();
const pedido = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return {
    method: init.method ?? 'GET',
    url,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
};

const cota = (used: number, extra: Partial<ApiQuota> = {}): ApiQuota => ({
  month: '2026-11',
  used,
  limit: 10_000,
  renewsOn: '2026-12-01',
  state: used >= 10_000 ? 'limit' : used >= 9_000 ? 'near' : 'ok',
  ...extra,
});

describe('integrações e API no cliente (#413, Pn-38)', () => {
  beforeEach(() => {
    configureApiClient({ resolveUrl: (path) => path, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    fetchMock.mockReset();
    resetApiClient();
  });

  it('lista, cria e revoga pela rota da comunidade', async () => {
    await apiKeysApi.list('g1');
    await apiKeysApi.create('g1', { name: 'Zapier' });
    await apiKeysApi.create('g1', { name: 'Planilha', scopes: ['MEMBERS'] });
    await apiKeysApi.revoke('g1', 'k1');
    expect(pedido(0)).toMatchObject({ method: 'GET', url: '/api/groups/g1/api-keys' });
    expect(pedido(1)).toEqual({
      method: 'POST',
      url: '/api/groups/g1/api-keys',
      body: { name: 'Zapier' },
    });
    expect(pedido(2).body).toEqual({ name: 'Planilha', scopes: ['MEMBERS'] });
    expect(pedido(3)).toMatchObject({ method: 'DELETE', url: '/api/groups/g1/api-keys/k1' });
  });

  it('a chave aparece só pelos 4 últimos', () => {
    expect(apiKeyMask('8f2a')).toBe('fatia_live_…8f2a');
  });

  it('o nome da chave: obrigatório e curto', () => {
    expect(apiKeyNameError('')).toBe('Dê um nome à chave');
    expect(apiKeyNameError('   ')).toBe('Dê um nome à chave');
    expect(apiKeyNameError('x'.repeat(61))).toBe('Até 60 caracteres');
    expect(apiKeyNameError('Zapier')).toBeNull();
  });

  it('o que cada acesso lê, sem dado de saúde', () => {
    expect(API_KEY_SCOPE_LABEL).toEqual({
      INVITES: 'Convites',
      MEMBERS: 'Membros (nome e papel)',
      SENDS: 'Envios',
    });
  });

  it('o aviso não promete dado de saúde: a chave nunca lê, nem com consentimento', () => {
    expect(API_KEYS_HINT).toMatch(/Dados de saúde nunca saem pelas chaves/);
    expect(API_KEYS_HINT).not.toMatch(/consentimento/);
  });

  it('a cota do mês: número com milhar, barra, renovação e o aviso perto do fim', () => {
    expect(quotaLabel(cota(3210))).toBe('3.210 de 10.000');
    expect(quotaPercent(cota(3210))).toBe(32);
    expect(quotaPercent(cota(9840))).toBe(98);
    expect(quotaPercent(cota(12_000))).toBe(100);
    expect(quotaPercent(cota(0, { limit: 0 }))).toBe(100);
    expect(quotaRenewsLabel(cota(1))).toBe('renova 1 dez');
    expect(quotaHint(cota(3210))).toBe('chamadas de API neste mês');
    expect(quotaHint(cota(9840))).toBe(
      'Quase no limite. Ao chegar, as chamadas pausam até 1 dez; nada no app muda.',
    );
    expect(quotaHint(cota(10_000))).toBe(
      'A cota do mês acabou. As chamadas pausam até 1 dez; nada no app muda.',
    );
  });

  it('as três receitas da prancha, cada uma com a rota que usa', () => {
    expect(INTEGRATION_RECIPES.map((r) => [r.tool, r.title, r.body, r.path])).toEqual([
      [
        'Zapier',
        'Novo membro → planilha',
        'Cada pessoa que entra vira uma linha (nome, origem, data).',
        '/integrations/v1/members',
      ],
      [
        'Make',
        'Convite sem aceite → WhatsApp',
        'Depois de 2 dias, manda lembrete pelo seu número.',
        '/integrations/v1/invites?pending=true',
      ],
      [
        'Zapier',
        'Programa vendido → e-mail de boas-vindas',
        'Quando alguém compra uma oferta.',
        '/integrations/v1/sends?kind=PROGRAM_SALE',
      ],
    ]);
    for (const r of INTEGRATION_RECIPES) expect(r.url).toMatch(/^https:\/\//);
  });

  it('o passo a passo leva a URL inteira e o cabeçalho, nunca a chave', () => {
    const passos = recipeSteps(INTEGRATION_RECIPES[0]!, 'https://api.fatia.app');
    const texto = passos.join('\n');
    expect(texto).toContain('https://api.fatia.app/integrations/v1/members');
    expect(texto).toContain('Authorization: Bearer');
    expect(texto).not.toMatch(/fatia_live_[A-Za-z0-9]/);
    expect(passos.length).toBeGreaterThanOrEqual(3);
  });
});

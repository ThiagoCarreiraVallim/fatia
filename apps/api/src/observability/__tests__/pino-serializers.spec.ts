import { serializeRequest, serializeResponse } from '../pino-serializers';

/**
 * Antes desta issue o log ficava só no `docker logs` do host. Agora ele é enviado ao Loki, e o
 * serializador padrão do `pino-http` mandava junto **todos os cabeçalhos** — `authorization`
 * incluído — e a URL com query string.
 */
describe('serializeRequest', () => {
  it('não emite cabeçalho nenhum: o token de acesso vinha em `authorization`', () => {
    const saida = serializeRequest({
      id: 1,
      method: 'GET',
      url: '/api/nutrition/meals',
      // Campos que o objeto real do Node traz e que o serializador não pode propagar.
      ...{ headers: { authorization: 'Bearer token-de-verdade', cookie: 'session=abc' } },
    });

    expect(Object.keys(saida).sort()).toEqual(['id', 'method', 'path']);
    expect(JSON.stringify(saida)).not.toContain('token-de-verdade');
  });

  it('grava o caminho sem a query string', () => {
    const saida = serializeRequest({
      id: 2,
      method: 'GET',
      url: '/api/nutrition/foods?search=whey%20isolado&peso=87.4',
    });

    expect(saida.path).toBe('/api/nutrition/foods');
    expect(JSON.stringify(saida)).not.toContain('whey');
  });
});

describe('serializeResponse', () => {
  it('emite só o status', () => {
    expect(serializeResponse({ statusCode: 503 })).toEqual({ statusCode: 503 });
  });
});

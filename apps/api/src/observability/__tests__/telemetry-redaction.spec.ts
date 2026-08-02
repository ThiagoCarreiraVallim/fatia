import type { Attributes } from '@opentelemetry/api';
import { REDACTED_VALUE, redactSpanAttributes, stripQueryString } from '../telemetry-redaction';

describe('stripQueryString', () => {
  it('corta a query e o fragmento, mantendo o caminho', () => {
    expect(stripQueryString('/api/nutrition/foods?search=whey&limit=10')).toBe(
      '/api/nutrition/foods',
    );
    expect(stripQueryString('https://api.fat.ia.br/api/meals?date=2026-08-02')).toBe(
      'https://api.fat.ia.br/api/meals',
    );
    expect(stripQueryString('/api/meals#ancora')).toBe('/api/meals');
  });

  it('devolve o valor intacto quando não há query', () => {
    expect(stripQueryString('/api/nutrition/foods')).toBe('/api/nutrition/foods');
  });
});

describe('redactSpanAttributes', () => {
  it('remove a query string crua que a instrumentação de HTTP preenche por padrão', () => {
    // Este é o comportamento pronto de fábrica do OTel e o motivo de todo este módulo existir:
    // `url.query` chega com o que o usuário digitou.
    const attributes: Attributes = {
      'http.request.method': 'GET',
      'http.route': '/api/nutrition/foods',
      'url.path': '/api/nutrition/foods',
      'url.query': 'search=whey%20isolado&peso=87.4',
    };

    redactSpanAttributes(attributes);

    expect(attributes['url.query']).toBeUndefined();
    // O que serve para diagnosticar continua lá.
    expect(attributes['http.route']).toBe('/api/nutrition/foods');
    expect(attributes['url.path']).toBe('/api/nutrition/foods');
  });

  it('corta a query dos atributos de URL completa, sem perder o caminho', () => {
    const attributes: Attributes = {
      'url.full': 'https://api.fat.ia.br/api/nutrition/foods?search=pizza',
      'http.url': 'https://api.fat.ia.br/api/meals?date=2026-08-02',
      'http.target': '/api/workout/sessions?carga=120',
    };

    redactSpanAttributes(attributes);

    expect(attributes['url.full']).toBe('https://api.fat.ia.br/api/nutrition/foods');
    expect(attributes['http.url']).toBe('https://api.fat.ia.br/api/meals');
    expect(attributes['http.target']).toBe('/api/workout/sessions');
  });

  it('remove cabeçalhos, que carregam o token de acesso inteiro', () => {
    const attributes: Attributes = {
      'http.request.header.authorization': 'Bearer eyJhbGciOi.token.real',
      'http.request.header.cookie': 'session=abc',
      'http.response.header.set-cookie': 'session=def',
      'http.request.method': 'POST',
    };

    redactSpanAttributes(attributes);

    expect(Object.keys(attributes)).toEqual(['http.request.method']);
  });

  it('remove statement de banco e endereço de rede', () => {
    const attributes: Attributes = {
      'db.statement': 'SELECT "name" FROM "Food" WHERE "name" ILIKE \'%whey%\'',
      'db.query.text': 'SELECT * FROM "Meal"',
      'client.address': '203.0.113.7',
      'network.peer.address': '10.0.0.4',
      'db.system': 'postgresql',
    };

    redactSpanAttributes(attributes);

    expect(Object.keys(attributes)).toEqual(['db.system']);
  });

  it('redige e-mail em qualquer atributo — a rede final contra quem acrescentar um campo novo', () => {
    const attributes: Attributes = { 'enduser.id': 'fulano@exemplo.com.br' };

    redactSpanAttributes(attributes);

    expect(attributes['enduser.id']).toBe(REDACTED_VALUE);
  });

  it('não mexe em atributo não sensível nem em valor não-string', () => {
    const attributes: Attributes = {
      'http.response.status_code': 200,
      'http.route': '/api/nutrition/meals/:id',
      'nestjs.controller': 'MealController',
    };

    redactSpanAttributes(attributes);

    expect(attributes).toEqual({
      'http.response.status_code': 200,
      'http.route': '/api/nutrition/meals/:id',
      'nestjs.controller': 'MealController',
    });
  });
});

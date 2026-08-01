import { describe, expect, it, vi } from 'vitest';
import { webTransport } from '../api-transport';

/**
 * O comportamento genérico do cliente HTTP é testado em `@fatia/api-client`.
 * Aqui fica só o que é do PWA: o rewrite para o proxy do Next e o envio do
 * cookie de sessão — o conhecimento que a issue #119 exige que NÃO suba para o
 * pacote compartilhado, porque o app nativo faria a coisa errada com ele.
 */
describe('webTransport', () => {
  it('reescreve /api/* para o proxy do Next, preservando a query', () => {
    expect(webTransport.resolveUrl('/api/nutrition/summary?date=2026-05-19')).toBe(
      '/api/proxy/nutrition/summary?date=2026-05-19',
    );
  });

  it('deixa passar caminhos que não são da API', () => {
    expect(webTransport.resolveUrl('/api/logto/sign-in')).toBe('/api/proxy/logto/sign-in');
    expect(webTransport.resolveUrl('/qualquer-outra')).toBe('/qualquer-outra');
  });

  it('manda o cookie de sessão — é dele que o proxy tira o access token', () => {
    expect(webTransport.requestInit?.()).toEqual({ credentials: 'include' });
  });

  it('não injeta Authorization: no PWA o token nunca chega ao navegador', () => {
    expect(webTransport.headers).toBeUndefined();
  });

  it('no 401 apenas registra diagnóstico, sem redirecionar', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    webTransport.onUnauthorized?.({ path: '/api/foo', body: { source: 'proxy-no-token' } });
    expect(spy).toHaveBeenCalledWith(
      '[apiFetch] 401 — sessão pode ter expirado',
      expect.objectContaining({ hint: expect.stringContaining('LOGTO_AUDIENCE') }),
    );
    spy.mockRestore();
  });
});

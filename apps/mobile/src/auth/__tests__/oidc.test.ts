import { describe, expect, it, vi } from 'vitest';
import { memoizeDiscovery, type OidcEndpoints } from '../oidc';

/**
 * O cache da descoberta OIDC guarda o sucesso e **não** guarda a falha.
 *
 * Antes da #187 isto vivia num `useRef` dentro do `AuthProvider`; a conversão o
 * levou para o escopo do módulo, onde o defeito que já existia ficou mais
 * grudento: o provider é raiz e não desmonta, então uma promise rejeitada
 * memorizada não some mais durante a execução do app. Rede caída no primeiro
 * toque em "Entrar" travaria o login até fechar o app.
 */
const ENDPOINTS: OidcEndpoints = {
  authorizationEndpoint: 'https://logto.exemplo/oidc/auth',
  tokenEndpoint: 'https://logto.exemplo/oidc/token',
  endSessionEndpoint: null,
  userinfoEndpoint: null,
};

describe('memoizeDiscovery', () => {
  it('faz uma descoberta só quando dá certo', async () => {
    const load = vi.fn().mockResolvedValue(ENDPOINTS);
    const endpoints = memoizeDiscovery(load);

    await expect(endpoints()).resolves.toBe(ENDPOINTS);
    await expect(endpoints()).resolves.toBe(ENDPOINTS);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('não guarda a rejeição: a tentativa seguinte vai à rede de novo', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('rede caiu')).mockResolvedValue(ENDPOINTS);
    const endpoints = memoizeDiscovery(load);

    await expect(endpoints()).rejects.toThrow('rede caiu');
    // Sem o `catch` que limpa o cache, esta chamada devolveria a **mesma**
    // promise rejeitada e o login nunca mais voltaria nesta execução do app.
    await expect(endpoints()).resolves.toBe(ENDPOINTS);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('as chamadas paralelas durante a falha compartilham a mesma tentativa', async () => {
    const load = vi.fn().mockRejectedValue(new Error('rede caiu'));
    const endpoints = memoizeDiscovery(load);

    const [a, b] = await Promise.allSettled([endpoints(), endpoints()]);
    expect(a.status).toBe('rejected');
    expect(b.status).toBe('rejected');
    // Duas telas pedindo ao mesmo tempo não podem virar duas idas à rede — o que
    // se limpa é o cache **depois** da falha, não a coalescência durante ela.
    expect(load).toHaveBeenCalledTimes(1);
  });
});

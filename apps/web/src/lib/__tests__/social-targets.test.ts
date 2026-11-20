import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSocialTargets } from '../social-targets';

describe('loadSocialTargets', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lê os conectores da página pública do Logto', async () => {
    vi.stubEnv('LOGTO_ENDPOINT', 'https://auth.example.com/');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ socialConnectors: [{ id: 'x', target: 'apple' }] })),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadSocialTargets()).resolves.toEqual(['apple']);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://auth.example.com/api/.well-known/sign-in-exp',
    );
  });

  it('com o Logto fora do ar, nenhum botão social', async () => {
    vi.stubEnv('LOGTO_ENDPOINT', 'https://auth.example.com');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(loadSocialTargets()).resolves.toEqual([]);
  });
});

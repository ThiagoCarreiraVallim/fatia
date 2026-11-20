import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { base64ToBase64Url, bytesToBase64Url, makePkce } from '../pkce';
import { revokeToken } from '../oidc';

describe('PKCE', () => {
  it('converte base64 para base64url sem padding', () => {
    expect(base64ToBase64Url('ab+c/d==')).toBe('ab-c_d');
  });

  it('codifica bytes em base64url', () => {
    expect(bytesToBase64Url(new Uint8Array([251, 255, 191]))).toBe('-_-_');
  });

  it('gera verifier aleatório e challenge = SHA-256(verifier) em base64url', async () => {
    const pkce = await makePkce({
      randomBytes: (n) => new Uint8Array(n).fill(7),
      sha256Base64: async (s) => createHash('sha256').update(s).digest('base64'),
    });
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pkce.challenge).toBe(createHash('sha256').update(pkce.verifier).digest('base64url'));
    expect(pkce.state).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  });
});

describe('revokeToken', () => {
  it('revoga o refresh token como cliente público', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await revokeToken(
      'https://logto/oidc/token/revocation',
      { clientId: 'app', token: 'rt' },
      fetchImpl as unknown as typeof fetch,
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://logto/oidc/token/revocation');
    expect(String(init.body)).toBe('token=rt&token_type_hint=refresh_token&client_id=app');
  });
});

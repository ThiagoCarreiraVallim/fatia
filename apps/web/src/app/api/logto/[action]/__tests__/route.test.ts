import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleSignInClient = vi.fn();
const handleSignInCallback = vi.fn();

vi.mock('@logto/next/server-actions', () => ({
  default: class {
    handleSignIn = handleSignInClient;
    handleSignOut = vi.fn();
  },
  handleSignIn: (...args: unknown[]) => handleSignInCallback(...args),
}));
vi.mock('@/lib/logto', () => ({ logtoConfig: { baseUrl: 'http://localhost:3030' } }));

import { GET } from '../route';

const ctx = (action: string) => ({ params: Promise.resolve({ action }) });

describe('/api/logto/[action]', () => {
  beforeEach(() => {
    handleSignInClient.mockResolvedValue({ url: 'http://logto.local/sign-in' });
    handleSignInCallback.mockResolvedValue(undefined);
  });

  it('guarda o retorno do login num cookie curto, só se for caminho do app', async () => {
    const ok = await GET(
      new NextRequest('http://localhost:3030/api/logto/sign-in?next=/c/tok'),
      ctx('sign-in'),
    );
    const cookie = ok.cookies.get('fatia_next');
    expect(cookie?.value).toBe('/c/tok');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.maxAge).toBe(600);

    const fora = await GET(
      new NextRequest('http://localhost:3030/api/logto/sign-in?next=//evil.example'),
      ctx('sign-in'),
    );
    expect(fora.cookies.get('fatia_next')?.value).toBeFalsy();
  });

  it('o callback volta para o caminho guardado e apaga o cookie', async () => {
    const req = new NextRequest('http://localhost:3030/api/logto/callback?code=x&state=y');
    req.cookies.set('fatia_next', '/c/tok');
    const res = await GET(req, ctx('callback'));
    expect(res.headers.get('location')).toBe('http://localhost:3030/c/tok');
    expect(res.cookies.get('fatia_next')?.value).toBe('');
  });

  it('sem cookie, ou com um caminho de fora, o callback vai ao Início', async () => {
    const sem = await GET(
      new NextRequest('http://localhost:3030/api/logto/callback?code=x'),
      ctx('callback'),
    );
    expect(sem.headers.get('location')).toBe('http://localhost:3030/');

    const req = new NextRequest('http://localhost:3030/api/logto/callback?code=x');
    req.cookies.set('fatia_next', 'https://evil.example');
    const fora = await GET(req, ctx('callback'));
    expect(fora.headers.get('location')).toBe('http://localhost:3030/');
  });

  it('Google e Apple entram direto pelo conector social (#371)', async () => {
    await GET(
      new NextRequest('http://localhost:3030/api/logto/sign-in?social=apple'),
      ctx('sign-in'),
    );
    expect(handleSignInClient).toHaveBeenLastCalledWith(
      expect.objectContaining({ directSignIn: { method: 'social', target: 'apple' } }),
    );

    // Fora da lista fechada, ignora.
    await GET(
      new NextRequest('http://localhost:3030/api/logto/sign-in?social=evil'),
      ctx('sign-in'),
    );
    expect(handleSignInClient.mock.lastCall?.[0]).not.toHaveProperty('directSignIn');
  });

  it('o e-mail digitado vai como login_hint, e o nome num cookie curto para o perfil', async () => {
    const res = await GET(
      new NextRequest(
        'http://localhost:3030/api/logto/sign-in?tela=cadastro&email=ana%40email.com&nome=%20Ana%20%20Demo%20',
      ),
      ctx('sign-in'),
    );
    expect(handleSignInClient).toHaveBeenLastCalledWith(
      expect.objectContaining({ firstScreen: 'register', loginHint: 'ana@email.com' }),
    );
    const nome = res.cookies.get('fatia_signup_name');
    expect(nome?.value).toBe('Ana Demo');
    // A tela do onboarding lê e apaga: não pode ser httpOnly.
    expect(nome?.httpOnly).toBeFalsy();
    expect(nome?.maxAge).toBe(600);

    await GET(
      new NextRequest('http://localhost:3030/api/logto/sign-in?email=sem-arroba'),
      ctx('sign-in'),
    );
    expect(handleSignInClient.mock.lastCall?.[0]).not.toHaveProperty('loginHint');
  });
});

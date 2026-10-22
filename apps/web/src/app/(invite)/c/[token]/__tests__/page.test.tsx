import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: async () => auth.user }));
vi.mock('@/components/community/invite', () => ({
  INVITE_UNAVAILABLE: 'Este convite não pode ser usado.',
  InviteAccept: () => <p>aceitar</p>,
  InviteSignedOut: () => <p>entrar para aceitar</p>,
}));

import InvitePage from '../page';

const TOKEN = 'a'.repeat(43);
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

async function renderPage(token = TOKEN) {
  render(await InvitePage({ params: Promise.resolve({ token }) }));
}

describe('/c/[token]', () => {
  afterEach(() => {
    vi.clearAllMocks();
    auth.user = null;
  });

  it('token fora do formato nem vai à API e mostra a mensagem neutra', async () => {
    await renderPage('curto');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Convite indisponível' })).toBeInTheDocument();
  });

  it('404 da API dá a mesma mensagem neutra', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    await renderPage();
    expect(fetchMock.mock.calls[0][0]).toBe(`http://localhost:3000/api/groups/invites/${TOKEN}`);
    expect(screen.getByText('Este convite não pode ser usado.')).toBeInTheDocument();
  });

  it('sem sessão mostra o cartão para entrar; com sessão, o aceite', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ group: { name: 'X' } }), { status: 200 })),
    );
    await renderPage();
    expect(screen.getByText('entrar para aceitar')).toBeInTheDocument();

    auth.user = { id: 'u1' };
    await renderPage();
    expect(screen.getByText('aceitar')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'fatia.app', 'x-forwarded-proto': 'https' }),
}));

import PosterPage from '../page';

const TOKEN = 'b'.repeat(43);
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

async function renderPage(token = TOKEN) {
  render(await PosterPage({ params: Promise.resolve({ token }) }));
}

/** O cartaz A4 do QR de convite (#372, Onb-C4). */
describe('/cartaz/[token]', () => {
  afterEach(() => vi.clearAllMocks());

  it('o nome da comunidade, o QR do link e o botão de imprimir; sem o nome do QR', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          group: { id: 'g1', name: 'Academia Demo', brandColor: '#ff7a1a' },
          role: 'MEMBER',
        }),
        { status: 200 },
      ),
    );
    await renderPage();
    expect(screen.getByRole('heading', { name: 'Academia Demo no Fatia' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: `QR do link https://fatia.app/c/${TOKEN}` }),
    ).toBeVisible();
    expect(screen.getByText('Aponte a câmera para entrar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimir ou salvar em PDF' })).toBeInTheDocument();
  });

  it('convite que não vale: a mensagem neutra, sem QR', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    await renderPage();
    expect(screen.getByRole('heading', { name: 'Convite indisponível' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('convite da equipe não vira cartaz', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ group: { id: 'g1', name: 'X' }, role: 'PROFESSIONAL' }), {
        status: 200,
      }),
    );
    await renderPage();
    expect(screen.getByRole('heading', { name: 'Convite indisponível' })).toBeInTheDocument();
  });
});

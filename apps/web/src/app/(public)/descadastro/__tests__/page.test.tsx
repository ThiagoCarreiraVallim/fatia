import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sub = vi.hoisted(() => ({ fetch: vi.fn(), set: vi.fn() }));
vi.mock('@/lib/announcement-subscription', () => ({
  fetchAnnouncementSubscription: sub.fetch,
  setAnnouncementSubscription: sub.set,
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import AnnouncementUnsubscribePage from '../page';

async function abrir(params: Record<string, string>) {
  render(await AnnouncementUnsubscribePage({ searchParams: Promise.resolve(params) }));
}

describe('/descadastro (#398)', () => {
  afterEach(() => vi.clearAllMocks());

  it('link inválido só quando a API diz 400', async () => {
    sub.fetch.mockResolvedValue({ kind: 'invalid' });
    await abrir({ t: 'x' });
    expect(screen.getByRole('heading', { name: 'Link inválido' })).toBeInTheDocument();
  });

  it('API sem fôlego (429/5xx) pede para tentar de novo, sem dizer que o link é ruim', async () => {
    sub.fetch.mockResolvedValue({ kind: 'unavailable' });
    await abrir({ t: 'x' });
    expect(screen.getByRole('heading', { name: 'Não deu agora' })).toBeInTheDocument();
    expect(screen.getByText(/tente de novo/i)).toBeInTheDocument();
    expect(screen.queryByText('Link inválido')).toBeNull();
  });

  it('quem recebe vê o botão de parar', async () => {
    sub.fetch.mockResolvedValue({ kind: 'ok', subscribed: true });
    await abrir({ t: 'x' });
    expect(screen.getByRole('button', { name: 'Não receber mais por e-mail' })).toBeInTheDocument();
  });

  it('o botão que falhou por limite diz para tentar de novo', async () => {
    sub.fetch.mockResolvedValue({ kind: 'ok', subscribed: true });
    await abrir({ t: 'x', erro: '1' });
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu agora. Tente de novo.');
  });
});

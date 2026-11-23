import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup, PanelNewsFeed } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    panelNewsApi: { list: vi.fn(), markRead: vi.fn() },
    ideasApi: { send: vi.fn() },
  };
});

import { ideasApi, panelNewsApi } from '@fatia/api-client';
import { toast } from 'sonner';
import PanelUpdatesPage from '../page';

const feed = (unread: boolean): PanelNewsFeed => ({
  items: [
    {
      id: 'painel-integracoes',
      date: '2026-11-23',
      title: 'Integrações e API',
      body: 'Crie uma chave e ligue o Fatia ao Zapier ou ao Make.',
      icon: 'link',
      section: 'integrations',
      unread,
    },
    {
      id: 'painel-equipe',
      date: '2026-11-20',
      title: 'Equipe e permissões',
      body: 'Papéis de dono, admin, profissional e recepção.',
      icon: 'users',
      section: 'team',
      unread: false,
    },
  ],
  unreadCount: unread ? 1 : 0,
});

function abrir(f: PanelNewsFeed = feed(true)) {
  ctx.group = grupo();
  vi.mocked(panelNewsApi.list).mockResolvedValue(f);
  return renderWithClient(<PanelUpdatesPage />);
}

describe('painel › novidades (#413, Pn-27)', () => {
  afterEach(() => vi.clearAllMocks());

  it('lista com "novo", o contador e o link para a seção', async () => {
    abrir();
    expect(screen.getByRole('heading', { level: 1, name: 'Novidades' })).toBeInTheDocument();
    expect(await screen.findByText('1 não lida')).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: 'Novidades do painel' });
    expect(within(lista).getAllByText('novo')).toHaveLength(1);
    expect(within(lista).getByRole('link', { name: /Integrações e API/ })).toHaveAttribute(
      'href',
      '/org/g1/integrations',
    );
    expect(within(lista).getByText('23 nov')).toBeInTheDocument();
  });

  it('Marcar tudo como lido vira "tudo lido" (Pn-27b)', async () => {
    vi.mocked(panelNewsApi.markRead).mockResolvedValue(feed(false));
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar tudo como lido' }));
    await waitFor(() => expect(panelNewsApi.markRead).toHaveBeenCalledWith(undefined));
    expect(await screen.findByText('tudo lido')).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith('Tudo marcado como lido');
    expect(screen.queryByRole('button', { name: 'Marcar tudo como lido' })).toBeNull();
  });

  it('abrir uma novidade não lida marca só ela', async () => {
    vi.mocked(panelNewsApi.markRead).mockResolvedValue(feed(false));
    abrir();
    await userEvent.click(await screen.findByRole('link', { name: /Integrações e API/ }));
    await waitFor(() => expect(panelNewsApi.markRead).toHaveBeenCalledWith(['painel-integracoes']));
  });

  it('Sugerir uma ideia: texto, onde ajudaria e o "Lemos todas"', async () => {
    vi.mocked(ideasApi.send).mockResolvedValue({ sent: true });
    abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir uma ideia' }));
    const form = await screen.findByRole('form', { name: 'Sugerir uma ideia' });
    expect(within(form).getByText(/Lemos todas/)).toBeInTheDocument();
    const enviar = within(form).getByRole('button', { name: 'Enviar ideia' });
    expect(enviar).toBeDisabled();
    await userEvent.type(within(form).getByLabelText('Sua ideia'), 'Relatório por unidade');
    await userEvent.click(within(form).getByRole('radio', { name: 'Relatório' }));
    await userEvent.click(enviar);
    await waitFor(() =>
      expect(ideasApi.send).toHaveBeenCalledWith('Relatório por unidade', 'REPORT'),
    );
    expect(toast).toHaveBeenCalledWith('Ideia enviada · obrigado!');
  });
});

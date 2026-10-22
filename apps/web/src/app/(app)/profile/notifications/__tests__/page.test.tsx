import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    notificationsApi: {
      preferences: vi.fn(),
      setPreferences: vi.fn(),
      devices: vi.fn(),
      removeDevice: vi.fn(),
      webPushStatus: vi.fn(async () => ({ publicKey: null, subscriptions: 0 })),
      subscribeWebPush: vi.fn(),
      unsubscribeWebPush: vi.fn(),
    },
  };
});

import { notificationsApi } from '@fatia/api-client';
import NotificationsPage from '../page';

const tudo = { COMMUNITY: true, CHALLENGES: true, FEED: true, MODERATION: true, CHAT: true };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotificationsPage />
    </QueryClientProvider>,
  );
}

describe('Perfil → Notificações', () => {
  afterEach(() => vi.clearAllMocks());

  it('desligar um tipo manda só ele', async () => {
    vi.mocked(notificationsApi.preferences).mockResolvedValue(tudo);
    vi.mocked(notificationsApi.devices).mockResolvedValue([]);
    vi.mocked(notificationsApi.setPreferences).mockResolvedValue({ ...tudo, FEED: false });
    renderPage();

    const chave = await screen.findByRole('switch', { name: /Comentários/ });
    expect(chave).toBeChecked();
    await userEvent.click(chave);
    expect(notificationsApi.setPreferences).toHaveBeenCalledWith({ FEED: false });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Comentários/ })).not.toBeChecked(),
    );
    expect(screen.getByText(/No app, abra Perfil → Notificações/)).toBeInTheDocument();
  });

  it('lista os celulares e tira um', async () => {
    vi.mocked(notificationsApi.preferences).mockResolvedValue(tudo);
    vi.mocked(notificationsApi.devices).mockResolvedValue([
      {
        id: 'd1',
        platform: 'ANDROID',
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
    ]);
    vi.mocked(notificationsApi.removeDevice).mockResolvedValue({ removed: true });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Parar avisos no Android · usado hoje' }),
    );
    expect(notificationsApi.removeDevice).toHaveBeenCalledWith('d1');
  });

  it('erro ao salvar avisa, sem fingir que mudou', async () => {
    vi.mocked(notificationsApi.preferences).mockResolvedValue(tudo);
    vi.mocked(notificationsApi.devices).mockResolvedValue([]);
    vi.mocked(notificationsApi.setPreferences).mockRejectedValue(new Error('falhou'));
    renderPage();

    await userEvent.click(await screen.findByRole('switch', { name: /Desafios/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para salvar agora');
    expect(screen.getByRole('switch', { name: /Desafios/ })).toBeChecked();
  });

  it('sem chave de push na instância, a opção do navegador não aparece', async () => {
    vi.mocked(notificationsApi.preferences).mockResolvedValue(tudo);
    vi.mocked(notificationsApi.devices).mockResolvedValue([]);
    renderPage();

    await screen.findByRole('switch', { name: /Comentários/ });
    expect(screen.queryByText('Neste navegador')).not.toBeInTheDocument();
  });

  it('navegador sem push (iPhone fora da tela de início) explica o porquê', async () => {
    vi.mocked(notificationsApi.preferences).mockResolvedValue(tudo);
    vi.mocked(notificationsApi.devices).mockResolvedValue([]);
    vi.mocked(notificationsApi.webPushStatus).mockResolvedValue({
      publicKey: 'BChave',
      subscriptions: 0,
    });
    renderPage();

    expect(await screen.findByText('Neste navegador')).toBeInTheDocument();
    expect(screen.getByText(/tela\s+de início \(iOS 16\.4/)).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: /Avisos neste navegador/ }),
    ).not.toBeInTheDocument();
  });
});

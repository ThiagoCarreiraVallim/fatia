import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup, PendingActivation, PendingInviteItem } from '@fatia/api-client';
import { SidePanel, SidePanelProvider } from '@/components/org/side-panel';
import { assentos, grupo, membro, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    orgApi: {
      members: vi.fn(),
      pendingInvites: vi.fn(),
      invitesOverview: vi.fn(),
      resendInvite: vi.fn(),
      resendInvites: vi.fn(),
      renewInvite: vi.fn(),
      revokeInvite: vi.fn(),
      freshInviteLink: vi.fn(),
      createInvite: vi.fn(),
      createInviteBatch: vi.fn(),
    },
    seatsApi: { get: vi.fn() },
  };
});

import { orgApi, seatsApi } from '@fatia/api-client';
import { toast } from 'sonner';
import ActivationPage from '../page';

const item = (p: Partial<PendingInviteItem> = {}): PendingInviteItem => ({
  id: 'i1',
  email: 'bia@x.com',
  role: 'MEMBER',
  origin: 'QR',
  label: null,
  invitedAt: '2026-11-16T12:00:00.000Z',
  lastSentAt: '2026-11-16T12:00:00.000Z',
  expiresAt: '2026-12-16T12:00:00.000Z',
  status: 'pending',
  sendCount: 1,
  canResend: true,
  canRenew: false,
  ...p,
});

const pagina = (p: Partial<PendingActivation> = {}): PendingActivation => ({
  cards: {
    notAccepted: 48,
    joinedNoFirstLog: 17,
    acceptedThisMonth: { accepted: 23, total: 30 },
  },
  origins: [
    { origin: 'QR', count: 19 },
    { origin: 'INSTAGRAM', count: 14 },
    { origin: null, count: 15 },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  items: [
    item(),
    item({
      id: 'i2',
      email: 'hugo@x.com',
      origin: 'INSTAGRAM',
      status: 'expired',
      canResend: false,
      canRenew: true,
      expiresAt: '2026-11-10T12:00:00.000Z',
    }),
  ],
  ...p,
});

function abrir(dados: PendingActivation = pagina()) {
  ctx.group = grupo();
  vi.mocked(orgApi.pendingInvites).mockResolvedValue(dados);
  vi.mocked(orgApi.invitesOverview).mockResolvedValue({
    cards: { activeLinks: 1, notAccepted: 0, joinedLast30Days: 0, activated48h: null },
    invites: [],
  });
  vi.mocked(orgApi.members).mockResolvedValue([membro({ name: 'Bruno', role: 'OWNER' })]);
  vi.mocked(seatsApi.get).mockResolvedValue(assentos());
  return renderWithClient(
    <SidePanelProvider>
      <ActivationPage />
      <SidePanel />
    </SidePanelProvider>,
  );
}

const linha = (texto: string) => screen.getByText(texto).closest('tr') as HTMLElement;

describe('painel › ativação pendente (Pn-22)', () => {
  afterEach(() => vi.clearAllMocks());

  it('cartões, origens e a lista nominal com status e ações certas', async () => {
    abrir();
    await screen.findByText('bia@x.com');
    expect(screen.getByText('Convites sem aceite').parentElement).toHaveTextContent('48');
    expect(screen.getByText('Aceitaram este mês').parentElement).toHaveTextContent('23 de 30');
    expect(screen.getByRole('button', { name: /Todas as origens 48/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /QR · recepção 19/ })).toBeInTheDocument();
    expect(linha('bia@x.com')).toHaveTextContent('aguardando');
    expect(within(linha('bia@x.com')).getByRole('button', { name: 'Reenviar' })).toBeEnabled();
    expect(linha('hugo@x.com')).toHaveTextContent('expirou');
    expect(within(linha('hugo@x.com')).getByRole('button', { name: 'Renovar' })).toBeEnabled();
    expect(within(linha('hugo@x.com')).queryByRole('button', { name: 'Reenviar' })).toBeNull();
  });

  it('filtra por origem e busca no servidor', async () => {
    abrir();
    await screen.findByText('bia@x.com');
    await userEvent.click(screen.getByRole('button', { name: /Instagram 14/ }));
    await waitFor(() =>
      expect(orgApi.pendingInvites).toHaveBeenLastCalledWith('g1', {
        origin: 'INSTAGRAM',
        q: '',
        page: 1,
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Sem origem 15/ }));
    await waitFor(() =>
      expect(orgApi.pendingInvites).toHaveBeenLastCalledWith('g1', {
        origin: 'NONE',
        q: '',
        page: 1,
      }),
    );
  });

  it('reenvia os selecionados de uma vez e diz quantos saíram', async () => {
    vi.mocked(orgApi.resendInvites).mockResolvedValue({
      sent: [{ id: 'i1', emailSent: true }],
      skipped: [],
    });
    abrir();
    await screen.findByText('bia@x.com');
    await userEvent.click(within(linha('bia@x.com')).getByRole('checkbox'));
    expect(screen.getByText('1 selecionado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar selecionados' }));
    await waitFor(() => expect(orgApi.resendInvites).toHaveBeenCalledWith('g1', ['i1']));
    expect(toast).toHaveBeenCalledWith('1 convite reenviado');
  });

  it('renova o expirado e revoga', async () => {
    vi.mocked(orgApi.renewInvite).mockResolvedValue({
      invite: {} as never,
      url: 'x',
      emailSent: true,
    });
    vi.mocked(orgApi.revokeInvite).mockResolvedValue({} as never);
    abrir();
    await screen.findByText('hugo@x.com');
    await userEvent.click(within(linha('hugo@x.com')).getByRole('button', { name: 'Renovar' }));
    await waitFor(() => expect(orgApi.renewInvite).toHaveBeenCalledWith('g1', 'i2'));
    expect(toast).toHaveBeenCalledWith('Convite novo enviado para hugo@x.com');
    await userEvent.click(within(linha('bia@x.com')).getByRole('button', { name: 'Revogar' }));
    await waitFor(() => expect(orgApi.revokeInvite).toHaveBeenCalledWith('g1', 'i1'));
  });

  it('WhatsApp gera um link novo e mostra a mensagem pronta para copiar ou abrir', async () => {
    vi.mocked(orgApi.freshInviteLink).mockResolvedValue({
      url: 'http://localhost:3030/c/zz',
      reused: false,
    });
    abrir();
    await screen.findByText('bia@x.com');
    await userEvent.click(within(linha('bia@x.com')).getByRole('button', { name: 'WhatsApp' }));
    await waitFor(() => expect(orgApi.freshInviteLink).toHaveBeenCalledWith('g1', 'i1'));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent(
      'Oi! Entra na Academia Demo no Fatia para acompanhar seus treinos com a equipe: http://localhost:3030/c/zz',
    );
    expect(dialogo).toHaveTextContent('O link do e-mail anterior deixou de valer');
    expect(within(dialogo).getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining('https://wa.me/?text='),
    );
  });

  it('WhatsApp de novo em 10 minutos: o mesmo link, e o aviso diz que nada mudou', async () => {
    vi.mocked(orgApi.freshInviteLink).mockResolvedValue({
      url: 'http://localhost:3030/c/zz',
      reused: true,
    });
    abrir();
    await screen.findByText('bia@x.com');
    // O botão avisa antes: gerar link novo invalida o anterior.
    expect(within(linha('bia@x.com')).getByRole('button', { name: 'WhatsApp' })).toHaveAttribute(
      'title',
      expect.stringContaining('invalida o link anterior'),
    );
    await userEvent.click(within(linha('bia@x.com')).getByRole('button', { name: 'WhatsApp' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('É o mesmo link de há pouco');
  });

  it('vazia: todos aceitaram', async () => {
    abrir(
      pagina({
        cards: {
          notAccepted: 0,
          joinedNoFirstLog: 5,
          acceptedThisMonth: { accepted: 23, total: 30 },
        },
        origins: [],
        total: 0,
        items: [],
      }),
    );
    expect(await screen.findByText('Todos os convites foram aceitos')).toBeInTheDocument();
    expect(
      screen.getByText(/Quando alguém não aceitar em 2 dias, aparece aqui/),
    ).toBeInTheDocument();
  });

  it('vazia com convites recentes sem aceite: não diz que todos aceitaram', async () => {
    for (const notAccepted of [4, null]) {
      const { unmount } = abrir(
        pagina({
          cards: { notAccepted, joinedNoFirstLog: null, acceptedThisMonth: null },
          origins: [],
          total: 0,
          items: [],
        }),
      );
      expect(await screen.findByText('Nenhum convite parado há 2 dias')).toBeInTheDocument();
      expect(screen.queryByText('Todos os convites foram aceitos')).toBeNull();
      unmount();
    }
  });

  it('poucos: totais ocultos, mas a lista continua', async () => {
    abrir(
      pagina({
        cards: { notAccepted: null, joinedNoFirstLog: null, acceptedThisMonth: null },
      }),
    );
    await screen.findByText('bia@x.com');
    expect(screen.getAllByText('amostra pequena demais para mostrar')).toHaveLength(3);
    expect(screen.getByText(/Com menos de 5 pessoas os totais ficam ocultos/)).toBeInTheDocument();
  });

  it('pagina no servidor: "11–20 de 48"', async () => {
    abrir(pagina({ total: 48 }));
    await screen.findByText('bia@x.com');
    expect(screen.getByText(/1–10 de 48/)).toBeInTheDocument();
    vi.mocked(orgApi.pendingInvites).mockResolvedValue(pagina({ total: 48, page: 2 }));
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() =>
      expect(orgApi.pendingInvites).toHaveBeenLastCalledWith('g1', {
        origin: undefined,
        q: '',
        page: 2,
      }),
    );
    expect(await screen.findByText(/11–20 de 48/)).toBeInTheDocument();
  });
});

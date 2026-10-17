import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InviteView, MyGroup } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    orgApi: {
      invites: vi.fn(),
      createInvite: vi.fn(),
      createInviteBatch: vi.fn(),
      resendInvite: vi.fn(),
      revokeInvite: vi.fn(),
    },
  };
});

import { orgApi } from '@fatia/api-client';
import { toast } from 'sonner';
import OrgInvitesPage from '../page';

const convite = (p: Partial<InviteView> = {}): InviteView => ({
  id: 'i1',
  role: 'MEMBER',
  email: null,
  maxUses: 10,
  uses: 3,
  expiresAt: '2026-10-24T12:00:00.000Z',
  createdAt: '2026-10-17T12:00:00.000Z',
  lastSentAt: null,
  ...p,
});

function abrir(g: MyGroup = grupo()) {
  ctx.group = g;
  vi.mocked(orgApi.invites).mockResolvedValue([
    convite(),
    convite({ id: 'i2', email: 'ana@x.com', maxUses: 1, uses: 0 }),
  ]);
  return renderWithClient(<OrgInvitesPage />);
}

describe('painel › convites', () => {
  afterEach(() => vi.clearAllMocks());

  it('cria o link e mostra uma vez, com o aviso', async () => {
    vi.mocked(orgApi.createInvite).mockResolvedValue({
      invite: convite({ id: 'i3' }),
      url: 'http://localhost:3030/c/abc',
      emailSent: false,
    });
    abrir();
    await userEvent.type(screen.getByLabelText('Limite de usos'), '25');
    await userEvent.click(screen.getByRole('button', { name: 'Criar link' }));
    await waitFor(() =>
      expect(orgApi.createInvite).toHaveBeenCalledWith('g1', {
        role: 'MEMBER',
        maxUses: 25,
        expiresInDays: 7,
      }),
    );
    expect(await screen.findByTestId('invite-url')).toHaveTextContent(
      'http://localhost:3030/c/abc',
    );
    expect(screen.getByText(/O link aparece só agora/)).toBeInTheDocument();
  });

  it('lote: prévia de válidos, inválidos e repetidos; resultado com os pulados', async () => {
    vi.mocked(orgApi.createInviteBatch).mockResolvedValue({
      created: [{ email: 'bia@x.com', inviteId: 'i9', emailSent: true }],
      skipped: [{ email: 'ana@x.com', reason: 'pending_invite' }],
    });
    abrir();
    fireEvent.change(screen.getByLabelText(/E-mails \(um por linha/), {
      target: { value: 'email\nbia@x.com\nana@x.com\nbia@x.com\nruim' },
    });
    expect(screen.getByText('2 válidos · 1 inválidos · 1 repetidos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Convidar 2 pessoas' }));
    await waitFor(() =>
      expect(orgApi.createInviteBatch).toHaveBeenCalledWith('g1', {
        role: 'MEMBER',
        emails: ['bia@x.com', 'ana@x.com'],
      }),
    );
    expect(toast).toHaveBeenCalledWith('1 convite enviado · 1 pulado');
    expect(await screen.findByText('ana@x.com: já tem convite aberto')).toBeInTheDocument();
  });

  it('lista os abertos; reenviar só no de e-mail; revogar', async () => {
    vi.mocked(orgApi.revokeInvite).mockResolvedValue(convite());
    abrir();
    expect(await screen.findByText('Link · 3 de 10 usos · vence 24 out')).toBeInTheDocument();
    expect(screen.getByText('ana@x.com · vence 24 out')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Reenviar' })).toHaveLength(1);
    await userEvent.click(screen.getAllByRole('button', { name: 'Revogar' })[0]!);
    await waitFor(() => expect(orgApi.revokeInvite).toHaveBeenCalledWith('g1', 'i1'));
  });

  it('o profissional só convida como membro', async () => {
    abrir(grupo({ role: 'PROFESSIONAL' }));
    await screen.findByText('Link · 3 de 10 usos · vence 24 out');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getAllByText('Membro').length).toBeGreaterThanOrEqual(2);
  });
});

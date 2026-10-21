import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InvitePreview } from '@fatia/api-client';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace }) }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, groupsApi: { acceptInvite: vi.fn() } };
});

import { ApiError, groupsApi } from '@fatia/api-client';
import { InviteAccept, InviteSignedOut } from '../invite';

const PREVIEW: InvitePreview = {
  group: { id: 'g1', name: 'Academia Demo', description: 'Treino e boa comida', type: 'SPONSORED' },
  role: 'MEMBER',
  invitedBy: 'Ana',
  team: [{ name: 'Ana', role: 'OWNER' }],
  memberCount: 12,
  emailBound: false,
  expiresAt: '2026-10-24T00:00:00Z',
  requiredSharingScopes: [],
};
const TOKEN = 'a'.repeat(43);

function renderAccept() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InviteAccept token={TOKEN} preview={PREVIEW} />
    </QueryClientProvider>,
  );
}

describe('convite', () => {
  afterEach(() => vi.clearAllMocks());

  it('sem sessão, mostra a comunidade e volta ao link depois do login', () => {
    render(<InviteSignedOut token={TOKEN} preview={PREVIEW} />);
    expect(screen.getByRole('heading', { name: 'Academia Demo' })).toBeInTheDocument();
    expect(screen.getByText('Ana convidou você para entrar como membro.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar para aceitar' })).toHaveAttribute(
      'href',
      `/api/logto/sign-in?next=%2Fc%2F${TOKEN}`,
    );
  });

  it('aceita com o que a pessoa marcou e leva à comunidade', async () => {
    vi.mocked(groupsApi.acceptInvite).mockResolvedValue({
      membershipId: 'm1',
      groupId: 'g1',
      status: 'ACTIVE',
      role: 'MEMBER',
      revokedLinks: 0,
    });
    renderAccept();
    await userEvent.click(screen.getByRole('checkbox', { name: /Treino/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar e entrar' }));

    expect(groupsApi.acceptInvite).toHaveBeenCalledWith(TOKEN, {
      scopes: ['WORKOUT'],
      statsOptIn: false,
    });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/community/g1'));
  });

  it('quem já é membro vai direto à comunidade, sem erro', async () => {
    vi.mocked(groupsApi.acceptInvite).mockRejectedValue(
      new ApiError('Você já faz parte desta comunidade', 409, { groupId: 'g1' }),
    );
    renderAccept();
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar e entrar' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/community/g1'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('convite que não vale para esta conta mostra a frase neutra', async () => {
    vi.mocked(groupsApi.acceptInvite).mockRejectedValue(new ApiError('Invite not found', 404));
    renderAccept();
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar e entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não pode ser usado/);
  });
});

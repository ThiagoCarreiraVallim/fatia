import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvitePreview } from '@fatia/api-client';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace }) }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupsApi: { acceptInvite: vi.fn() },
    usersApi: { me: vi.fn() },
  };
});

import { ApiError, groupsApi, usersApi } from '@fatia/api-client';
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
  activeChallenge: null,
};
const TOKEN = 'a'.repeat(43);

function renderAccept(preview: InvitePreview = PREVIEW) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InviteAccept token={TOKEN} preview={preview} />
    </QueryClientProvider>,
  );
}

describe('convite', () => {
  afterEach(() => vi.clearAllMocks());
  beforeEach(() => {
    vi.mocked(usersApi.me).mockResolvedValue({
      onboardedAt: '2026-10-01T00:00:00Z',
      onboardingStep: null,
    } as never);
  });

  it('sem sessão (Onb-01a): capa da comunidade, quem convidou e a conta, voltando ao link', () => {
    render(<InviteSignedOut token={TOKEN} preview={PREVIEW} />);
    expect(screen.getByRole('heading', { name: 'Academia Demo' })).toBeInTheDocument();
    expect(screen.getByText('Ana te convidou')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Crie sua conta para entrar' })).toBeInTheDocument();
    const form = screen.getByRole('button', { name: 'Criar conta' }).closest('form')!;
    expect(form.querySelector('input[name="next"]')).toHaveValue(`/c/${TOKEN}`);
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      `/api/logto/sign-in?next=%2Fc%2F${TOKEN}`,
    );
    expect(screen.getByRole('link', { name: 'Google' })).toHaveAttribute(
      'href',
      `/api/logto/sign-in?next=%2Fc%2F${TOKEN}&social=google`,
    );
  });

  it('conta com o onboarding por fazer vai às boas-vindas da comunidade (#371)', async () => {
    vi.mocked(usersApi.me).mockResolvedValue({ onboardedAt: null, onboardingStep: null } as never);
    renderAccept();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/onboarding?convite=${TOKEN}`));
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

  it('o obrigatório vem marcado e travado, e o 409 mostra o que falta', async () => {
    vi.mocked(groupsApi.acceptInvite).mockRejectedValue(
      new ApiError('Para entrar nesta comunidade é preciso compartilhar: Metas.', 409),
    );
    renderAccept({ ...PREVIEW, requiredSharingScopes: ['WORKOUT'] });
    const treino = screen.getByRole('checkbox', { name: /Treino/ });
    expect(treino).toBeChecked();
    expect(treino).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar e entrar' }));
    expect(groupsApi.acceptInvite).toHaveBeenCalledWith(TOKEN, {
      scopes: ['WORKOUT'],
      statsOptIn: false,
    });
    // O dono passou a exigir Metas depois que o convite abriu: a frase do
    // servidor, e não um "tente de novo" que daria o mesmo erro.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Para entrar nesta comunidade é preciso compartilhar: Metas.',
    );
  });
});

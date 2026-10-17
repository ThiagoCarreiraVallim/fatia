import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type MyGroup } from '@fatia/api-client';
import { grupo, membro, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null, replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: ctx.replace }) }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    orgApi: { members: vi.fn(), update: vi.fn(), remove: vi.fn(), transferOwner: vi.fn() },
  };
});

import { orgApi } from '@fatia/api-client';
import { toast } from 'sonner';
import OrgSettingsPage from '../page';

function abrir() {
  ctx.group = grupo();
  vi.mocked(orgApi.members).mockResolvedValue([
    membro({ name: 'Bruno', role: 'OWNER', membershipId: 'mo' }),
    membro({ name: 'Helena', role: 'PROFESSIONAL' }),
  ]);
  return renderWithClient(<OrgSettingsPage />);
}

describe('painel › configurações', () => {
  afterEach(() => vi.clearAllMocks());

  it('salva o perfil só quando algo mudou', async () => {
    vi.mocked(orgApi.update).mockResolvedValue({} as never);
    abrir();
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Descrição'));
    await userEvent.click(salvar);
    await waitFor(() =>
      expect(orgApi.update).toHaveBeenCalledWith('g1', {
        name: 'Academia Demo',
        description: null,
        joinPolicy: 'APPROVAL',
      }),
    );
  });

  it('apagar exige digitar o nome; 503 avisa que nada foi apagado', async () => {
    vi.mocked(orgApi.remove).mockRejectedValue(new ApiError('indisponível', 503));
    abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a comunidade' }));
    const dialogo = await screen.findByRole('dialog');
    const apagar = within(dialogo).getByRole('button', { name: 'Apagar' });
    expect(apagar).toBeDisabled();
    await userEvent.type(within(dialogo).getByLabelText(/Digite o nome/), 'Academia Demo');
    await userEvent.click(apagar);
    await waitFor(() => expect(orgApi.remove).toHaveBeenCalledWith('g1'));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Nada foi apagado/));
    expect(ctx.replace).not.toHaveBeenCalled();
  });

  it('mostra o código e a equipe', async () => {
    abrir();
    expect(screen.getByText('academia-demo')).toBeInTheDocument();
    expect(await screen.findByText('Helena')).toBeInTheDocument();
  });
});

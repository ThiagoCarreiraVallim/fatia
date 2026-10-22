import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup } from '@fatia/api-client';
import { assentos, grupo, membro, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null, params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => ctx.params }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    orgApi: { members: vi.fn(), approve: vi.fn(), setRole: vi.fn(), removeMember: vi.fn() },
    seatsApi: { get: vi.fn(), assign: vi.fn(), unassign: vi.fn() },
  };
});

import { orgApi, seatsApi } from '@fatia/api-client';
import { toast } from 'sonner';
import OrgMembersPage from '../page';

const LISTA = [
  membro({ name: 'Bruno', role: 'OWNER', membershipId: 'mo' }),
  membro({ name: 'Helena', role: 'PROFESSIONAL' }),
  membro({ name: 'Carla', scopesGrantedToMe: ['WORKOUT'], hasAiSeat: true }),
  membro({ name: 'Diego' }),
  membro({ name: 'Márcia', status: 'INVITED' }),
];

function abrir(g: MyGroup = grupo()) {
  ctx.group = g;
  vi.mocked(orgApi.members).mockResolvedValue(LISTA);
  vi.mocked(seatsApi.get).mockResolvedValue(assentos());
  return renderWithClient(<OrgMembersPage />);
}

const linha = (nome: string) => screen.getByText(nome).closest('li') as HTMLElement;

describe('painel › membros', () => {
  afterEach(() => {
    vi.clearAllMocks();
    ctx.params = new URLSearchParams();
  });

  it('o dono aprova pedido, e só quem compartilha tem "Ver dados"', async () => {
    vi.mocked(orgApi.approve).mockResolvedValue({
      membershipId: 'm-Márcia',
      groupId: 'g1',
      status: 'ACTIVE',
      role: 'MEMBER',
      revokedLinks: 0,
    });
    abrir();
    await screen.findByText('Márcia');
    expect(within(linha('Carla')).getByRole('link', { name: /Ver dados/ })).toHaveAttribute(
      'href',
      '/org/g1/members/m-Carla',
    );
    expect(within(linha('Diego')).queryByRole('link', { name: /Ver dados/ })).toBeNull();

    await userEvent.click(within(linha('Márcia')).getByRole('button', { name: 'Aprovar' }));
    await waitFor(() => expect(orgApi.approve).toHaveBeenCalledWith('g1', 'm-Márcia', 'MEMBER'));
    expect(toast).toHaveBeenCalledWith('Márcia entrou na comunidade.');
  });

  it('dá assento a quem não tem enquanto houver vaga, e tira de quem tem', async () => {
    vi.mocked(seatsApi.assign).mockResolvedValue(assentos());
    abrir();
    await screen.findByText('Diego');
    await waitFor(() =>
      expect(
        within(linha('Diego')).getByRole('button', { name: 'Dar assento' }),
      ).toBeInTheDocument(),
    );
    expect(
      within(linha('Carla')).getByRole('button', { name: 'Tirar assento' }),
    ).toBeInTheDocument();
    await userEvent.click(within(linha('Diego')).getByRole('button', { name: 'Dar assento' }));
    await waitFor(() => expect(seatsApi.assign).toHaveBeenCalledWith('g1', 'm-Diego'));
  });

  it('remover pede confirmação e avisa do assento', async () => {
    vi.mocked(orgApi.removeMember).mockResolvedValue({
      membershipId: 'm-Carla',
      groupId: 'g1',
      status: 'REMOVED',
      role: 'MEMBER',
      revokedLinks: 2,
    });
    abrir();
    await screen.findByText('Carla');
    await userEvent.click(within(linha('Carla')).getByRole('button', { name: 'Remover' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('o assento PRO volta para a comunidade');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(orgApi.removeMember).toHaveBeenCalledWith('g1', 'm-Carla'));
  });

  it('o profissional vê a lista e os dados, sem aprovar, mudar papel nem assento', async () => {
    abrir(grupo({ role: 'PROFESSIONAL' }));
    await screen.findByText('Márcia');
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(seatsApi.get).not.toHaveBeenCalled();
    expect(within(linha('Carla')).getByRole('link', { name: /Ver dados/ })).toBeInTheDocument();
  });

  it('abre filtrado em "Aguardando" pelo atalho da visão geral, e busca sem acento', async () => {
    ctx.params = new URLSearchParams('filtro=pending');
    abrir();
    await screen.findByText('Márcia');
    expect(screen.queryByText('Carla')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await userEvent.type(screen.getByLabelText('Buscar por nome'), 'marc');
    expect(screen.getByText('Márcia')).toBeInTheDocument();
    expect(screen.queryByText('Diego')).toBeNull();
  });
});

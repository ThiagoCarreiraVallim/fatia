import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup } from '@fatia/api-client';
import { SidePanel, SidePanelProvider } from '@/components/org/side-panel';
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
    orgApi: {
      members: vi.fn(),
      approve: vi.fn(),
      setRole: vi.fn(),
      removeMember: vi.fn(),
      setAccompaniedBy: vi.fn(),
      bulkMembers: vi.fn(),
      createInvite: vi.fn(),
      createInviteBatch: vi.fn(),
    },
    seatsApi: { get: vi.fn(), assign: vi.fn(), unassign: vi.fn() },
    panelApi: { counts: vi.fn() },
  };
});

import { ApiError, orgApi, panelApi, seatsApi } from '@fatia/api-client';
import { toast } from 'sonner';
import OrgMembersPage from '../page';

const LISTA = [
  membro({ name: 'Bruno', role: 'OWNER', membershipId: 'mo' }),
  membro({ name: 'Helena', role: 'PROFESSIONAL', membershipId: 'mh' }),
  membro({
    name: 'Carla',
    scopesGrantedToMe: ['WORKOUT'],
    hasAiSeat: true,
    accompaniedBy: { membershipId: 'mh', name: 'Helena' },
    joinedVia: { via: 'INVITE', inviteId: 'i1', label: 'Recepção', origin: 'QR' },
    whatsapp: '(65) 99812-3456',
  }),
  membro({
    name: 'Diego',
    joinedVia: { via: 'INVITE', inviteId: 'i2', label: null, origin: 'INSTAGRAM' },
  }),
  membro({ name: 'Márcia', status: 'INVITED' }),
  membro({ name: 'Elisa', status: 'LEFT', leftAt: '2026-11-02T12:00:00.000Z' }),
];

function abrir(g: MyGroup = grupo(), lista = LISTA) {
  ctx.group = g;
  vi.mocked(orgApi.members).mockResolvedValue(lista);
  vi.mocked(seatsApi.get).mockResolvedValue(assentos());
  vi.mocked(panelApi.counts).mockResolvedValue({
    pendingRequests: 1,
    pendingInvites: 7,
    openReports: 0,
    challengeReview: 0,
  });
  return renderWithClient(
    <SidePanelProvider>
      <OrgMembersPage />
      <SidePanel />
    </SidePanelProvider>,
  );
}

const linha = (nome: string) => screen.getByText(nome).closest('tr') as HTMLElement;
const painel = () => screen.getByRole('complementary');

describe('painel › membros (Pn-04)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    ctx.params = new URLSearchParams();
  });

  it('pede a lista com quem saiu; abas com contagem; "Todos" esconde quem saiu', async () => {
    abrir();
    await screen.findByText('Carla');
    expect(orgApi.members).toHaveBeenCalledWith('g1', { includeLeft: true });
    expect(screen.queryByText('Elisa')).toBeNull();
    expect(screen.getByRole('button', { name: /Saíram 1/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Saíram/ }));
    expect(screen.getByText('Elisa')).toBeInTheDocument();
    expect(screen.queryByText('Carla')).toBeNull();
  });

  it('"Sem acompanhamento" mostra só membro ativo sem ninguém; "Convite pendente" leva à Ativação', async () => {
    abrir();
    await screen.findByText('Carla');
    await userEvent.click(screen.getByRole('button', { name: /Sem acompanhamento/ }));
    expect(screen.getByText('Diego')).toBeInTheDocument();
    expect(screen.queryByText('Carla')).toBeNull();
    expect(await screen.findByRole('link', { name: /Convite pendente 7/ })).toHaveAttribute(
      'href',
      '/org/g1/activation',
    );
  });

  it('colunas "Entrou por" e "Acompanha"; filtro por origem; esconder coluna', async () => {
    abrir();
    await screen.findByText('Carla');
    expect(within(linha('Carla')).getByText('Recepção')).toBeInTheDocument();
    expect(within(linha('Carla')).getByText('Helena')).toBeInTheDocument();
    expect(within(linha('Diego')).getByText('Instagram')).toBeInTheDocument();
    // Pn-04: membro sem ninguém aparece destacado; equipe não tem "Acompanha".
    expect(within(linha('Diego')).getByText('Ninguém')).toHaveClass('text-warning');
    expect(within(linha('Márcia')).getByText('Ninguém')).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('button', { name: 'Abrir Helena' }).closest('tr') as HTMLElement,
      ).queryByText('Ninguém'),
    ).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('Entrou por'), 'Instagram');
    expect(screen.queryByText('Carla')).toBeNull();
    expect(screen.getByText('Diego')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Colunas' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Entrou por' }));
    expect(screen.queryByRole('columnheader', { name: 'Entrou por' })).toBeNull();
  });

  it('o dono aprova pedido na própria linha', async () => {
    vi.mocked(orgApi.approve).mockResolvedValue({
      membershipId: 'm-Márcia',
      groupId: 'g1',
      status: 'ACTIVE',
      role: 'MEMBER',
      revokedLinks: 0,
    });
    abrir();
    await screen.findByText('Márcia');
    await userEvent.click(within(linha('Márcia')).getByRole('button', { name: 'Aprovar' }));
    await waitFor(() => expect(orgApi.approve).toHaveBeenCalledWith('g1', 'm-Márcia', 'MEMBER'));
    expect(toast).toHaveBeenCalledWith('Márcia entrou na comunidade.');
  });

  it('seleção em massa: trocar responsável e dar assento, com o erro de vaga da API', async () => {
    vi.mocked(orgApi.bulkMembers)
      .mockResolvedValueOnce({ updated: 2 })
      .mockRejectedValueOnce(
        new ApiError('Faltam 1 assentos livres para esta seleção.', 409, { code: 'NO_SEATS' }),
      );
    abrir();
    await screen.findByText('Carla');
    await userEvent.click(within(linha('Carla')).getByRole('checkbox'));
    await userEvent.click(within(linha('Diego')).getByRole('checkbox'));
    expect(screen.getByText('2 selecionados')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Trocar responsável'), 'mh');
    await waitFor(() =>
      expect(orgApi.bulkMembers).toHaveBeenCalledWith('g1', {
        action: 'accompany',
        membershipIds: ['m-Carla', 'm-Diego'],
        accompaniedByMembershipId: 'mh',
      }),
    );
    expect(toast).toHaveBeenCalledWith('2 pessoas agora com Helena');

    await userEvent.click(within(linha('Carla')).getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Dar assento' }));
    await waitFor(() =>
      expect(orgApi.bulkMembers).toHaveBeenLastCalledWith('g1', {
        action: 'seat',
        membershipIds: ['m-Carla'],
      }),
    );
    expect(toast).toHaveBeenLastCalledWith('Faltam 1 assentos livres para esta seleção.');
  });

  it('a linha abre o painel: WhatsApp autorizado, acompanhamento, ficha e remover com confirmação', async () => {
    vi.mocked(orgApi.setAccompaniedBy).mockResolvedValue({
      membershipId: 'm-Carla',
      accompaniedById: null,
    });
    vi.mocked(orgApi.removeMember).mockResolvedValue({
      membershipId: 'm-Carla',
      groupId: 'g1',
      status: 'REMOVED',
      role: 'MEMBER',
      revokedLinks: 1,
    });
    abrir();
    await screen.findByText('Carla');
    await userEvent.click(within(linha('Carla')).getByRole('button', { name: 'Abrir Carla' }));
    const p = painel();
    expect(within(p).getByRole('link', { name: /\(65\) 99812-3456/ })).toHaveAttribute(
      'href',
      'https://wa.me/5565998123456',
    );
    expect(within(p).getByRole('link', { name: 'Ficha completa' })).toHaveAttribute(
      'href',
      '/org/g1/members/m-Carla',
    );
    await userEvent.click(within(p).getByRole('button', { name: 'Ninguém' }));
    await waitFor(() =>
      expect(orgApi.setAccompaniedBy).toHaveBeenCalledWith('g1', 'm-Carla', null),
    );

    await userEvent.click(within(p).getByRole('button', { name: 'Remover da comunidade' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('o assento PRO volta para a comunidade');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(orgApi.removeMember).toHaveBeenCalledWith('g1', 'm-Carla'));
  });

  it('o profissional vê a lista e abre a pessoa, sem seleção, aprovar, assento nem remover', async () => {
    abrir(grupo({ role: 'PROFESSIONAL', membershipId: 'mh' }));
    await screen.findByText('Márcia');
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(seatsApi.get).not.toHaveBeenCalled();
    await userEvent.click(within(linha('Carla')).getByRole('button', { name: 'Abrir Carla' }));
    const p = painel();
    expect(within(p).queryByRole('button', { name: 'Remover da comunidade' })).toBeNull();
    expect(within(p).queryByRole('button', { name: 'Ninguém' })).toBeNull();
    expect(within(p).getByText('Helena')).toBeInTheDocument();
  });

  it('abre filtrado em "Aguardando" pelo atalho da visão geral, e busca sem acento', async () => {
    ctx.params = new URLSearchParams('filtro=pending');
    abrir();
    await screen.findByText('Márcia');
    expect(screen.queryByText('Carla')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Todos/ }));
    await userEvent.type(screen.getByLabelText('Buscar por nome'), 'marc');
    expect(screen.getByText('Márcia')).toBeInTheDocument();
    expect(screen.queryByText('Diego')).toBeNull();
  });

  it('pagina de 10 em 10', async () => {
    const muitos = Array.from({ length: 23 }, (_, i) =>
      membro({ name: `Pessoa ${String(i + 1).padStart(2, '0')}` }),
    );
    abrir(grupo(), muitos);
    await screen.findByText('Pessoa 01');
    expect(screen.getByText('1–10 de 23')).toBeInTheDocument();
    expect(screen.queryByText('Pessoa 11')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Pessoa 11')).toBeInTheDocument();
    expect(screen.getByText('11–20 de 23')).toBeInTheDocument();
  });

  it('"Convidar" abre o painel com link e e-mail', async () => {
    abrir();
    await screen.findByText('Carla');
    await userEvent.click(screen.getByRole('button', { name: 'Convidar' }));
    expect(within(painel()).getByRole('button', { name: 'Criar link' })).toBeInTheDocument();
  });
});

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InviteOverviewRow, InviteView, MyGroup } from '@fatia/api-client';
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
      invitesOverview: vi.fn(),
      createInvite: vi.fn(),
      createInviteBatch: vi.fn(),
      resendInvite: vi.fn(),
      revokeInvite: vi.fn(),
    },
    seatsApi: { get: vi.fn() },
  };
});

import { orgApi, seatsApi } from '@fatia/api-client';
import { toast } from 'sonner';
import OrgInvitesPage from '../page';

const base = (p: Partial<InviteView> = {}): InviteView => ({
  id: 'i1',
  code: null,
  role: 'MEMBER',
  email: null,
  maxUses: null,
  uses: 38,
  expiresAt: null,
  createdAt: '2026-10-17T12:00:00.000Z',
  lastSentAt: null,
  label: 'Recepção',
  origin: 'QR',
  sendCount: 0,
  acceptedAt: null,
  declinedAt: null,
  revokedAt: null,
  giveSeat: false,
  accompaniedById: null,
  kind: 'link',
  status: 'active',
  ...p,
});

const linhaConvite = (p: Partial<InviteOverviewRow> = {}): InviteOverviewRow => ({
  ...base(p),
  url: 'http://localhost:3030/c/rec',
  accompaniedByName: null,
  joined: 38,
  ...p,
});

const LINHAS = [
  linhaConvite(),
  linhaConvite({
    id: 'i2',
    label: 'Indicação da Ana',
    origin: 'REFERRAL',
    maxUses: 10,
    uses: 3,
    joined: null,
    expiresAt: '2026-12-15T15:00:00.000Z',
  }),
  linhaConvite({
    id: 'i3',
    kind: 'email',
    email: 'paulo@x.com',
    label: null,
    origin: 'EMAIL_LIST',
    maxUses: 1,
    uses: 0,
    url: null,
    joined: null,
    expiresAt: '2026-12-08T15:00:00.000Z',
  }),
  linhaConvite({
    id: 'i4',
    kind: 'email',
    email: 'rafa@x.com',
    label: null,
    origin: 'EMAIL_LIST',
    maxUses: 1,
    uses: 0,
    url: null,
    joined: null,
    status: 'expired',
    expiresAt: '2026-11-10T15:00:00.000Z',
  }),
];

function abrir(g: MyGroup = grupo(), params = '') {
  ctx.group = g;
  ctx.params = new URLSearchParams(params);
  vi.mocked(orgApi.invitesOverview).mockResolvedValue({
    cards: {
      activeLinks: 2,
      notAccepted: 7,
      joinedLast30Days: null,
      activated48h: { percent: 71 },
    },
    invites: LINHAS,
  });
  vi.mocked(orgApi.members).mockResolvedValue([
    membro({ name: 'Bruno', role: 'OWNER', membershipId: 'mo' }),
    membro({ name: 'Helena', role: 'PROFESSIONAL', membershipId: 'mh' }),
  ]);
  vi.mocked(seatsApi.get).mockResolvedValue(assentos());
  return renderWithClient(
    <SidePanelProvider>
      <OrgInvitesPage />
      <SidePanel />
    </SidePanelProvider>,
  );
}

const linha = (texto: string) => screen.getByText(texto).closest('tr') as HTMLElement;
const painel = () => screen.getByRole('complementary');

describe('painel › convites (Pn-06)', () => {
  afterEach(() => vi.clearAllMocks());

  it('cartões com amostra pequena escondida e atalho para a Ativação pendente', async () => {
    abrir();
    const cards = await screen.findByRole('list', { name: 'Resumo dos convites' });
    expect(within(cards).getByText('Links ativos').parentElement).toHaveTextContent('2');
    expect(within(cards).getByText('Entraram em 30 dias').parentElement).toHaveTextContent(
      'amostra pequena demais para mostrar',
    );
    expect(within(cards).getByText('Ativaram em 48 h').parentElement).toHaveTextContent('71%');
    expect(within(cards).getByRole('link', { name: /ver ativação pendente/ })).toHaveAttribute(
      'href',
      '/org/g1/activation',
    );
  });

  it('tabela: origem, usos, entraram (menos de 5), ativaram e validade; abas Links e E-mails', async () => {
    abrir();
    await screen.findByText('Recepção');
    const rec = linha('Recepção');
    expect(rec).toHaveTextContent('QR · recepção');
    expect(rec).toHaveTextContent('38 · sem limite');
    // Ativação não sai por convite (revisão #401): só no cartão, em percentual.
    expect(screen.queryByRole('columnheader', { name: 'Ativaram' })).toBeNull();
    expect(rec).toHaveTextContent('sem prazo');
    const ana = linha('Indicação da Ana');
    expect(ana).toHaveTextContent('3 de 10');
    expect(ana).toHaveTextContent('menos de 5');
    expect(ana).toHaveTextContent('até 15 dez');
    expect(linha('rafa@x.com')).toHaveTextContent('expirou 10 nov');

    await userEvent.click(screen.getByRole('button', { name: /E-mails/ }));
    expect(screen.queryByText('Recepção')).toBeNull();
    expect(screen.getByText('paulo@x.com')).toBeInTheDocument();
  });

  it('copiar no link, reenviar no e-mail ativo, revogar; o expirado não tem ação', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.mocked(orgApi.resendInvite).mockResolvedValue({
      invite: base(),
      url: 'x',
      emailSent: true,
    });
    vi.mocked(orgApi.revokeInvite).mockResolvedValue(base());
    abrir();
    await screen.findByText('Recepção');
    await userEvent.click(within(linha('Recepção')).getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenCalledWith('http://localhost:3030/c/rec');
    expect(within(linha('Recepção')).queryByRole('button', { name: 'Reenviar' })).toBeNull();
    await userEvent.click(within(linha('paulo@x.com')).getByRole('button', { name: 'Reenviar' }));
    await waitFor(() => expect(orgApi.resendInvite).toHaveBeenCalledWith('g1', 'i3'));
    expect(within(linha('rafa@x.com')).queryByRole('button')).toBeNull();
    expect(linha('rafa@x.com')).toHaveTextContent('expirado');
    await userEvent.click(within(linha('Recepção')).getByRole('button', { name: 'Revogar' }));
    await waitFor(() => expect(orgApi.revokeInvite).toHaveBeenCalledWith('g1', 'i1'));
  });

  it('novo link: origem dá o nome, sem prazo, sem limite; mostra link, QR e WhatsApp', async () => {
    vi.mocked(orgApi.createInvite).mockResolvedValue({
      invite: base({ id: 'i9', label: 'Instagram', origin: 'INSTAGRAM' }),
      url: 'http://localhost:3030/c/novo',
      emailSent: false,
    });
    abrir();
    await screen.findByText('Recepção');
    await userEvent.click(screen.getByRole('button', { name: 'Novo link' }));
    const p = painel();
    await userEvent.click(within(p).getByRole('button', { name: 'Instagram' }));
    expect(within(p).getByLabelText('Nome do link')).toHaveValue('Instagram');
    await userEvent.click(within(p).getByRole('button', { name: 'Sem prazo' }));
    await userEvent.click(within(p).getByRole('button', { name: 'Sem limite' }));
    await userEvent.click(within(p).getByRole('button', { name: 'Criar link' }));
    await waitFor(() =>
      expect(orgApi.createInvite).toHaveBeenCalledWith('g1', {
        role: 'MEMBER',
        label: 'Instagram',
        origin: 'INSTAGRAM',
        noExpiry: true,
      }),
    );
    expect(await within(p).findByTestId('invite-url')).toHaveTextContent(
      'http://localhost:3030/c/novo',
    );
    expect(within(p).getByRole('img', { name: /QR do link/ })).toBeInTheDocument();
    expect(within(p).getByRole('link', { name: /WhatsApp/ })).toHaveAttribute(
      'href',
      expect.stringContaining('https://wa.me/?text='),
    );
  });

  it('e-mail: lote com prévia, sem "sem prazo", com acompanhamento e assento', async () => {
    vi.mocked(orgApi.createInviteBatch).mockResolvedValue({
      created: [{ email: 'bia@x.com', inviteId: 'i9', emailSent: true }],
      skipped: [{ email: 'ana@x.com', reason: 'pending_invite' }],
    });
    abrir();
    await screen.findByText('Recepção');
    await userEvent.click(screen.getByRole('button', { name: 'Convidar por e-mail' }));
    const p = painel();
    expect(within(p).queryByRole('button', { name: 'Sem prazo' })).toBeNull();
    expect(p).toHaveTextContent('Convite por e-mail vale uma vez, por até 30 dias.');
    fireEvent.change(within(p).getByLabelText('E-mails'), {
      target: { value: 'bia@x.com\nana@x.com\nruim' },
    });
    expect(within(p).getByText(/2 válidos · 1 inválido/)).toBeInTheDocument();
    await userEvent.click(within(p).getByRole('button', { name: 'Helena' }));
    await userEvent.click(within(p).getByRole('switch', { name: 'Dar assento PRO' }));
    await userEvent.click(within(p).getByRole('button', { name: 'Convidar 2 pessoas' }));
    await waitFor(() =>
      expect(orgApi.createInviteBatch).toHaveBeenCalledWith('g1', {
        role: 'MEMBER',
        emails: ['bia@x.com', 'ana@x.com'],
        accompaniedByMembershipId: 'mh',
        giveSeat: true,
      }),
    );
    expect(toast).toHaveBeenCalledWith('1 convite enviado · 1 pulado');
    expect(await within(p).findByText('ana@x.com: já tem convite aberto')).toBeInTheDocument();
  });

  it('convite de equipe: sem "Sem prazo" nem "Sem limite", e sai com limite e 30 dias', async () => {
    vi.mocked(orgApi.createInvite).mockResolvedValue({
      invite: base({ id: 'i8', role: 'PROFESSIONAL' }),
      url: 'http://localhost:3030/c/eq',
      emailSent: false,
    });
    abrir();
    await screen.findByText('Recepção');
    await userEvent.click(screen.getByRole('button', { name: 'Novo link' }));
    const p = painel();
    await userEvent.click(within(p).getByRole('button', { name: 'Sem prazo' }));
    await userEvent.click(within(p).getByRole('button', { name: 'Profissional' }));
    expect(within(p).queryByRole('button', { name: 'Sem prazo' })).toBeNull();
    expect(within(p).queryByRole('button', { name: 'Sem limite' })).toBeNull();
    expect(p).toHaveTextContent('Convite de equipe vence em até 30 dias');
    await userEvent.click(within(p).getByRole('button', { name: 'Criar link' }));
    await waitFor(() =>
      expect(orgApi.createInvite).toHaveBeenCalledWith('g1', {
        role: 'PROFESSIONAL',
        label: 'Recepção',
        origin: 'QR',
        maxUses: 1,
        expiresInDays: 30,
      }),
    );
  });

  it('o profissional convida só membro, sem assento, e só pode se pôr como acompanhante', async () => {
    abrir(grupo({ role: 'PROFESSIONAL', membershipId: 'mh' }));
    await screen.findByText('Recepção');
    await userEvent.click(screen.getByRole('button', { name: 'Novo link' }));
    const p = painel();
    expect(within(p).queryByRole('button', { name: 'Profissional' })).toBeNull();
    expect(within(p).queryByRole('switch', { name: 'Dar assento PRO' })).toBeNull();
    expect(within(p).getByRole('button', { name: 'Eu' })).toBeInTheDocument();
    expect(within(p).queryByRole('button', { name: 'Bruno' })).toBeNull();
    expect(seatsApi.get).not.toHaveBeenCalled();
  });

  it('gera o código de entrada da recepção e mostra o código e o link do QR', async () => {
    vi.mocked(orgApi.createInvite).mockResolvedValue({
      invite: base({ id: 'i4', code: 'AD7K3Q9P', kind: 'code' }),
      url: 'http://localhost:3030/community?join=1&code=AD7K3Q9P',
      emailSent: false,
    });
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Gerar código de entrada' }));
    await waitFor(() =>
      expect(orgApi.createInvite).toHaveBeenCalledWith('g1', { role: 'MEMBER', code: true }),
    );
    expect(await screen.findByTestId('entry-code')).toHaveTextContent('AD7K3Q9P');
    expect(screen.getByTestId('entry-code-url')).toHaveTextContent(
      'http://localhost:3030/community?join=1&code=AD7K3Q9P',
    );
  });

  it('comunidade só por convite não tem código de entrada', async () => {
    abrir(grupo({ joinPolicy: 'INVITE_ONLY' }));
    await screen.findByText('Recepção');
    expect(screen.queryByRole('button', { name: 'Gerar código de entrada' })).toBeNull();
    expect(screen.getByText(/só por convite/)).toBeInTheDocument();
  });

  it('vindo da Origem dos convites (?novo=link), já abre o painel do link novo (#400)', async () => {
    abrir(grupo(), 'novo=link');
    // O painel aberto também tem o papel "Recepção" (#404): mais de um texto.
    await screen.findAllByText('Recepção');
    expect(await screen.findByRole('complementary')).toHaveTextContent('Novo link de convite');
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GroupPreview, MyGroup } from '@fatia/api-client';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const search = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  useSearchParams: () => search.value,
}));
vi.mock('@/components/layout/app-top-bar', () => ({
  TopBarActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  topBarActionClass: '',
}));
vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <section aria-label="drawer">{children}</section> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: Passthrough,
    DrawerDescription: Passthrough,
  };
});
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupsApi: {
      mine: vi.fn(),
      previewByCode: vi.fn(),
      join: vi.fn(),
      previewInvite: vi.fn(),
      acceptInvite: vi.fn(),
    },
  };
});

import { ApiError, groupsApi } from '@fatia/api-client';
import { toast } from 'sonner';
import CommunityPage from '../page';

const grupo = (p: Partial<MyGroup>): MyGroup => ({
  id: 'g1',
  type: 'SPONSORED',
  name: 'Academia Demo',
  slug: 'academia-demo',
  description: null,
  joinPolicy: 'APPROVAL',
  role: 'MEMBER',
  status: 'ACTIVE',
  membershipId: 'm1',
  joinedAt: '2026-10-01T00:00:00Z',
  createdAt: '2026-09-01T00:00:00Z',
  consentScopes: [],
  statsOptIn: false,
  hasAiSeat: false,
  avatarUrl: null,
  postPolicy: 'ALL_MEMBERS',
  requiredSharingScopes: [],
  visibility: 'PRIVATE',
  timezone: 'America/Sao_Paulo',
  memberCount: 1,
  newPostCount: 0,
  forYouCount: 0,
  challenge: null,
  ...p,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommunityPage />
    </QueryClientProvider>,
  );
}

const preview = (p: Partial<GroupPreview> = {}): GroupPreview => ({
  id: 'g1',
  type: 'SPONSORED',
  name: 'Academia Demo',
  slug: 'academia-demo',
  code: 'academia-demo',
  memberCount: 124,
  description: null,
  joinPolicy: 'APPROVAL',
  visibility: 'PRIVATE',
  team: [{ name: 'Ana', role: 'OWNER' }],
  requiredSharingScopes: [],
  proOffer: false,
  ...p,
});

const pedido = {
  membershipId: 'm1',
  groupId: 'g1',
  status: 'INVITED' as const,
  role: 'MEMBER' as const,
  revokedLinks: 0,
};

async function abrirEProcurar(texto: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Ler QR ou código' }));
  await userEvent.type(screen.getByLabelText('Código ou link'), texto);
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
}

describe('/community', () => {
  afterEach(() => {
    vi.clearAllMocks();
    search.value = new URLSearchParams();
  });

  it('cartão com papel, pessoas, PRO pago pela academia, pendências, posts e desafio', async () => {
    vi.mocked(groupsApi.mine).mockResolvedValue([
      grupo({
        hasAiSeat: true,
        memberCount: 124,
        forYouCount: 3,
        newPostCount: 2,
        challenge: { id: 'c1', title: 'Março', rank: 5 },
      }),
      grupo({
        id: 'g2',
        name: 'Corrida SP',
        type: 'SOCIAL',
        visibility: 'PUBLIC',
        memberCount: 38,
      }),
      grupo({ id: 'g3', name: 'Corrida do Bairro', status: 'INVITED' }),
    ]);
    renderPage();
    const academia = await screen.findByRole('link', { name: /Academia Demo/ });
    expect(academia).toHaveAttribute('href', '/community/g1');
    for (const t of [
      'PRO pago pela academia',
      'patrocinada · membro · 124 pessoas',
      '3 para você',
      '2 posts novos',
      'desafio · 5º',
    ]) {
      expect(academia).toHaveTextContent(t);
    }
    const corrida = screen.getByRole('link', { name: /Corrida SP/ });
    expect(corrida).toHaveTextContent('social · membro · 38 pessoas');
    expect(corrida).toHaveTextContent('pública');
    expect(corrida).not.toHaveTextContent('PRO');
    expect(screen.getByRole('link', { name: /Corrida do Bairro/ })).toHaveTextContent(
      'aguardando aprovação',
    );
  });

  it('sem PRO pago pela comunidade, sem o selo', async () => {
    vi.mocked(groupsApi.mine).mockResolvedValue([grupo({ hasAiSeat: false })]);
    renderPage();
    expect(await screen.findByRole('link', { name: /Academia Demo/ })).not.toHaveTextContent(
      'PRO pago',
    );
  });

  it('pelo código: mostra a comunidade e a forma de entrada antes de compartilhar', async () => {
    vi.mocked(groupsApi.mine).mockResolvedValue([]);
    vi.mocked(groupsApi.previewByCode).mockResolvedValue(preview({ code: 'AD7K3Q9P' }));
    vi.mocked(groupsApi.join).mockResolvedValue(pedido);
    renderPage();

    await abrirEProcurar(' ad7k-3q9p ');
    expect(groupsApi.previewByCode).toHaveBeenCalledWith('ad7k-3q9p');
    const cartao = await screen.findByRole('region', { name: 'Comunidade encontrada' });
    expect(cartao).toHaveTextContent('patrocinada · privada · 124 membros');
    expect(cartao).toHaveTextContent('com aprovação');
    expect(cartao).toHaveTextContent('O dono aprova seu pedido');
    expect(cartao).not.toHaveTextContent('libera o PRO');
    // Nada entra antes de escolher o que compartilhar.
    await userEvent.click(screen.getByRole('button', { name: 'Pedir para entrar' }));
    expect(groupsApi.join).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole('checkbox', { name: /Treino/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Pedir para entrar' }));
    expect(groupsApi.join).toHaveBeenCalledWith('AD7K3Q9P', {
      scopes: ['WORKOUT'],
      statsOptIn: false,
    });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/community/g1'));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/quando o dono aprovar/));
  });

  it('o aviso de PRO só com assento livre', async () => {
    vi.mocked(groupsApi.mine).mockResolvedValue([]);
    vi.mocked(groupsApi.previewByCode).mockResolvedValue(
      preview({ joinPolicy: 'OPEN', proOffer: true }),
    );
    renderPage();
    await abrirEProcurar('academia-demo');
    const cartao = await screen.findByRole('region', { name: 'Comunidade encontrada' });
    expect(cartao).toHaveTextContent('A academia libera o PRO para membros com assento.');
    expect(cartao).toHaveTextContent('aberta');
  });

  it('código inválido, vencido ou revogado: "Peça um novo à equipe"', async () => {
    vi.mocked(groupsApi.mine).mockResolvedValue([]);
    vi.mocked(groupsApi.previewByCode).mockRejectedValue(new ApiError('Group not found', 404));
    renderPage();
    await abrirEProcurar('nada');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Código ou link inválido. Peça um novo à equipe.',
    );
  });

  it('o link de convite colado entra pelo convite', async () => {
    const token = 'a'.repeat(43);
    vi.mocked(groupsApi.mine).mockResolvedValue([]);
    vi.mocked(groupsApi.previewInvite).mockResolvedValue({
      group: { id: 'g1', name: 'Academia Demo', description: null, type: 'SPONSORED' },
      role: 'MEMBER',
      invitedBy: 'Bruno',
      team: [{ name: 'Bruno', role: 'OWNER' }],
      memberCount: 10,
      emailBound: false,
      expiresAt: '2026-12-01T00:00:00Z',
      requiredSharingScopes: [],
      activeChallenge: null,
    });
    vi.mocked(groupsApi.acceptInvite).mockResolvedValue({ ...pedido, status: 'ACTIVE' });
    renderPage();
    await abrirEProcurar(`https://app.fat.ia.br/c/${token}`);
    expect(groupsApi.previewInvite).toHaveBeenCalledWith(token);
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect(groupsApi.acceptInvite).toHaveBeenCalledWith(token, { scopes: [], statsOptIn: false });
    expect(groupsApi.previewByCode).not.toHaveBeenCalled();
  });

  it('o link do QR (?code=) abre a folha e já procura', async () => {
    search.value = new URLSearchParams('join=1&code=AD7K3Q9P');
    vi.mocked(groupsApi.mine).mockResolvedValue([]);
    vi.mocked(groupsApi.previewByCode).mockResolvedValue(preview());
    renderPage();
    expect(await screen.findByRole('region', { name: 'Comunidade encontrada' })).toBeVisible();
    expect(groupsApi.previewByCode).toHaveBeenCalledWith('AD7K3Q9P');
  });

  it('o obrigatório vem travado e o 409 diz o que falta', async () => {
    vi.mocked(groupsApi.mine).mockResolvedValue([]);
    vi.mocked(groupsApi.previewByCode).mockResolvedValue(
      preview({ joinPolicy: 'OPEN', requiredSharingScopes: ['NUTRITION'] }),
    );
    vi.mocked(groupsApi.join).mockRejectedValue(
      new ApiError(
        'Para entrar nesta comunidade é preciso compartilhar: Alimentação e Metas.',
        409,
      ),
    );
    renderPage();
    await abrirEProcurar('academia-demo');
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));
    const alimentacao = await screen.findByRole('checkbox', { name: /Alimentação/ });
    expect(alimentacao).toBeChecked();
    expect(alimentacao).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(groupsApi.join).toHaveBeenCalledWith('academia-demo', {
      scopes: ['NUTRITION'],
      statsOptIn: false,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Alimentação e Metas/);
  });
});

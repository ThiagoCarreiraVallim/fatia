import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@fatia/api-client';
import { grupo } from '@/app/(org)/org/[groupId]/__tests__/helpers';

const nav = vi.hoisted(() => ({ pathname: '/org/g1/members' }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ groupId: 'g1' }),
  usePathname: () => nav.pathname,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, groupsApi: { get: vi.fn() } };
});

import { groupsApi } from '@fatia/api-client';
import { OrgShell, useOrgGroup } from '../org-shell';

function Filho() {
  return <p>{`dentro de ${useOrgGroup().name}`}</p>;
}

function abrir() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrgShell>
        <Filho />
      </OrgShell>
    </QueryClientProvider>,
  );
}

describe('OrgShell', () => {
  afterEach(() => vi.clearAllMocks());

  it('dono: todas as seções, a atual marcada', async () => {
    vi.mocked(groupsApi.get).mockResolvedValue(grupo());
    abrir();
    expect(await screen.findByText('dentro de Academia Demo')).toBeInTheDocument();
    const membros = screen.getAllByRole('link', { name: 'Membros' });
    for (const l of membros) expect(l).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link', { name: 'Assentos' })[0]).toHaveAttribute(
      'href',
      '/org/g1/seats',
    );
  });

  it('profissional: sem assentos nem configurações', async () => {
    vi.mocked(groupsApi.get).mockResolvedValue(grupo({ role: 'PROFESSIONAL' }));
    abrir();
    await screen.findByText('dentro de Academia Demo');
    expect(screen.queryByRole('link', { name: 'Assentos' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Configurações' })).toBeNull();
  });

  it.each([
    ['membro comum', () => vi.mocked(groupsApi.get).mockResolvedValue(grupo({ role: 'MEMBER' }))],
    [
      'pedido pendente',
      () =>
        vi
          .mocked(groupsApi.get)
          .mockResolvedValue(grupo({ role: 'PROFESSIONAL', status: 'INVITED' })),
    ],
    [
      'quem não é da comunidade',
      () => vi.mocked(groupsApi.get).mockRejectedValue(new ApiError('Group not found', 404)),
    ],
  ])('%s vê "Painel indisponível", sem o conteúdo', async (_quem, preparar) => {
    preparar();
    abrir();
    expect(await screen.findByText('Painel indisponível')).toBeInTheDocument();
    expect(screen.queryByText(/dentro de/)).toBeNull();
  });
});

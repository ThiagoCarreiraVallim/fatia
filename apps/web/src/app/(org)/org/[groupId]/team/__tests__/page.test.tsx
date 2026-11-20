import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup, PermissionTable, StaffOverview, StaffView } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
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
      staff: vi.fn(),
      permissions: vi.fn(),
      setRole: vi.fn(),
      setSpecialty: vi.fn(),
      update: vi.fn(),
    },
  };
});

import { orgApi } from '@fatia/api-client';
import OrgTeamPage from '../page';

const pessoa = (over: Partial<StaffView>): StaffView => ({
  membershipId: 'm',
  name: 'X',
  role: 'PROFESSIONAL',
  specialty: null,
  accompanies: 0,
  panelSeenAt: null,
  isMe: false,
  manageable: true,
  ...over,
});

const EQUIPE: StaffOverview = {
  staff: [
    pessoa({
      membershipId: 'mo',
      name: 'Bruno Esteves',
      role: 'OWNER',
      isMe: true,
      manageable: false,
    }),
    pessoa({ membershipId: 'ma', name: 'Carla Mota', role: 'ADMIN', accompanies: null }),
    pessoa({ membershipId: 'mh', name: 'Helena Prado', specialty: 'TRAINING', accompanies: 18 }),
    pessoa({ membershipId: 'mn', name: 'Nina Alves', role: 'RECEPTION', accompanies: null }),
  ],
  grantableRoles: ['MEMBER', 'ADMIN', 'PROFESSIONAL', 'CREATOR', 'RECEPTION'],
  proSeeOnlyAssigned: false,
  history: [
    {
      at: '2026-11-18T12:00:00.000Z',
      action: 'members.role',
      actorName: 'Bruno Esteves',
      targetName: 'Nina Alves',
      targetCount: 1,
      from: 'PROFESSIONAL',
      to: 'RECEPTION',
    },
  ],
};

const TABELA: PermissionTable = {
  columns: ['OWNER', 'ADMIN', 'PROFESSIONAL', 'CREATOR', 'RECEPTION'],
  rows: [
    {
      key: 'student_data',
      label: 'Ver o que cada aluno compartilhou',
      roles: ['OWNER', 'PROFESSIONAL', 'CREATOR'],
    },
    { key: 'billing', label: 'Assentos e faturas', roles: ['OWNER'] },
  ],
};

function abrir(g: MyGroup, dados: StaffOverview = EQUIPE) {
  ctx.group = g;
  vi.mocked(orgApi.staff).mockResolvedValue(dados);
  vi.mocked(orgApi.permissions).mockResolvedValue(TABELA);
  return renderWithClient(<OrgTeamPage />);
}

describe('painel › equipe e permissões (Pn-19, #404)', () => {
  afterEach(() => vi.clearAllMocks());

  it('lista por papel, busca e diz quando ninguém bate', async () => {
    abrir(grupo());
    await screen.findByText('Helena Prado');
    expect(screen.getByRole('region', { name: 'Donos e administradores' })).toHaveTextContent(
      'Carla Mota',
    );
    expect(
      screen.getByRole('region', { name: 'Recepção · não vê dados de alunos' }),
    ).toHaveTextContent('Nina Alves');
    await userEvent.type(screen.getByLabelText('Buscar na equipe'), 'zzz');
    expect(screen.getByText('Ninguém da equipe com esse nome.')).toBeInTheDocument();
  });

  it('troca o papel e a especialidade de quem é escolhido', async () => {
    vi.mocked(orgApi.setRole).mockResolvedValue({} as never);
    vi.mocked(orgApi.setSpecialty).mockResolvedValue({
      membershipId: 'mh',
      specialty: 'NUTRITION',
      narrowedLinks: 2,
    });
    abrir(grupo());
    await userEvent.click(await screen.findByRole('button', { name: /Helena Prado/ }));
    const det = screen.getByRole('complementary', { name: 'Detalhes de Helena Prado' });
    await userEvent.click(within(det).getByRole('button', { name: 'nutricionista' }));
    await waitFor(() => expect(orgApi.setSpecialty).toHaveBeenCalledWith('g1', 'mh', 'NUTRITION'));
    await userEvent.click(within(det).getByRole('button', { name: 'recepção' }));
    await waitFor(() => expect(orgApi.setRole).toHaveBeenCalledWith('g1', 'mh', 'RECEPTION'));
    expect(within(det).getByRole('link', { name: 'Distribuir' })).toHaveAttribute(
      'href',
      '/org/g1/members?responsavel=mh',
    );
  });

  it('o dono não muda de papel aqui', async () => {
    abrir(grupo());
    await userEvent.click(await screen.findByRole('button', { name: /Bruno Esteves/ }));
    expect(
      screen.getByText('O dono não muda de papel aqui. Para passar adiante, use Configurações.'),
    ).toBeInTheDocument();
  });

  it('tabela da API, "Profissionais veem" e histórico do dono', async () => {
    vi.mocked(orgApi.update).mockResolvedValue({} as never);
    abrir(grupo());
    expect(await screen.findByText('Ver o que cada aluno compartilhou')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Só quem acompanham' }));
    await waitFor(() =>
      expect(orgApi.update).toHaveBeenCalledWith('g1', { proSeeOnlyAssigned: true }),
    );
    expect(
      screen.getByText('Bruno Esteves mudou Nina Alves de profissional para recepção'),
    ).toBeInTheDocument();
  });

  it('admin não vê histórico; profissional nem busca a equipe', async () => {
    const { unmount } = abrir(grupo({ role: 'ADMIN', membershipId: 'ma' }), {
      ...EQUIPE,
      history: null,
    });
    await screen.findByText('Helena Prado');
    expect(screen.queryByText('Histórico da equipe')).toBeNull();
    unmount();
    abrir(grupo({ role: 'PROFESSIONAL', membershipId: 'mh' }));
    expect(screen.getByText('Só o dono e o admin cuidam da equipe')).toBeInTheDocument();
    expect(orgApi.staff).toHaveBeenCalledTimes(1);
  });
});

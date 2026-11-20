import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup, PlanProgramItem, PlanProgramsView } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, planProgramsApi: { list: vi.fn() } };
});

import { planProgramsApi } from '@fatia/api-client';
import OrgProgramsPage from '../page';

const item = (p: Partial<PlanProgramItem> = {}): PlanProgramItem => ({
  offerId: 'o1',
  membershipId: 'm1',
  name: 'Ana Dias',
  title: 'Hipertrofia A/B',
  authorName: 'Helena',
  schedule: 'CALENDAR',
  startDate: '2026-10-27',
  endDate: '2026-11-23',
  status: 'ACTIVE',
  startsInDays: null,
  sharesWorkout: true,
  progress: { done: 6, planned: 16, percent: 38, weekNumber: 2, weeks: 4 },
  phases: [
    { week: 1, focus: 'adaptação', startDate: '2026-10-27', endDate: '2026-11-02', current: false },
    { week: 2, focus: 'volume', startDate: '2026-11-03', endDate: '2026-11-09', current: true },
    { week: 3, focus: 'volume', startDate: '2026-11-10', endDate: '2026-11-16', current: false },
    { week: 4, focus: 'deload', startDate: '2026-11-17', endDate: '2026-11-23', current: false },
  ],
  tags: ['intermediário'],
  ...p,
});

const visao: PlanProgramsView = {
  counts: { all: 3, active: 1, ending: 0, scheduled: 1, ended: 0 },
  items: [
    item(),
    item({
      offerId: 'o2',
      membershipId: 'm2',
      name: 'Júlia Reis',
      title: 'Corrida 5 km',
      status: 'SCHEDULED',
      startDate: '2026-12-01',
      endDate: '2027-01-25',
      startsInDays: 19,
      progress: null,
      phases: [],
    }),
    item({
      offerId: 'o3',
      membershipId: 'm3',
      name: 'Hugo Matos',
      title: 'Push Pull Legs',
      schedule: 'FLEXIBLE',
      startDate: null,
      endDate: null,
      status: 'SENT',
      sharesWorkout: false,
      progress: null,
      phases: [],
    }),
  ],
};

function abrir(v: PlanProgramsView = visao) {
  ctx.group = grupo();
  vi.mocked(planProgramsApi.list).mockResolvedValue(v);
  return renderWithClient(<OrgProgramsPage />);
}

describe('painel › programas (Pn-30, #403)', () => {
  afterEach(() => vi.clearAllMocks());

  it('lista por aluno com tipo, datas, progresso e status; sem Treino, só "enviado"', async () => {
    abrir();
    expect(await screen.findByRole('heading', { name: 'Programas' })).toBeInTheDocument();
    const tabela = screen.getByRole('table', { name: 'Programas por aluno' });
    expect(within(tabela).getByText('Ana Dias · Hipertrofia A/B')).toBeInTheDocument();
    expect(within(tabela).getByText('27 out – 23 nov')).toBeInTheDocument();
    expect(within(tabela).getByText('semana 2 de 4 · 6 de 16')).toBeInTheDocument();
    expect(within(tabela).getByText('em andamento')).toBeInTheDocument();
    expect(within(tabela).getByText('começa em 19 dias')).toBeInTheDocument();
    expect(within(tabela).getByText('Hugo não compartilha Treino')).toBeInTheDocument();
    expect(within(tabela).getByText('enviado')).toBeInTheDocument();
    expect(within(tabela).getByText('sem datas')).toBeInTheDocument();
    expect(
      screen.getByText(/O progresso só aparece para quem compartilha Treino/),
    ).toBeInTheDocument();
  });

  it('fases do bloco do plano escolhido, com a semana de agora', async () => {
    abrir();
    expect(
      await screen.findByRole('heading', { name: 'Fases do bloco · Hipertrofia A/B (Ana)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Semana 2 · volume')).toBeInTheDocument();
    expect(screen.getByText('3 – 9 nov · agora')).toBeInTheDocument();
  });

  it('abas com contagem e busca por aluno ou plano', async () => {
    abrir();
    await screen.findByRole('table', { name: 'Programas por aluno' });
    await userEvent.click(screen.getByRole('tab', { name: /Agendados/ }));
    const tabela = screen.getByRole('table', { name: 'Programas por aluno' });
    expect(within(tabela).queryByText('Ana Dias · Hipertrofia A/B')).not.toBeInTheDocument();
    expect(within(tabela).getByText('Júlia Reis · Corrida 5 km')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Todos/ }));
    await userEvent.type(screen.getByLabelText('Buscar aluno ou plano'), 'push');
    expect(within(tabela).getAllByRole('row')).toHaveLength(2);
  });

  it('vazio: diz como começar', async () => {
    abrir({ counts: { all: 0, active: 0, ending: 0, scheduled: 0, ended: 0 }, items: [] });
    expect(await screen.findByText('Nenhum plano com começo e fim ainda')).toBeInTheDocument();
  });
});

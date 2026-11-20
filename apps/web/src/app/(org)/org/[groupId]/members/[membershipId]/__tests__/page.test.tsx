import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemberFile, MemberWorkoutPlan, MyGroup, PlanTemplate } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('next/navigation', () => ({ useParams: () => ({ membershipId: 'm-ana' }) }));
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
    memberFileApi: {
      file: vi.fn(),
      agenda: vi.fn(),
      sendPlan: vi.fn(),
      removePlan: vi.fn(),
      reorderPlans: vi.fn(),
      createNote: vi.fn(),
      updateNote: vi.fn(),
      removeNote: vi.fn(),
    },
    contentApi: { ...actual.contentApi, plans: vi.fn() },
    professionalApi: { ...actual.professionalApi, readStudent: vi.fn() },
  };
});

import { contentApi, memberFileApi } from '@fatia/api-client';
import OrgMemberPage from '../page';

const plano = (over: Partial<MemberWorkoutPlan> = {}): MemberWorkoutPlan => ({
  offerId: 'o1',
  title: 'Inferior v2',
  status: 'ACTIVE',
  updatePending: false,
  version: 1,
  schedule: 'CALENDAR',
  startDate: '2026-11-10',
  endDate: '2026-12-07',
  weeks: 4,
  weekNumber: 2,
  sessionsDone: 6,
  sessionsPlanned: 16,
  authorName: 'Helena Prado',
  canRemove: true,
  sentAt: '2026-11-10T12:00:00.000Z',
  note: null,
  sourceTemplateId: null,
  position: 0,
  ...over,
});

const ficha = (over: Partial<MemberFile> = {}): MemberFile => ({
  membershipId: 'm-ana',
  groupId: 'g1',
  name: 'Ana Dias',
  role: 'MEMBER',
  joinedAt: '2026-09-03T12:00:00.000Z',
  timezone: 'America/Sao_Paulo',
  proByGroup: true,
  followedBy: ['Helena Prado'],
  grantedToMe: ['WORKOUT', 'NUTRITION'],
  canSendPlans: true,
  canManagePlans: true,
  canWriteNotes: true,
  plans: {
    workout: [
      plano(),
      plano({ offerId: 'o2', title: 'Corrida 5 km', status: 'PENDING', position: 1 }),
    ],
    nutrition: [],
    reorderedBySubject: false,
  },
  week: {
    workouts: { done: 1, target: 4 },
    nutrition: {
      kcalAvg: 1840,
      daysLogged: 6,
      kcalMin: 1800,
      kcalMax: 2200,
      proteinMinG: 120,
      proteinDays: 5,
    },
    body: null,
  },
  nextDays: [
    {
      date: '2026-11-19',
      items: [
        { kind: 'planned', title: 'Inferior v2', state: 'today', weightKg: null, planOrder: 3 },
      ],
    },
  ],
  notes: [
    {
      id: 'n1',
      text: 'Joelho direito dói no agachamento.',
      authorName: 'Helena Prado',
      isMine: true,
      canEdit: true,
      createdAt: '2026-11-18T12:00:00.000Z',
      updatedAt: '2026-11-18T12:00:00.000Z',
    },
  ],
  accessLog: [],
  ...over,
});

const modelo = (over: Partial<PlanTemplate>): PlanTemplate =>
  ({
    id: 't1',
    kind: 'WORKOUT',
    title: 'Glúteos e posterior',
    description: null,
    level: 'intermediate',
    cover: null,
    authorName: 'Helena Prado',
    authorRole: 'PROFESSIONAL',
    publishedAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    exercises: [],
    goals: null,
    meals: [],
    adoptedPlanId: null,
    ...over,
  }) as PlanTemplate;

function abrir(f: MemberFile = ficha()) {
  ctx.group = grupo({ role: 'PROFESSIONAL' });
  vi.mocked(memberFileApi.file).mockResolvedValue(f);
  vi.mocked(memberFileApi.agenda).mockResolvedValue({
    today: '2026-11-19',
    from: '2026-11-16',
    to: '2026-11-22',
    timezone: 'America/Sao_Paulo',
    showsDone: true,
    showsWeighins: false,
    days: [
      {
        date: '2026-11-17',
        items: [{ kind: 'planned', title: 'Push', state: 'done', weightKg: null, planOrder: 2 }],
      },
    ],
  });
  vi.mocked(contentApi.plans).mockResolvedValue([
    modelo({}),
    modelo({ id: 't2', title: 'Hipertrofia', publishedAt: null }),
    modelo({ id: 't3', kind: 'NUTRITION', title: 'Cutting 1.800 kcal' }),
  ]);
  return renderWithClient(<OrgMemberPage />);
}

describe('painel › ficha da pessoa (Pn-05)', () => {
  afterEach(() => vi.clearAllMocks());

  it('cabeçalho, abas com cadeado e o cadeado sem número', async () => {
    abrir();
    expect(await screen.findByRole('heading', { name: 'Ana Dias' })).toBeInTheDocument();
    expect(screen.getByText('PRO pela academia')).toBeInTheDocument();
    expect(screen.getByText(/acompanhada por Helena Prado/)).toBeInTheDocument();

    const abas = screen.getByRole('tablist', { name: 'Seções da ficha' });
    const corpo = within(abas).getByRole('tab', { name: /Corpo e avaliações/ });
    expect(within(corpo).getByLabelText('não compartilhado')).toBeInTheDocument();
    await userEvent.click(corpo);
    expect(screen.getByText('Ana não compartilha Corpo')).toBeInTheDocument();
    expect(screen.queryByText(/kg/)).not.toBeInTheDocument();
  });

  it('resumo: só o que ela compartilha, próximos dias e anotações que ela vê', async () => {
    vi.mocked(memberFileApi.createNote).mockResolvedValue({
      id: 'n2',
      text: 'Trocar o leg press.',
      authorName: 'Helena Prado',
      isMine: true,
      canEdit: true,
      createdAt: '2026-11-19T12:00:00.000Z',
      updatedAt: '2026-11-19T12:00:00.000Z',
    });
    abrir();
    expect(await screen.findByText('1.840 kcal')).toBeInTheDocument();
    expect(screen.getByText('1 de 4')).toBeInTheDocument();
    expect(screen.queryByText('Peso')).not.toBeInTheDocument();
    expect(screen.getByText('O aluno vê estas anotações')).toBeInTheDocument();
    expect(screen.getByText('Joelho direito dói no agachamento.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nova anotação'), 'Trocar o leg press.');
    await userEvent.click(screen.getByRole('button', { name: 'Anotar' }));
    await waitFor(() =>
      expect(memberFileApi.createNote).toHaveBeenCalledWith('g1', 'm-ana', 'Trocar o leg press.'),
    );
  });

  it('planos: reordena e apaga com o diálogo de Pn-05s', async () => {
    vi.mocked(memberFileApi.reorderPlans).mockResolvedValue({ offerIds: ['o2', 'o1'] });
    vi.mocked(memberFileApi.removePlan).mockResolvedValue({ offerId: 'o1', result: 'removed' });
    abrir();
    await userEvent.click(await screen.findByRole('tab', { name: /Planos/ }));
    const tabela = screen.getByRole('table', { name: 'Treino' });
    expect(within(tabela).getByText('aguardando aceite')).toBeInTheDocument();
    expect(within(tabela).getByText('semana 2 de 4 · 6 de 16 sessões')).toBeInTheDocument();
    // #406 (Pn-09e): a cópia dela abre no editor.
    expect(
      within(tabela).getByRole('link', { name: 'Editar a cópia de Inferior v2' }),
    ).toHaveAttribute('href', '/org/g1/members/m-ana/plans/o1');

    await userEvent.click(within(tabela).getAllByRole('button', { name: 'Subir' })[1]!);
    await waitFor(() =>
      expect(memberFileApi.reorderPlans).toHaveBeenCalledWith('g1', 'm-ana', ['o2', 'o1']),
    );

    await userEvent.click(within(tabela).getAllByRole('button', { name: /Apagar/ })[0]!);
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('Apagar “Inferior v2” da Ana?')).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Apagar da Ana' }));
    await waitFor(() =>
      expect(memberFileApi.removePlan).toHaveBeenCalledWith('g1', 'm-ana', 'o1', {
        notify: true,
        endToday: false,
      }),
    );
  });

  it('adicionar plano da biblioteca: só treino, marca o que já está com ela, manda com nota', async () => {
    vi.mocked(memberFileApi.sendPlan).mockResolvedValue({ id: 'o3', versionId: 'v3', version: 1 });
    abrir(
      ficha({
        plans: {
          workout: [plano({ sourceTemplateId: 't2' })],
          nutrition: [],
          reorderedBySubject: false,
        },
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar plano' }));
    const form = await screen.findByRole('form', { name: 'Adicionar plano para a Ana' });
    expect(await within(form).findByText('Glúteos e posterior')).toBeInTheDocument();
    expect(within(form).queryByText('Cutting 1.800 kcal')).not.toBeInTheDocument();
    expect(within(form).getByText('já com a Ana')).toBeInTheDocument();

    await userEvent.click(within(form).getByRole('radio', { name: /Glúteos e posterior/ }));
    await userEvent.type(within(form).getByLabelText(/Nota para a Ana/), 'Reforçar glúteo.');
    await userEvent.click(within(form).getByRole('button', { name: 'Enviar para a Ana' }));
    await waitFor(() =>
      expect(memberFileApi.sendPlan).toHaveBeenCalledWith('g1', 'm-ana', {
        templateId: 't1',
        schedule: 'FLEXIBLE',
        note: 'Reforçar glúteo.',
      }),
    );
  });

  it('agenda: semana com o treino feito, sem reserva nem presença', async () => {
    abrir();
    await userEvent.click(await screen.findByRole('tab', { name: /Agenda/ }));
    expect(await screen.findByText('Push')).toBeInTheDocument();
    expect(screen.getByText('feito')).toBeInTheDocument();
    expect(
      screen.getByText(/o que a equipe planejou e o que ela fez · não é agenda de aulas/),
    ).toBeInTheDocument();
  });
});

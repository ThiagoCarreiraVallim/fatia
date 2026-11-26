import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup, OverviewCell, PanelOverview } from '@fatia/api-client';
import { assentos, grupo, renderWithClient } from './helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('@/components/layout/app-top-bar', () => ({ useTopBarTitle: vi.fn() }));
vi.mock('@/components/org/insights-card', () => ({
  InsightsCard: ({ title }: { title: string }) => <section>{`painel ${title}`}</section>,
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    panelApi: { overview: vi.fn(), counts: vi.fn(), search: vi.fn() },
    seatsApi: { get: vi.fn() },
    insightsApi: { panels: vi.fn() },
    setupApi: { ...actual.setupApi, get: vi.fn(), setStep: vi.fn(), setGuide: vi.fn() },
    reviewApi: { ...actual.reviewApi, queue: vi.fn(), atRisk: vi.fn() },
    demoApi: { ...actual.demoApi, get: vi.fn(), create: vi.fn() },
  };
});

import {
  demoApi,
  insightsApi,
  panelApi,
  reviewApi,
  seatsApi,
  setupApi,
  type CommunitySetup,
} from '@fatia/api-client';
import OrgOverviewPage from '../page';
import { SidePanelProvider, useSidePanel } from '@/components/org/side-panel';
import { useEffect } from 'react';

function AbrePainel() {
  const { open } = useSidePanel();
  useEffect(() => open({ title: 'Novo comunicado', body: null }), [open]);
  return null;
}

const serie = (vals: (number | null)[]): OverviewCell[] =>
  vals.map((v, i) => ({
    key: `2026-11-${String(i + 1).padStart(2, '0')}`,
    value: v,
    suppressed: v === null,
  }));

const visao = (p: Partial<PanelOverview> = {}): PanelOverview => ({
  days: 30,
  counts: { pendingRequests: 2, pendingInvites: 7, openReports: 1, challengeReview: 0 },
  members: { active: 118, joinedLast30Days: 4 },
  newThisWeek: { total: 6, viaInvite: 4, viaPage: 2, viaUnknown: 0 },
  aggregates: {
    active7d: { value: 86, percent: 73 },
    notLoggedYet: 5,
    activity: {
      workouts: serie([10, 12, null, 9, 11, 14, 8, 12]),
      people: serie([8, 9, null, 7, 9, 10, 6, 9]),
    },
  },
  items: {
    needsYou: [
      {
        id: 'm9',
        title: 'Lia Prado pediu para entrar',
        type: 'request',
        status: 'Aguardando',
        person: 'Lia Prado',
        at: '2026-11-17T12:00:00Z',
        owner: null,
        section: 'members',
        refId: null,
      },
    ],
    challenges: [],
    sent: [],
  },
  ...p,
});

function abrir(g: MyGroup, v: PanelOverview = visao(), behavior = false) {
  ctx.group = g;
  vi.mocked(setupApi.get).mockResolvedValue(guia({ visible: false }));
  vi.mocked(panelApi.overview).mockResolvedValue(v);
  vi.mocked(seatsApi.get).mockResolvedValue(assentos());
  vi.mocked(insightsApi.panels).mockResolvedValue({ retention: true, behavior });
  return renderWithClient(<OrgOverviewPage />);
}

const guia = (p: Partial<CommunitySetup> = {}): CommunitySetup => ({
  kind: 'GYM',
  items: [
    { key: 'CREATE', done: true, auto: true },
    { key: 'BRAND', done: true, auto: true },
    { key: 'CATEGORIES', done: true, auto: false },
    { key: 'TEAM', done: false, auto: false },
    { key: 'MEMBERS', done: false, auto: false },
    { key: 'CHALLENGE', done: false, auto: false },
    { key: 'PLAN', done: false, auto: false },
    { key: 'EQUIPMENT', done: false, auto: false },
    { key: 'ACCESS', done: false, auto: false },
  ],
  done: 3,
  total: 9,
  complete: false,
  visible: true,
  brandPending: false,
  webUrl: 'http://localhost:3030/org/g1',
  ...p,
});

describe('primeiros passos do dono no Início (#372, Onb-Criador-Web)', () => {
  afterEach(() => vi.clearAllMocks());

  function abrirGuia(setup: CommunitySetup) {
    ctx.group = grupo({ createdAt: new Date().toISOString() });
    vi.mocked(setupApi.get).mockResolvedValue(setup);
    vi.mocked(panelApi.overview).mockResolvedValue(
      visao({
        members: { active: 0, joinedLast30Days: 0 },
        aggregates: {
          active7d: { value: null, percent: null },
          notLoggedYet: null,
          activity: { workouts: [], people: [] },
        },
      }),
    );
    vi.mocked(reviewApi.queue).mockResolvedValue({ windowDays: 7, items: [] });
    vi.mocked(reviewApi.atRisk).mockResolvedValue({
      riskDays: 10,
      digest: false,
      canConfigure: true,
      rows: [],
    });
    vi.mocked(demoApi.get).mockResolvedValue({ demo: null, canCreate: true } as never);
    return renderWithClient(<OrgOverviewPage />);
  }

  it('o guia toma o Início: n/9, riscados, o próximo em destaque e os 4 números vazios', async () => {
    abrirGuia(guia());
    expect(
      await screen.findByRole('heading', { name: 'Vamos deixar a Academia Demo pronta' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Comunidade criada hoje')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Passos feitos' })).toHaveAttribute(
      'aria-valuenow',
      '3',
    );
    expect(screen.getByText('Academia · fat.ia.br/academia-demo')).toBeInTheDocument();
    // O próximo (equipe) é o "Fazer" cheio e leva à tela da equipe.
    expect(screen.getByRole('link', { name: 'Fazer: Convidar a equipe' })).toHaveAttribute(
      'href',
      '/org/g1/team',
    );
    expect(screen.getByRole('link', { name: 'Fazer: Primeiro desafio' })).toHaveAttribute(
      'href',
      '/org/g1/challenges/first',
    );
    // Categorias foi marcada à mão: dá para desfazer.
    expect(
      screen.getByRole('button', { name: 'Desfazer: Categorias obrigatórias' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('aparece com 5 membros')).toBeInTheDocument();
    expect(screen.getByText('quem sumir aparece aqui')).toBeInTheDocument();
    expect(screen.getByText(/menu do seu perfil → Repetir o guia/)).toBeInTheDocument();
    expect(screen.queryByText('Membros ativos')).toBeNull();
  });

  it('marcar no círculo e esconder o guia vão para a API', async () => {
    abrirGuia(guia());
    vi.mocked(setupApi.setStep).mockResolvedValue(guia({ done: 4 }));
    vi.mocked(setupApi.setGuide).mockResolvedValue(guia({ visible: false }));
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Marcar "Equipamentos" como feito' }),
    );
    expect(setupApi.setStep).toHaveBeenCalledWith('g1', 'EQUIPMENT', true);
    await userEvent.click(screen.getByRole('button', { name: 'Esconder o guia' }));
    expect(setupApi.setGuide).toHaveBeenCalledWith('g1', false);
    // Guia escondido: volta a visão geral de sempre.
    expect(await screen.findByText('Membros ativos')).toBeInTheDocument();
  });

  it('guia escondido ou papel que não é dono: a visão geral de sempre', async () => {
    abrir(grupo({ role: 'ADMIN' }));
    expect(await screen.findByText('Membros ativos')).toBeInTheDocument();
    expect(setupApi.get).not.toHaveBeenCalled();
  });
});

describe('painel › visão geral (Pn-01, #398)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('o dono vê os números, os cartões, o gráfico, os itens e a retenção', async () => {
    abrir(grupo());
    expect(await screen.findByText('Membros ativos')).toBeInTheDocument();
    expect(screen.getByText('118')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Membros ativos/ })).toHaveAttribute(
      'href',
      '/org/g1/members?filtro=pending',
    );
    expect(screen.getByText('2 pedidos aguardando aprovação')).toBeInTheDocument();
    expect(screen.getByText('86')).toBeInTheDocument();
    expect(screen.getByText('73% de quem compartilha estatísticas')).toBeInTheDocument();
    expect(await screen.findByText('1/2')).toBeInTheDocument();
    // A tela de Ativação pendente existe desde a #401: os dois cartões levam a ela.
    expect(screen.getByRole('link', { name: /Ativação pendente/ })).toHaveAttribute(
      'href',
      '/org/g1/activation',
    );
    expect(screen.getByRole('link', { name: /Entraram e ainda não registraram/ })).toHaveAttribute(
      'href',
      '/org/g1/activation',
    );
    expect(screen.getByText('7 convites sem aceite')).toBeInTheDocument();
    expect(screen.getByText('6 entraram · 4 por convite, 2 pela página')).toBeInTheDocument();
    expect(screen.getByText('5 pessoas · só o número, sem nomes')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Atividade dos membros: 76 treinos/ })).toBeVisible();
    expect(
      screen.getByText(
        'Dias com menos de 5 pessoas de cada lado (treinou e não treinou) ficam em branco.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lia Prado pediu para entrar' })).toHaveAttribute(
      'href',
      '/org/g1/members?filtro=pending',
    );
    expect(screen.getByText('painel Retenção')).toBeInTheDocument();
    expect(screen.queryByText('painel Comportamento')).toBeNull();
    expect(screen.getByRole('link', { name: /Relatório do mês/ })).toHaveAttribute(
      'href',
      '/org/g1/report',
    );
    expect(panelApi.overview).toHaveBeenCalledWith('g1', 30);
  });

  it('trocar o período pede de novo; menos de 5 pessoas esconde o cartão de quem não registrou', async () => {
    const user = userEvent.setup();
    abrir(grupo(), visao({ aggregates: { ...visao().aggregates!, notLoggedYet: null } }));
    await screen.findByText('Membros ativos');
    expect(screen.queryByText('Entraram e ainda não registraram')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Últimos 7 dias' }));
    expect(panelApi.overview).toHaveBeenCalledWith('g1', 7);
  });

  it('colunas da tabela ficam salvas por pessoa e comunidade', async () => {
    const user = userEvent.setup();
    abrir(grupo());
    const tabela = await screen.findByRole('table');
    expect(within(tabela).getByRole('columnheader', { name: 'Responsável' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Colunas/ }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Responsável' }));
    expect(within(tabela).queryByRole('columnheader', { name: 'Responsável' })).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem('fatia:panel:overview-columns:mo')!).columns,
    ).not.toContain('owner');
  });

  it('com o painel lateral aberto, a tabela fica só com item, tipo e status (Pn-01b)', async () => {
    ctx.group = grupo();
    vi.mocked(panelApi.overview).mockResolvedValue(visao());
    vi.mocked(seatsApi.get).mockResolvedValue(assentos());
    vi.mocked(insightsApi.panels).mockResolvedValue({ retention: true, behavior: false });
    renderWithClient(
      <SidePanelProvider>
        <AbrePainel />
        <OrgOverviewPage />
      </SidePanelProvider>,
    );
    const tabela = await screen.findByRole('table');
    expect(within(tabela).getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(within(tabela).queryByRole('columnheader', { name: 'Responsável' })).toBeNull();
    expect(within(tabela).queryByRole('columnheader', { name: 'Pessoa' })).toBeNull();
  });

  it('o profissional não vê assentos nem agregados', async () => {
    abrir(
      grupo({ role: 'PROFESSIONAL' }),
      visao({
        aggregates: null,
        counts: { pendingRequests: null, pendingInvites: 3, openReports: null, challengeReview: 0 },
      }),
    );
    expect(await screen.findByText('Membros ativos')).toBeInTheDocument();
    expect(screen.queryByText('Ativos em 7 dias')).toBeNull();
    expect(screen.queryByText('Assentos PRO')).toBeNull();
    expect(screen.queryByRole('img', { name: /Atividade/ })).toBeNull();
    expect(screen.queryByText(/painel/)).toBeNull();
    expect(seatsApi.get).not.toHaveBeenCalled();
    expect(insightsApi.panels).not.toHaveBeenCalled();
  });

  it('com o add-on, o painel de comportamento aparece', async () => {
    abrir(grupo(), visao(), true);
    expect(await screen.findByText('painel Comportamento')).toBeInTheDocument();
  });
});

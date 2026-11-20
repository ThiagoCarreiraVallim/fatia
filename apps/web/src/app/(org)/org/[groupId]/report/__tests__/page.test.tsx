import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InviteOrigins, MonthReport, MyGroup, ReportSettings } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

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
    reportApi: {
      report: vi.fn(),
      origins: vi.fn(),
      settings: vi.fn(),
      updateSettings: vi.fn(),
      setRecipient: vi.fn(),
    },
  };
});

import { reportApi } from '@fatia/api-client';
import { toast } from 'sonner';
import ReportPage from '../page';

const cell = (key: string, value: number | null) => ({ key, value, suppressed: value === null });

const relatorio = (p: Partial<MonthReport> = {}): MonthReport => ({
  month: '2026-10',
  months: ['2026-10', '2026-09', '2026-08'],
  groupName: 'Academia Demo',
  optIn: 97,
  riskDays: 7,
  weeklySessionsGoal: 300,
  activeMembers: { value: 76, percent: 78, deltaPts: 4, delta: 12 },
  sessions: { total: 1284, perActive: 16.9, deltaPct: 9 },
  trainingDays: { perActive: 10.3, deltaPct: -2 },
  returned: 14,
  atRisk: 9,
  plans: { sent: 36, acceptedPercent: 81, declined: 4, noResponse: 3 },
  reviews: { reviewed: 120, withinDayPercent: 94, medianHours: 3 },
  weeks: [
    { ...cell('1', 310), days: 7 },
    { ...cell('8', 290), days: 7 },
    { ...cell('15', null), days: 7 },
    { ...cell('22', 340), days: 7 },
    { ...cell('29', 120), days: 3 },
  ],
  weeksAverage: 321,
  weeksOnGoal: { hit: 2, of: 3 },
  activeByDay: ['07', '14', '21', '28', '31'].map((d, i) => cell(`2026-10-${d}`, 40 + i * 9)),
  challenges: [
    {
      id: 'c1',
      title: 'Outubro em movimento',
      kind: 'METRIC',
      participants: 31,
      finished: 12,
      reviewed: 23,
      voided: 5,
    },
    {
      id: 'c2',
      title: 'Água todo dia',
      kind: 'WATER',
      participants: null,
      finished: 'running',
      reviewed: null,
      voided: null,
    },
  ],
  challengeLift: 2.1,
  ...p,
});

const origens = (p: Partial<InviteOrigins> = {}): InviteOrigins => ({
  days: 30,
  joined: 33,
  activated: 20,
  percent: 61,
  rows: [
    {
      key: 'a',
      origin: 'QR',
      label: 'recepção',
      kind: 'qr',
      joined: 19,
      activated: 15,
      percent: 79,
    },
    {
      key: 'b',
      origin: 'INSTAGRAM',
      label: null,
      kind: 'link',
      joined: 14,
      activated: null,
      percent: null,
    },
  ],
  ...p,
});

const ajustes = (p: Partial<ReportSettings> = {}): ReportSettings => ({
  weeklySessionsGoal: 300,
  reportEmailEnabled: true,
  emailAvailable: true,
  team: [
    { membershipId: 'mo', name: 'Dona Ana', role: 'OWNER', reportEmail: true },
    { membershipId: 'm-Carla', name: 'Carla', role: 'PROFESSIONAL', reportEmail: false },
  ],
  ...p,
});

function abrir(r = relatorio(), params = '', a = ajustes()) {
  ctx.group = grupo();
  ctx.params = new URLSearchParams(params);
  vi.mocked(reportApi.report).mockResolvedValue(r);
  vi.mocked(reportApi.origins).mockResolvedValue(origens());
  vi.mocked(reportApi.settings).mockResolvedValue(a);
  return renderWithClient(<ReportPage />);
}

describe('relatório do mês (#400, Pn-03)', () => {
  afterEach(() => vi.clearAllMocks());

  it('cabeçalho, cartões com a base de quem aceitou e variação', async () => {
    abrir();
    expect(
      await screen.findByRole('heading', { name: 'Relatório de outubro' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Agregado da comunidade · ninguém aparece com nome')).toBeVisible();
    const cartoes = screen.getByRole('list', { name: 'Resumo do mês' });
    expect(within(cartoes).getByText('78%')).toBeInTheDocument();
    expect(within(cartoes).getByText('+4 pts')).toBeInTheDocument();
    expect(
      within(cartoes).getByText('76 de 97 que aceitaram entrar nas estatísticas'),
    ).toBeInTheDocument();
    expect(within(cartoes).getByText('1.284')).toBeInTheDocument();
    expect(within(cartoes).getByText('+9%')).toBeInTheDocument();
    expect(within(cartoes).getByText('Dias com treino')).toBeInTheDocument();
    expect(within(cartoes).getByText('−2%')).toBeInTheDocument();
    expect(within(cartoes).getByText('Voltaram após 14 dias')).toBeInTheDocument();
    expect(within(cartoes).getByText('Sem treino há 7+ dias')).toBeInTheDocument();
    expect(
      within(cartoes).getByText('81% aceitos · 4 recusados · 3 sem resposta'),
    ).toBeInTheDocument();
    expect(within(cartoes).getByText('em até 1 dia · mediana de 3 h')).toBeInTheDocument();
    // Visitas e avaliações ficam de fora (sem cartão vazio, sem "em breve").
    expect(screen.queryByText(/Visitas/)).toBeNull();
    expect(screen.queryByText(/Avaliações/)).toBeNull();
    expect(screen.queryByText(/em breve/i)).toBeNull();
    expect(reportApi.report).toHaveBeenCalledWith('g1', undefined);
  });

  it('gráficos: semanas com a meta e a semana oculta; ativos ao longo do mês', async () => {
    abrir();
    const barras = await screen.findByRole('img', { name: /Sessões por semana/ });
    expect(barras).toHaveAccessibleName(
      'Sessões por semana: S1 310, S2 290, S3 amostra pequena, S4 340, S5 120 (3 dias)',
    );
    // Média em destaque, como na Pn-03.
    expect(screen.getByText('média').parentElement).toHaveTextContent('321 média');
    expect(screen.getByText('321')).toHaveClass('text-3xl');
    expect(screen.getByText('meta da equipe 300')).toBeInTheDocument();
    expect(screen.getByText('2 de 3 semanas na meta da equipe')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Membros ativos ao longo do mês/ })).toBeVisible();
    expect(screen.getByText('pessoas').parentElement).toHaveTextContent('76 pessoas');
    expect(screen.getByText('+12 no mês')).toHaveAccessibleName('+12 em relação ao mês anterior');
    // Eixo do tempo: começo, meio e fim.
    for (const d of ['7 out', '21 out', '31 out']) expect(screen.getByText(d)).toBeInTheDocument();
  });

  it('ativos: semana suprimida fala de semana, não de dia', async () => {
    abrir(
      relatorio({
        activeByDay: ['07', '14', '21', '28', '31'].map((d, i) =>
          cell(`2026-10-${d}`, i === 1 ? null : 40 + i * 9),
        ),
      }),
    );
    const ativos = await screen.findByRole('region', { name: /^Membros ativos/ });
    expect(
      within(ativos).getByText('Semanas com menos de 5 pessoas de cada lado ficam em branco.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Dias com menos de 5/)).toBeNull();
  });

  it('desafios sem nome de ninguém e a comparação de quem participa', async () => {
    abrir();
    const tabela = await screen.findByRole('table', { name: /Desafios do mês/ });
    const linhas = within(tabela).getAllByRole('row');
    expect(within(linhas[1]!).getByText('Outubro em movimento')).toBeInTheDocument();
    expect(within(linhas[1]!).getByText('treinos')).toBeInTheDocument();
    expect(within(linhas[1]!).getByText('23 · 5 anulados')).toBeInTheDocument();
    expect(within(linhas[2]!).getByText('em andamento')).toBeInTheDocument();
    expect(within(linhas[2]!).getAllByText('menos de 5')).toHaveLength(2);
    expect(
      screen.getByText(
        'Quem participa de algum desafio registra 2,1× mais dias no mês do que quem não participa.',
      ),
    ).toBeInTheDocument();
  });

  it('origem dos convites resumida, com link para a tela inteira', async () => {
    abrir();
    const bloco = await screen.findByRole('region', { name: /Origem dos convites/ });
    expect(await within(bloco).findByText('QR · recepção')).toBeInTheDocument();
    expect(within(bloco).getByText('19 entraram · 15 ativaram')).toBeInTheDocument();
    expect(within(bloco).getByText('79%')).toBeInTheDocument();
    expect(within(bloco).getByText('amostra pequena demais para mostrar')).toBeInTheDocument();
    expect(within(bloco).getByRole('link', { name: 'Abrir' })).toHaveAttribute(
      'href',
      '/org/g1/origins',
    );
    expect(reportApi.origins).toHaveBeenCalledWith('g1', 30);
  });

  it('trocar o mês pede de novo; o mês do link do e-mail já abre escolhido', async () => {
    const user = userEvent.setup();
    abrir(relatorio(), 'month=2026-09');
    await screen.findByRole('heading', { name: 'Relatório de outubro' });
    expect(reportApi.report).toHaveBeenCalledWith('g1', '2026-09');
    const seletor = screen.getByRole('combobox', { name: 'Mês do relatório' });
    // Só meses fechados: o corrente não aparece.
    expect(
      within(seletor)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['outubro', 'setembro', 'agosto']);
    expect(screen.queryByText(/até ontem/)).toBeNull();
    await user.selectOptions(seletor, '2026-08');
    await waitFor(() => expect(reportApi.report).toHaveBeenLastCalledWith('g1', '2026-08'));
  });

  it('o que não passa do mínimo de 5 diz "amostra pequena", nunca zero', async () => {
    abrir(
      relatorio({
        optIn: null,
        activeMembers: { value: null, percent: null, deltaPts: null, delta: null },
        sessions: { total: null, perActive: null, deltaPct: null },
        returned: null,
      }),
    );
    const cartoes = await screen.findByRole('list', { name: 'Resumo do mês' });
    expect(
      within(cartoes).getByText('menos de 5 aceitaram entrar nas estatísticas'),
    ).toBeInTheDocument();
    expect(within(cartoes).getAllByText('amostra pequena demais para mostrar').length).toBe(3);
  });

  it('Baixar PDF usa a impressão do navegador', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Baixar PDF' }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('e-mail mensal: liga e desliga, marca quem da equipe recebe e muda a meta', async () => {
    const user = userEvent.setup();
    abrir();
    vi.mocked(reportApi.updateSettings).mockResolvedValue(ajustes({ reportEmailEnabled: false }));
    vi.mocked(reportApi.setRecipient).mockResolvedValue(ajustes());
    const sec = await screen.findByRole('region', { name: 'E-mail mensal e meta' });
    expect(await within(sec).findByText('Dona Ana')).toBeInTheDocument();
    expect(within(sec).getByText('sempre recebe')).toBeInTheDocument();
    await user.click(within(sec).getByRole('switch', { name: /Mandar o relatório por e-mail/ }));
    expect(reportApi.updateSettings).toHaveBeenCalledWith('g1', { reportEmailEnabled: false });
    await user.click(within(sec).getByRole('checkbox', { name: 'Carla recebe o relatório' }));
    expect(reportApi.setRecipient).toHaveBeenCalledWith('g1', 'm-Carla', true);

    const meta = within(sec).getByRole('spinbutton', { name: 'Meta de sessões por semana' });
    await user.clear(meta);
    await user.type(meta, '350');
    await user.click(within(sec).getByRole('button', { name: 'Salvar meta' }));
    expect(reportApi.updateSettings).toHaveBeenLastCalledWith('g1', { weeklySessionsGoal: 350 });
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Meta salva.'));
  });

  it('sem e-mail no servidor, avisa e não deixa ligar', async () => {
    abrir(relatorio(), '', ajustes({ emailAvailable: false }));
    const sec = await screen.findByRole('region', { name: 'E-mail mensal e meta' });
    expect(await within(sec).findByText(/envio de e-mail não está ligado/)).toBeInTheDocument();
    expect(within(sec).getByRole('switch', { name: /Mandar o relatório/ })).toBeDisabled();
  });
});

import { describe, expect, it } from 'vitest';
import {
  activationLabel,
  announcementDeliveryLine,
  lockScreenPreview,
  newThisWeekLabel,
  notLoggedYetLabel,
  panelBreadcrumb,
  panelNav,
  pushQuotaHint,
  pushRecent,
  searchEntries,
  type PanelCounts,
} from '../panel-shell';

const contas: PanelCounts = {
  pendingRequests: 2,
  pendingInvites: 7,
  openReports: 1,
  challengeReview: 3,
};

describe('menu do painel (#398)', () => {
  it('dono: grupos na ordem do canvas, só com telas que existem, e contadores somados', () => {
    const nav = panelNav('OWNER', contas);
    expect(nav.map((g) => g.label)).toEqual([
      'Acompanhar',
      'Pessoas',
      'Conteúdo',
      'Comunidade',
      'IA',
    ]);
    const pessoas = nav.find((g) => g.key === 'people')!;
    expect(pessoas.items.map((i) => i.label)).toEqual([
      'Membros',
      'Convites',
      'Ativação pendente',
      'Origem dos convites',
      'Assentos e faturas',
    ]);
    // Os convites sem aceite contam em Ativação pendente (#401), como na Pn-04.
    expect(pessoas.items.map((i) => i.count)).toEqual([2, null, 7, null, null]);
    // O relatório do mês (#400) fica em Acompanhar, depois de Para revisar.
    expect(nav.find((g) => g.key === 'track')!.items.map((i) => i.label)).toEqual([
      'Visão geral',
      'Para revisar',
      'Relatório',
    ]);
    expect(pessoas.count).toBe(9);
    const comunidade = nav.find((g) => g.key === 'community')!;
    expect(comunidade.items.map((i) => i.label)).toEqual([
      'Mural e avisos',
      'Comunicados e enquetes',
      'Desafios',
      'Benefícios',
    ]);
    expect(comunidade.count).toBe(4);
  });

  it('profissional: sem assentos, moderação, benefícios, agente nem configurações; grupo vazio some', () => {
    const nav = panelNav('PROFESSIONAL', { ...contas, pendingRequests: null, openReports: null });
    const secoes = nav.flatMap((g) => g.items.map((i) => i.section));
    expect(secoes).not.toContain('seats');
    expect(secoes).not.toContain('moderation');
    expect(secoes).not.toContain('agent');
    // Relatório e origens são do dono por enquanto (#400; os outros papéis com a #404).
    expect(secoes).not.toContain('report');
    expect(secoes).not.toContain('origins');
    expect(nav.map((g) => g.key)).not.toContain('ai');
    expect(nav.find((g) => g.key === 'people')!.items[0]!.count).toBeNull();
  });

  it('membro não tem menu', () => {
    expect(panelNav('MEMBER')).toEqual([]);
  });

  it('migalha do topo: grupo e tela', () => {
    expect(panelBreadcrumb('/org/g1')).toEqual({ group: 'Acompanhar', label: 'Visão geral' });
    expect(panelBreadcrumb('/org/g1/members/m1')).toEqual({ group: 'Pessoas', label: 'Membros' });
    expect(panelBreadcrumb('/org/g1/settings')).toEqual({ group: null, label: 'Configurações' });
    expect(panelBreadcrumb('/org/g1/report')).toEqual({ group: 'Acompanhar', label: 'Relatório' });
    expect(panelBreadcrumb('/org/g1/origins')).toEqual({
      group: 'Pessoas',
      label: 'Origem dos convites',
    });
    expect(panelBreadcrumb('/org/g1/activation')).toEqual({
      group: 'Pessoas',
      label: 'Ativação pendente',
    });
  });
});

describe('cartões da Visão geral', () => {
  it('textos dos cartões', () => {
    expect(newThisWeekLabel({ total: 6, viaInvite: 4, viaPage: 2, viaUnknown: 0 })).toBe(
      '6 entraram · 4 por convite, 2 pela página',
    );
    expect(newThisWeekLabel({ total: 1, viaInvite: 1, viaPage: 0, viaUnknown: 0 })).toBe(
      '1 entrou · 1 por convite',
    );
    expect(newThisWeekLabel({ total: 0, viaInvite: 0, viaPage: 0, viaUnknown: 0 })).toBe(
      'Ninguém entrou ainda',
    );
    // Quem entrou sem origem gravada fecha a soma.
    expect(newThisWeekLabel({ total: 5, viaInvite: 3, viaPage: 1, viaUnknown: 1 })).toBe(
      '5 entraram · 3 por convite, 1 pela página, 1 sem origem',
    );
    expect(activationLabel(7)).toBe('7 convites sem aceite');
    expect(activationLabel(1)).toBe('1 convite sem aceite');
    expect(notLoggedYetLabel(5)).toBe('5 pessoas · só o número, sem nomes');
  });
});

describe('busca ⌘K', () => {
  it('agrupa membros, telas e planos com o caminho de cada um', () => {
    const g = searchEntries('g1', {
      members: [
        { membershipId: 'm1', name: 'Ana Dias', role: 'MEMBER', status: 'ACTIVE' },
        { membershipId: 'm2', name: 'Ana Clara', role: 'MEMBER', status: 'INVITED' },
      ],
      screens: [{ key: 'seats', label: 'Assentos e faturas', group: 'Pessoas' }],
      plans: [{ id: 't1', title: 'Hipertrofia A/B', kind: 'WORKOUT', published: true }],
    });
    expect(g.map((x) => x.group)).toEqual(['Membros', 'Telas', 'Planos']);
    expect(g[0]!.items).toEqual([
      {
        id: 'member:m1',
        kind: 'member',
        title: 'Ana Dias',
        subtitle: 'membro',
        href: '/org/g1/members/m1',
      },
      {
        id: 'member:m2',
        kind: 'member',
        title: 'Ana Clara',
        subtitle: 'pedido para entrar',
        href: '/org/g1/members?filtro=pending',
      },
    ]);
    expect(g[1]!.items[0]).toMatchObject({ href: '/org/g1/seats', subtitle: 'Pessoas' });
    expect(g[2]!.items[0]).toMatchObject({
      href: '/org/g1/content/plans/t1',
      subtitle: 'plano de treino',
    });
  });

  it('tela que a web não conhece fica de fora; grupo vazio some', () => {
    const g = searchEntries('g1', {
      members: [],
      screens: [{ key: 'qualquer', label: 'X', group: 'Y' }],
      plans: [],
    });
    expect(g).toEqual([]);
  });

  it('recentes: o mais novo na frente, sem repetir, até 5', () => {
    let r: { id: string }[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'b']) r = pushRecent(r, { id });
    expect(r.map((x) => x.id)).toEqual(['b', 'f', 'e', 'd', 'c']);
  });
});

describe('comunicado no painel lateral', () => {
  it('prévia da tela bloqueada sem markdown e cortada', () => {
    const p = lockScreenPreview({
      groupName: 'Academia Demo',
      title: 'Feriado de sexta',
      body: 'Abrimos **das 8h às 14h** na sexta, 15 de novembro. Aulas coletivas canceladas. Tragam água e toalha, por favor.',
    });
    expect(p.app).toBe('FATIA · ACADEMIA DEMO');
    expect(p.title).toBe('Feriado de sexta');
    expect(p.body).not.toContain('**');
    expect(p.body.length).toBeLessThanOrEqual(90);
    expect(p.body.endsWith('…')).toBe(true);
  });

  it('limite da semana e contas de entrega', () => {
    expect(pushQuotaHint({ pushWeeklyLimit: 3, pushUsedThisWeek: 1, emailAvailable: true })).toBe(
      '1 de 3 avisos da semana usados',
    );
    expect(pushQuotaHint({ pushWeeklyLimit: 3, pushUsedThisWeek: 3, emailAvailable: true })).toBe(
      'Limite de 3 avisos por semana atingido: este sai só no mural',
    );
    expect(
      announcementDeliveryLine({
        push: true,
        alsoEmail: true,
        pushSent: 12,
        pushDelivered: 10,
        emailSent: 8,
      }),
    ).toBe('12 notificações · 10 entregues no celular · 8 e-mails');
    expect(
      announcementDeliveryLine({
        push: false,
        alsoEmail: false,
        pushSent: 0,
        pushDelivered: 0,
        emailSent: 0,
      }),
    ).toBe('só no mural');
  });
});

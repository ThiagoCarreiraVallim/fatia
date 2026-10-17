import { describe, expect, it } from 'vitest';
import type { InviteView, PanelMember, SeatsOverview } from '../community-admin';
import {
  activePanelSection,
  batchResultMessage,
  canOpenPanel,
  cellKeyLabel,
  cellValueLabel,
  filterMembers,
  hasFreeSeat,
  inviteSummary,
  MAX_BATCH_INVITES,
  panelHref,
  panelSections,
  parseInviteEmails,
  parsedEmailsSummary,
  pendingRequests,
  seatChangeHint,
  seatSummary,
} from '../community-panel';

const visao = (extra: Partial<SeatsOverview> = {}): SeatsOverview => ({
  groupId: 'g1',
  unitPriceCents: 1490,
  webCheckout: true,
  pool: {
    seats: 5,
    nextPeriodSeats: null,
    status: 'ACTIVE',
    manual: false,
    currentPeriodEnd: '2026-11-17T03:00:00.000Z',
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
    paymentUrl: null,
    monthlyCents: 7450,
    nextMonthlyCents: 7450,
  },
  assigned: 3,
  assignments: [],
  pendingCharges: [],
  ...extra,
});

describe('quem abre o painel e com que seções', () => {
  it('dono vê tudo; profissional, membros e convites; os demais, nada', () => {
    expect(panelSections('OWNER').map((s) => s.section)).toEqual([
      'overview',
      'members',
      'invites',
      'seats',
      'settings',
    ]);
    expect(panelSections('PROFESSIONAL').map((s) => s.section)).toEqual([
      'overview',
      'members',
      'invites',
    ]);
    expect(panelSections('CREATOR')).toEqual([]);
    expect(panelSections('MEMBER')).toEqual([]);
  });

  it('só equipe ativa abre o painel', () => {
    expect(canOpenPanel({ role: 'OWNER', status: 'ACTIVE' })).toBe(true);
    expect(canOpenPanel({ role: 'PROFESSIONAL', status: 'ACTIVE' })).toBe(true);
    expect(canOpenPanel({ role: 'PROFESSIONAL', status: 'INVITED' })).toBe(false);
    expect(canOpenPanel({ role: 'MEMBER', status: 'ACTIVE' })).toBe(false);
  });

  it('caminhos e seção ativa', () => {
    expect(panelHref('g1')).toBe('/org/g1');
    expect(panelHref('g1', 'seats')).toBe('/org/g1/seats');
    expect(activePanelSection('/org/g1')).toBe('overview');
    expect(activePanelSection('/org/g1/members/m9')).toBe('members');
    expect(activePanelSection('/org/g1/invites?x=1')).toBe('invites');
  });
});

describe('parseInviteEmails', () => {
  it('lê linhas, vírgulas e CSV com cabeçalho, sem repetir', () => {
    const r = parseInviteEmails('email\n"Ana@X.com"; bia@y.com.br,ana@x.com\nnao-e-email\n\n');
    expect(r).toEqual({
      valid: ['ana@x.com', 'bia@y.com.br'],
      invalid: ['nao-e-email'],
      duplicates: ['ana@x.com'],
      overLimit: [],
    });
  });

  it('o que passa de um lote fica de fora, sem sumir', () => {
    const lista = Array.from({ length: MAX_BATCH_INVITES + 2 }, (_, i) => `p${i}@x.com`);
    const r = parseInviteEmails(lista.join('\n'));
    expect(r.valid).toHaveLength(MAX_BATCH_INVITES);
    expect(r.overLimit).toEqual([`p${MAX_BATCH_INVITES}@x.com`, `p${MAX_BATCH_INVITES + 1}@x.com`]);
  });

  it('resume a prévia no singular e no plural', () => {
    expect(parsedEmailsSummary(parseInviteEmails('a@x.com\nruim\na@x.com'))).toBe(
      '1 válido · 1 inválido · 1 repetido',
    );
    expect(parsedEmailsSummary(parseInviteEmails('a@x.com b@x.com x y'))).toBe(
      '2 válidos · 2 inválidos',
    );
  });

  it('resultado do lote', () => {
    expect(batchResultMessage(1, 0)).toBe('1 convite enviado');
    expect(batchResultMessage(3, 2)).toBe('3 convites enviados · 2 pulados');
  });
});

describe('convites e assentos', () => {
  const convite = (extra: Partial<InviteView>): InviteView => ({
    id: 'i1',
    role: 'MEMBER',
    email: null,
    maxUses: null,
    uses: 0,
    expiresAt: '2026-10-24T12:00:00.000Z',
    createdAt: '2026-10-17T12:00:00.000Z',
    lastSentAt: null,
    ...extra,
  });

  it('resume link e e-mail', () => {
    expect(inviteSummary(convite({ uses: 3, maxUses: 10 }))).toBe(
      'Link · 3 de 10 usos · vence 24 out',
    );
    expect(inviteSummary(convite({ uses: 1 }))).toBe('Link · 1 uso · vence 24 out');
    expect(inviteSummary(convite({ email: 'ana@x.com', maxUses: 1 }))).toBe(
      'ana@x.com · vence 24 out',
    );
  });

  it('resume os assentos', () => {
    expect(seatSummary(visao())).toBe('3 de 5 em uso · R$ 74,50/mês');
    expect(seatSummary(visao({ pool: null, assigned: 0 }))).toBe(
      'Sem assentos · R$ 14,90 por pessoa/mês',
    );
    expect(seatSummary(visao({ pool: { ...visao().pool!, manual: true } }))).toBe(
      '3 de 5 em uso · cortesia',
    );
  });

  it('assento livre só em pool pago com vaga', () => {
    expect(hasFreeSeat(visao())).toBe(true);
    expect(hasFreeSeat(visao({ assigned: 5 }))).toBe(false);
    expect(hasFreeSeat(visao({ pool: { ...visao().pool!, status: 'PENDING' } }))).toBe(false);
  });

  it('explica o que muda ao trocar a quantidade', () => {
    expect(seatChangeHint(visao(), 5)).toBeNull();
    expect(seatChangeHint(visao(), 7)).toMatch(/^Vale na hora: a mensalidade passa a R\$ 104,30/);
    expect(seatChangeHint(visao(), 4)).toBe(
      'Vale na renovação: a mensalidade passa a R$ 59,60 no próximo ciclo.',
    );
    expect(seatChangeHint(visao(), 2)).toBe('Há 3 pessoas com assento. Retire 1 antes de reduzir.');
  });
});

describe('membros', () => {
  const m = (name: string, extra: Partial<PanelMember> = {}): PanelMember => ({
    membershipId: name,
    name,
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: null,
    ...extra,
  });
  const lista = [
    m('Dona', { role: 'OWNER' }),
    m('Helena', { role: 'PROFESSIONAL' }),
    m('João'),
    m('Márcia', { status: 'INVITED' }),
  ];

  it('filtra por aguardando, equipe e nome sem acento', () => {
    expect(pendingRequests(lista).map((x) => x.name)).toEqual(['Márcia']);
    expect(filterMembers(lista, 'team').map((x) => x.name)).toEqual(['Dona', 'Helena']);
    expect(filterMembers(lista, 'all').map((x) => x.name)).toEqual([
      'Márcia',
      'Dona',
      'Helena',
      'João',
    ]);
    expect(filterMembers(lista, 'all', 'joao').map((x) => x.name)).toEqual(['João']);
    expect(filterMembers(lista, 'pending', 'marc').map((x) => x.name)).toEqual(['Márcia']);
  });
});

describe('células do painel agregado', () => {
  it('rótulo do eixo', () => {
    expect(cellKeyLabel('2026-10-12')).toBe('12 out');
    expect(cellKeyLabel('2026-03')).toBe('mar/26');
    expect(cellKeyLabel('manhã')).toBe('manhã');
  });

  it('suprimida nunca vira zero', () => {
    expect(cellValueLabel({ key: 'a', value: null, n: null, suppressed: true })).toBe(
      'menos de 5 pessoas',
    );
    expect(cellValueLabel({ key: 'a', value: 0, n: 6, suppressed: false })).toBe('0');
    expect(cellValueLabel({ key: 'a', value: 62.5, n: 8, suppressed: false })).toBe('62,5');
  });
});

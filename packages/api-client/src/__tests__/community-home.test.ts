import { describe, expect, it } from 'vitest';
import {
  accessLogLine,
  communityCardBadges,
  communityCardMeta,
  entryPolicyView,
  parseCommunityEntry,
  teamSections,
  timezoneLabel,
  viewedToday,
} from '../community-home';
import type { MyGroup, TeamMemberView } from '../community';

const TOKEN = 'a'.repeat(43);

describe('parseCommunityEntry', () => {
  it('lê o código digitado, com espaço e caixa quaisquer', () => {
    expect(parseCommunityEntry('  ad7k-3q9p ')).toEqual({ kind: 'code', code: 'ad7k-3q9p' });
    expect(parseCommunityEntry('academia-demo')).toEqual({ kind: 'code', code: 'academia-demo' });
  });

  it('lê o link do QR com ?code=, ou terminado no código', () => {
    expect(parseCommunityEntry('https://app.fat.ia.br/community?join=1&code=AD7K3Q9P')).toEqual({
      kind: 'code',
      code: 'AD7K3Q9P',
    });
    expect(parseCommunityEntry('https://fat.ia.br/entrar/academia-demo')).toEqual({
      kind: 'code',
      code: 'academia-demo',
    });
  });

  it('o link de convite vira o token, que entra pelo caminho do convite', () => {
    expect(parseCommunityEntry(`https://app.fat.ia.br/c/${TOKEN}`)).toEqual({
      kind: 'invite',
      token: TOKEN,
    });
    expect(parseCommunityEntry(`fatia://c/${TOKEN}?x=1`)).toEqual({ kind: 'invite', token: TOKEN });
    expect(parseCommunityEntry(TOKEN)).toEqual({ kind: 'invite', token: TOKEN });
  });

  it('curto demais ou sem nada legível é null', () => {
    expect(parseCommunityEntry('ab')).toBeNull();
    expect(parseCommunityEntry('')).toBeNull();
    expect(parseCommunityEntry('não é código!')).toBeNull();
  });
});

const grupo = (over: Partial<MyGroup> = {}): MyGroup => ({
  id: 'g1',
  type: 'SPONSORED',
  name: 'Academia Demo',
  slug: 'academia-demo',
  description: null,
  joinPolicy: 'APPROVAL',
  role: 'MEMBER',
  status: 'ACTIVE',
  membershipId: 'm1',
  joinedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  consentScopes: [],
  statsOptIn: false,
  hasAiSeat: true,
  avatarUrl: null,
  postPolicy: 'ALL_MEMBERS',
  requiredSharingScopes: [],
  visibility: 'PRIVATE',
  timezone: 'America/Cuiaba',
  memberCount: 124,
  newPostCount: 2,
  forYouCount: 3,
  challenge: { id: 'c1', title: 'Março', rank: 5 },
  ...over,
});

describe('cartão de Minhas comunidades (Cm-01)', () => {
  it('tipo, papel e pessoas na linha de baixo', () => {
    expect(communityCardMeta(grupo())).toBe('patrocinada · membro · 124 pessoas');
    expect(communityCardMeta(grupo({ type: 'SOCIAL', role: 'OWNER', memberCount: 1 }))).toBe(
      'social · dono · 1 pessoa',
    );
    expect(communityCardMeta(grupo({ status: 'INVITED' }))).toBe(
      'patrocinada · aguardando aprovação',
    );
  });

  it('os selos só aparecem com algo a dizer', () => {
    expect(communityCardBadges(grupo())).toEqual([
      { label: '3 para você', tone: 'team' },
      { label: '2 posts novos', tone: 'muted' },
      { label: 'desafio · 5º', tone: 'ok' },
    ]);
    expect(
      communityCardBadges(
        grupo({ forYouCount: 0, newPostCount: 1, challenge: null, visibility: 'PUBLIC' }),
      ),
    ).toEqual([
      { label: '1 post novo', tone: 'muted' },
      { label: 'pública', tone: 'muted' },
    ]);
  });
});

describe('entryPolicyView', () => {
  it('aberta entra na hora; aprovação pede', () => {
    expect(entryPolicyView('OPEN')).toEqual({
      badge: 'aberta',
      tone: 'ok',
      text: 'Entra na hora',
      cta: 'Entrar',
    });
    expect(entryPolicyView('APPROVAL')).toEqual({
      badge: 'com aprovação',
      tone: 'warn',
      text: 'O dono aprova seu pedido',
      cta: 'Pedir para entrar',
    });
    expect(entryPolicyView('INVITE_ONLY').badge).toBe('por convite');
  });
});

describe('Sobre (Cm-04)', () => {
  it('o fuso pela cidade', () => {
    expect(timezoneLabel('America/Cuiaba')).toBe('fuso Cuiabá');
    expect(timezoneLabel('America/Sao_Paulo')).toBe('fuso São Paulo');
    expect(timezoneLabel('Europe/Lisbon')).toBe('fuso Lisbon');
  });

  it('a equipe em seções, na ordem do papel', () => {
    const t = (name: string, role: TeamMemberView['role']): TeamMemberView => ({
      name,
      role,
      sees: [],
      lastViewedAt: null,
    });
    const secoes = teamSections([
      t('Helena', 'PROFESSIONAL'),
      t('Bruno', 'OWNER'),
      t('Cris', 'CREATOR'),
    ]);
    expect(secoes.map((s) => [s.title, s.members.map((m) => m.name)])).toEqual([
      ['Donos', ['Bruno']],
      ['Profissionais', ['Helena']],
      ['Criadores de conteúdo', ['Cris']],
    ]);
  });

  it('"viu hoje" no fuso de quem olha', () => {
    const agora = new Date('2026-11-17T15:00:00Z');
    expect(viewedToday('2026-11-17T12:12:00Z', agora, 'America/Cuiaba')).toBe(true);
    expect(viewedToday('2026-11-17T03:00:00Z', agora, 'America/Cuiaba')).toBe(false);
    expect(viewedToday(null, agora, 'America/Cuiaba')).toBe(false);
  });

  it('a linha de quem olhou, aberto e negado', () => {
    const agora = new Date('2026-11-17T15:00:00Z');
    expect(
      accessLogLine(
        {
          at: '2026-11-17T13:12:00Z',
          action: 'x',
          scope: 'WORKOUT',
          denied: false,
          professionalName: 'Helena Prado',
          groupId: 'g1',
        },
        agora,
        'America/Sao_Paulo',
      ),
    ).toBe('Helena Prado abriu Treino · hoje 10:12');
    expect(
      accessLogLine(
        {
          at: '2026-11-16T21:40:00Z',
          action: 'x',
          scope: 'NUTRITION',
          denied: true,
          professionalName: null,
          groupId: 'g1',
        },
        agora,
        'America/Sao_Paulo',
      ),
    ).toBe('Alguém que saiu do Fatia tentou ver Alimentação · negado · ontem 18:40');
  });
});

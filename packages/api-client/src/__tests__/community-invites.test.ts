import { describe, expect, it } from 'vitest';
import type { PanelMember } from '../community-admin';
import {
  accompanyOptions,
  filterPanelMembers,
  invitedAgoLabel,
  inviteOriginLabel,
  inviteStatusLabel,
  inviteValidityLabel,
  inviteValidityNote,
  joinedViaLabel,
  memberTabCounts,
  memberViaOptions,
  paginate,
  pageRangeLabel,
  resendResultMessage,
  SMALL_SAMPLE,
  whatsappChatHref,
  whatsappHref,
  whatsappInviteMessage,
} from '../community-invites';

const AGORA = new Date('2026-11-19T15:00:00.000Z');

const membro = (extra: Partial<PanelMember>): PanelMember => ({
  membershipId: 'm1',
  name: 'Ana Dias',
  role: 'MEMBER',
  status: 'ACTIVE',
  joinedAt: '2026-09-10T12:00:00.000Z',
  scopesGrantedToMe: [],
  hasAiSeat: false,
  joinedVia: null,
  accompaniedBy: null,
  leftAt: null,
  whatsapp: null,
  ...extra,
});

describe('origem e validade do convite (#401)', () => {
  it('nomes das origens, e "Sem origem" para quem não tem', () => {
    expect(inviteOriginLabel('QR')).toBe('QR · recepção');
    expect(inviteOriginLabel('REFERRAL')).toBe('Indicação');
    expect(inviteOriginLabel('EMAIL_LIST')).toBe('Lista de e-mails');
    expect(inviteOriginLabel(null)).toBe('Sem origem');
  });

  it('"Entrou por": o nome do link vence; depois a origem; depois o caminho', () => {
    expect(
      joinedViaLabel(
        membro({ joinedVia: { via: 'INVITE', inviteId: 'i1', label: 'Recepção', origin: 'QR' } }),
      ),
    ).toBe('Recepção');
    expect(
      joinedViaLabel(
        membro({ joinedVia: { via: 'INVITE', inviteId: 'i1', label: null, origin: 'INSTAGRAM' } }),
      ),
    ).toBe('Instagram');
    expect(
      joinedViaLabel(
        membro({ joinedVia: { via: 'PAGE', inviteId: null, label: null, origin: null } }),
      ),
    ).toBe('Página da comunidade');
    expect(joinedViaLabel(membro({ joinedVia: null }))).toBe('—');
  });

  it('status do convite em palavras', () => {
    expect(inviteStatusLabel('active')).toBe('ativo');
    expect(inviteStatusLabel('expired')).toBe('expirado');
    expect(inviteStatusLabel('revoked')).toBe('revogado');
    expect(inviteStatusLabel('used')).toBe('usado');
    expect(inviteStatusLabel('declined')).toBe('recusado');
  });

  it('validade: sem prazo, até a data, ou quando expirou', () => {
    expect(inviteValidityLabel({ expiresAt: null, status: 'active' })).toBe('sem prazo');
    expect(inviteValidityLabel({ expiresAt: '2026-11-30T15:00:00.000Z', status: 'active' })).toBe(
      'até 30 nov',
    );
    expect(inviteValidityLabel({ expiresAt: '2026-11-10T15:00:00.000Z', status: 'expired' })).toBe(
      'expirou 10 nov',
    );
  });

  it('a nota muda com o tipo: e-mail vence em 30 dias; link pode não ter prazo', () => {
    expect(inviteValidityNote('email')).toBe('Convite por e-mail vale uma vez, por até 30 dias.');
    expect(inviteValidityNote('link')).toContain('sem prazo');
  });

  it('"convidado há": dias inteiros', () => {
    expect(invitedAgoLabel('2026-11-17T12:00:00.000Z', AGORA)).toBe('2 dias');
    expect(invitedAgoLabel('2026-11-18T14:00:00.000Z', AGORA)).toBe('1 dia');
    expect(invitedAgoLabel('2026-11-19T10:00:00.000Z', AGORA)).toBe('hoje');
  });

  it('amostra pequena tem um texto só', () => {
    expect(SMALL_SAMPLE).toBe('amostra pequena demais para mostrar');
  });
});

describe('WhatsApp: só mensagem pronta (#338 etapa 1)', () => {
  it('mensagem com o nome da comunidade e o link, e o link do wa.me codificado', () => {
    const msg = whatsappInviteMessage('Academia Demo', 'https://fat.ia.br/c/abc');
    expect(msg).toBe(
      'Oi! Entra na Academia Demo no Fatia para acompanhar seus treinos com a equipe: https://fat.ia.br/c/abc',
    );
    expect(whatsappHref(msg)).toBe(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  });

  it('conversa com o número da pessoa: só dígitos, com 55 quando falta o país', () => {
    expect(whatsappChatHref('(65) 99812-3456')).toBe('https://wa.me/5565998123456');
    expect(whatsappChatHref('+55 65 99812-3456')).toBe('https://wa.me/5565998123456');
    expect(whatsappChatHref('abc')).toBeNull();
  });
});

describe('lista de membros (Pn-04)', () => {
  const lista = [
    membro({
      membershipId: 'a',
      name: 'Ana Dias',
      accompaniedBy: { membershipId: 'h', name: 'Helena' },
    }),
    membro({ membershipId: 'b', name: 'Marcos Reis', status: 'INVITED' }),
    membro({
      membershipId: 'c',
      name: 'Diego Lima',
      joinedVia: { via: 'INVITE', inviteId: 'i1', label: 'Recepção', origin: 'QR' },
    }),
    membro({ membershipId: 'd', name: 'Elisa Rocha', status: 'LEFT' }),
    membro({ membershipId: 'h', name: 'Helena', role: 'PROFESSIONAL' }),
    membro({ membershipId: 'o', name: 'Bruno Dono', role: 'OWNER' }),
  ];

  it('abas: todos sem quem saiu; aguardando; sem acompanhamento (só membro ativo); saíram', () => {
    expect(filterPanelMembers(lista, { tab: 'all' }).map((m) => m.membershipId)).toEqual([
      'a',
      'b',
      'c',
      'h',
      'o',
    ]);
    expect(filterPanelMembers(lista, { tab: 'pending' }).map((m) => m.membershipId)).toEqual(['b']);
    expect(filterPanelMembers(lista, { tab: 'unassigned' }).map((m) => m.membershipId)).toEqual([
      'c',
    ]);
    expect(filterPanelMembers(lista, { tab: 'left' }).map((m) => m.membershipId)).toEqual(['d']);
  });

  it('busca sem acento e filtro "Entrou por"', () => {
    expect(filterPanelMembers(lista, { tab: 'all', q: 'diego' }).map((m) => m.name)).toEqual([
      'Diego Lima',
    ]);
    expect(filterPanelMembers(lista, { tab: 'all', q: 'élisa' })).toEqual([]);
    expect(
      filterPanelMembers(lista, { tab: 'all', via: 'Recepção' }).map((m) => m.membershipId),
    ).toEqual(['c']);
    expect(memberViaOptions(lista)).toEqual(['Recepção']);
  });

  it('"Distribuir" da Equipe filtra quem a pessoa acompanha (#404)', () => {
    expect(
      filterPanelMembers(lista, { tab: 'all', accompaniedBy: 'h' }).map((m) => m.membershipId),
    ).toEqual(['a']);
  });

  it('contagens das abas', () => {
    expect(memberTabCounts(lista)).toEqual({ all: 5, pending: 1, unassigned: 1, left: 1 });
  });

  it('quem pode acompanhar: profissional e dono ativos', () => {
    expect(accompanyOptions(lista).map((m) => m.name)).toEqual(['Helena', 'Bruno Dono']);
  });

  it('páginas: "1–10 de 48"', () => {
    const itens = Array.from({ length: 48 }, (_, i) => i);
    const p = paginate(itens, 1, 10);
    expect(p).toMatchObject({ page: 1, pages: 5, from: 1, to: 10, total: 48 });
    expect(pageRangeLabel(p)).toBe('1–10 de 48');
    const ultima = paginate(itens, 9, 10);
    expect(ultima).toMatchObject({ page: 5, from: 41, to: 48 });
    expect(ultima.items).toHaveLength(8);
    expect(pageRangeLabel(paginate([], 1, 10))).toBe('0 de 0');
  });

  it('resultado do reenvio em lote em uma frase', () => {
    expect(
      resendResultMessage({
        sent: [
          { id: 'a', emailSent: true },
          { id: 'b', emailSent: true },
        ],
        skipped: [],
      }),
    ).toBe('2 convites reenviados');
    expect(
      resendResultMessage({
        sent: [{ id: 'a', emailSent: true }],
        skipped: [
          { id: 'b', reason: 'too_soon' },
          { id: 'c', reason: 'limit' },
        ],
      }),
    ).toBe('1 convite reenviado · 2 não saíram (cedo demais ou no limite de envios)');
  });
});

describe('motivos novos do lote (revisão #401)', () => {
  it('recusou há pouco e teto de envios por e-mail', async () => {
    const { batchSkipLabel } = await import('../community-panel');
    expect(batchSkipLabel('declined')).toBe('recusou há menos de 30 dias');
    expect(batchSkipLabel('limit')).toBe('já recebeu 5 convites em 30 dias');
  });
});

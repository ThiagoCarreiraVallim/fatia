import { describe, expect, it } from 'vitest';
import {
  activeCommunityTab,
  commentProblem,
  commentsLabel,
  communityTabs,
  postProblem,
  relativeTime,
  removedNotice,
  reportSummary,
} from '../community-feed';

describe('mural da comunidade (helpers)', () => {
  const agora = new Date('2026-10-18T15:00:00Z');

  it('tempo relativo: agora, minutos, horas, ontem e data', () => {
    expect(relativeTime('2026-10-18T14:59:30Z', agora)).toBe('agora');
    expect(relativeTime('2026-10-18T14:55:00Z', agora)).toBe('há 5 min');
    expect(relativeTime('2026-10-18T12:00:00Z', agora)).toBe('há 3 h');
    expect(relativeTime('2026-10-17T10:00:00Z', agora)).toBe('ontem');
    expect(relativeTime('2026-10-12T10:00:00Z', agora)).toBe('12 out');
    expect(relativeTime('2025-10-12T10:00:00Z', agora)).toBe('12 out 2025');
    // Relógio do aparelho adiantado não vira "há -2 min".
    expect(relativeTime('2026-10-18T15:02:00Z', agora)).toBe('agora');
  });

  it('post precisa de texto ou imagem, e respeita os limites', () => {
    expect(postProblem('  ', 0)).toBe('Escreva algo ou escolha uma imagem.');
    expect(postProblem('', 1)).toBeNull();
    expect(postProblem('oi', 0)).toBeNull();
    expect(postProblem('x'.repeat(2001), 0)).toBe('O post tem até 2000 caracteres.');
    expect(postProblem('oi', 5)).toBe('Até 4 imagens por post.');
  });

  it('comentário não vazio e até 500', () => {
    expect(commentProblem(' ')).toBe('Escreva o comentário.');
    expect(commentProblem('x'.repeat(501))).toBe('O comentário tem até 500 caracteres.');
    expect(commentProblem('boa')).toBeNull();
  });

  it('rótulos de comentários e aviso de removido', () => {
    expect(commentsLabel(0)).toBe('Comentar');
    expect(commentsLabel(1)).toBe('1 comentário');
    expect(commentsLabel(3)).toBe('3 comentários');
    expect(removedNotice(null)).toBe('Removido pela equipe. Só você vê este post.');
    expect(removedNotice('HARASSMENT')).toBe(
      'Removido pela equipe: assédio ou ataque a alguém. Só você vê este post.',
    );
  });

  it('resumo da denúncia: o motivo mais citado primeiro', () => {
    expect(reportSummary({ count: 3, reasons: { SPAM: 1, OFFENSIVE: 2 } })).toBe(
      '3 denúncias: ofensivo (2), spam ou propaganda (1)',
    );
    expect(reportSummary({ count: 1, reasons: { OTHER: 1 } })).toBe('1 denúncia: outro motivo (1)');
  });

  it('abas da comunidade: o mural é a raiz, sem aba Início, na web e no app', () => {
    expect(communityTabs('g1').map((t) => [t.tab, t.label, t.href])).toEqual([
      ['feed', 'Mural', '/community/g1'],
      ['challenges', 'Desafios', '/community/g1/challenges'],
      ['content', 'Planos e dicas', '/community/g1/content'],
    ]);
    expect(activeCommunityTab('/community/g1')).toBe('feed');
    // O caminho antigo do mural (avisos, links salvos) ainda conta como mural.
    expect(activeCommunityTab('/community/g1/feed')).toBe('feed');
    expect(activeCommunityTab('/community/g1/challenges/c1?x=1')).toBe('challenges');
    expect(activeCommunityTab('/community/g1/content/plans/t1')).toBe('content');
  });
});

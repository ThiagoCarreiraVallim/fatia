import { describe, expect, it } from 'vitest';
import { isKnownRoute, routeInfo } from '../navigation';
import { notificationTarget } from '../notifications';
import {
  reviewLine,
  feedbackBodyLength,
  FEEDBACK_BODY_MAX,
  riskAtRiskHref,
  riskDaysOptions,
} from '../review-queue';

/** Correções da revisão adversarial da #399 (F6, F8 e F9). */
describe('para revisar: correções da revisão (#399)', () => {
  it('F6: o aviso diário leva a um caminho que o toque aceita, a aba Em risco', () => {
    const url = riskAtRiskHref('g1');
    expect(url).toBe('/org/g1/review/at-risk');
    expect(notificationTarget({ url })).toBe(url);
    expect(isKnownRoute(url)).toBe(true);
    expect(routeInfo(url).parent).toBe('/org/g1');
  });

  it('F8: o limite do comentário conta code points, como a API e o banco', () => {
    expect(feedbackBodyLength('💪'.repeat(FEEDBACK_BODY_MAX))).toBe(FEEDBACK_BODY_MAX);
    expect(feedbackBodyLength('  oi  ')).toBe(2);
    expect(feedbackBodyLength('❤️')).toBe(2);
  });

  it('F9: as opções vão de 3 a 60 e sempre trazem o valor atual', () => {
    const base = riskDaysOptions(7);
    expect(base[0]).toBe(3);
    expect(base.at(-1)).toBe(60);
    expect(riskDaysOptions(45)).toContain(45);
    expect(riskDaysOptions(33)).toContain(33);
    const com33 = riskDaysOptions(33);
    expect([...com33].sort((a, b) => a - b)).toEqual(com33);
  });

  it('passada visual: a rota do Em risco tem o próprio título', () => {
    expect(routeInfo('/org/g1/review/at-risk').title).toBe('Em risco');
  });

  it('passada visual: treino sem série não diz "0 séries"', () => {
    const base = {
      kind: 'WORKOUT' as const,
      refId: 's1',
      membershipId: 'm1',
      name: 'Diego Lima',
      at: '2026-11-18T21:54:00.000Z',
      title: null,
      durationMinutes: 45,
      answer: null,
      shares: [],
      whatsapp: null,
      seenAt: null,
      myFeedback: false,
    };
    expect(reviewLine({ ...base, sets: 0 })).toBe('Treino livre · 45 min');
    expect(reviewLine({ ...base, sets: 1 })).toBe('Treino livre · 45 min · 1 série');
  });
});

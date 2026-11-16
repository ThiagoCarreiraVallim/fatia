import { SESSION_KINDS, sessionKind, sessionKindWhere } from '../helpers/session-kind';

/**
 * O tipo da sessão no histórico (#381): plano, circuito ou livre. Derivado,
 * sem coluna nem enum de "cardio" — cardio é exercício, não tipo de treino.
 */
describe('sessionKind', () => {
  it('sessão com plano é "plan"', () => {
    expect(sessionKind({ planId: 'p1' })).toBe('plan');
  });

  it('sessão de um plano já apagado segue "plan" pelo retrato', () => {
    expect(sessionKind({ planId: null, fromPlan: true })).toBe('plan');
  });

  it('sessão sem plano é treino livre, inclusive a só de esteira', () => {
    expect(sessionKind({ planId: null })).toBe('free');
  });

  it('os tipos são exatamente os três do histórico (Al-T10), sem "cardio"', () => {
    expect([...SESSION_KINDS]).toEqual(['plan', 'circuit', 'free']);
  });
});

describe('sessionKindWhere', () => {
  it('plano filtra quem tem planId ou o retrato de plano', () => {
    expect(sessionKindWhere('plan')).toEqual({
      OR: [{ planId: { not: null } }, { fromPlan: true }],
    });
  });

  it('livre filtra quem não tem plano nem o retrato', () => {
    expect(sessionKindWhere('free')).toEqual({ planId: null, fromPlan: false });
  });

  it('circuito ainda não casa nada (a sessão de circuito chega com a #380)', () => {
    expect(sessionKindWhere('circuit')).toEqual({ id: { in: [] } });
  });

  it('sem filtro não restringe', () => {
    expect(sessionKindWhere(undefined)).toEqual({});
  });
});

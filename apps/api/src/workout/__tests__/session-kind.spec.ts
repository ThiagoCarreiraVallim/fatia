import { SESSION_KINDS, sessionKind, sessionKindWhere } from '../helpers/session-kind';

/**
 * O tipo da sessão no histórico (#381): plano, circuito ou livre. Derivado,
 * sem coluna nem enum de "cardio" — cardio é exercício, não tipo de treino.
 */
describe('sessionKind', () => {
  it('sessão com plano é "plan"', () => {
    expect(sessionKind({ planId: 'p1' })).toBe('plan');
  });

  it('sessão sem plano é treino livre, inclusive a só de esteira', () => {
    expect(sessionKind({ planId: null })).toBe('free');
  });

  it('os tipos são exatamente os três do histórico (Al-T10), sem "cardio"', () => {
    expect([...SESSION_KINDS]).toEqual(['plan', 'circuit', 'free']);
  });
});

describe('sessionKindWhere', () => {
  it('plano filtra quem tem planId', () => {
    expect(sessionKindWhere('plan')).toEqual({ planId: { not: null } });
  });

  it('livre filtra quem não tem plano', () => {
    expect(sessionKindWhere('free')).toEqual({ planId: null });
  });

  it('circuito ainda não casa nada (a sessão de circuito chega com a #380)', () => {
    expect(sessionKindWhere('circuit')).toEqual({ id: { in: [] } });
  });

  it('sem filtro não restringe', () => {
    expect(sessionKindWhere(undefined)).toEqual({});
  });
});

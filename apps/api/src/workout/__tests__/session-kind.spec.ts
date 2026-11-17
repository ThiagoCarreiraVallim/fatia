import { Prisma } from '@prisma/client';
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

  it('sessão com o circuito congelado é "circuit", mesmo vinda de um plano (#380)', () => {
    expect(sessionKind({ planId: 'p1', fromPlan: true, circuit: { version: 1 } })).toBe('circuit');
    expect(sessionKind({ planId: null, fromPlan: true, circuit: { version: 1 } })).toBe('circuit');
    expect(sessionKind({ planId: 'p1', fromPlan: true, circuit: null })).toBe('plan');
  });

  it('sessão sem plano é treino livre, inclusive a só de esteira', () => {
    expect(sessionKind({ planId: null })).toBe('free');
  });

  it('os tipos são exatamente os três do histórico (Al-T10), sem "cardio"', () => {
    expect([...SESSION_KINDS]).toEqual(['plan', 'circuit', 'free']);
  });
});

describe('sessionKindWhere', () => {
  it('plano filtra quem tem planId ou o retrato de plano, sem circuito', () => {
    expect(sessionKindWhere('plan')).toEqual({
      OR: [{ planId: { not: null } }, { fromPlan: true }],
      circuit: { equals: Prisma.AnyNull },
    });
  });

  it('livre filtra quem não tem plano nem o retrato nem circuito', () => {
    expect(sessionKindWhere('free')).toEqual({
      planId: null,
      fromPlan: false,
      circuit: { equals: Prisma.AnyNull },
    });
  });

  it('circuito filtra quem tem o circuito congelado (#380)', () => {
    expect(sessionKindWhere('circuit')).toEqual({ circuit: { not: Prisma.AnyNull } });
  });

  it('sem filtro não restringe', () => {
    expect(sessionKindWhere(undefined)).toEqual({});
  });
});
